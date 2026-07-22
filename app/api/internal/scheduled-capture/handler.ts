import { archiveD1MarketStreamPrefix, type D1MarketArchiveRun } from "../../../d1-market-archive.ts";
import {
  MarketIngestionSchemaUnavailableError,
  ensureMooSafetySchemaOnce,
  requireMarketIngestionSchema,
} from "../../../d1-schema.ts";
import { createMarketStore } from "../../../market-store.ts";
import {
  createD1ScheduledCaptureStore,
  runScheduledCapture,
  type ScheduledCaptureResult,
} from "../../../scheduled-capture.ts";
import type { R2ArchiveBucket } from "../../../r2-market-archive.ts";
import {
  CAPTURE_SCHEDULER_MAX_SKEW_MS,
  isCaptureTriggerBody,
  verifyCaptureSchedulerRequest,
} from "../../../../services/capture-scheduler/src/auth.ts";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export type CaptureRouteEnv = {
  DB?: D1Database;
  ARCHIVE?: R2ArchiveBucket;
  CAPTURE_SCHEDULER_SECRET?: string;
  CAPTURE_SCHEDULER_AUDIENCE?: string;
};

type HandlerDependencies = {
  requireSchema(database: D1Database): Promise<void>;
  ensureSchema(database: D1Database, readyAt: number): Promise<void>;
  rememberOnce(database: D1Database, nonce: string, expiresAt: number, now: number): Promise<boolean>;
  runCapture(input: Parameters<typeof runScheduledCapture>[0]): Promise<ScheduledCaptureResult>;
  archivePrefix(input: Parameters<typeof archiveD1MarketStreamPrefix>[0]): Promise<D1MarketArchiveRun>;
};

const defaults: HandlerDependencies = {
  requireSchema: requireMarketIngestionSchema,
  ensureSchema: (database, readyAt) => ensureMooSafetySchemaOnce(database, readyAt),
  rememberOnce: (database, nonce, expiresAt, now) => createMarketStore(database).rememberOnce(nonce, expiresAt, now),
  runCapture: runScheduledCapture,
  archivePrefix: archiveD1MarketStreamPrefix,
};

const strongSecret = (value: string | undefined): value is string =>
  typeof value === "string" && new TextEncoder().encode(value).byteLength >= 32;

function minuteBoundary(now: number) {
  return Math.floor(now / 60_000) * 60_000;
}

export async function handleScheduledCapturePost(
  request: Request,
  runtime: CaptureRouteEnv,
  input: {
    now?: number;
    fetchApp(path: string): Promise<Response>;
    dependencies?: Partial<HandlerDependencies>;
  },
) {
  const now = input.now ?? Date.now();
  const secret = runtime.CAPTURE_SCHEDULER_SECRET;
  const audience = runtime.CAPTURE_SCHEDULER_AUDIENCE;
  if (!runtime.DB || !runtime.ARCHIVE || !strongSecret(secret) || typeof audience !== "string" ||
      !/^[A-Za-z0-9._:-]{8,128}$/.test(audience)) {
    return Response.json({ error: "CAPTURE_SCHEDULER_NOT_CONFIGURED" }, { status: 503, headers: HEADERS });
  }
  const dependencies = { ...defaults, ...input.dependencies };
  try {
    // This read-only schema requirement must pass before an authentication nonce
    // can be atomically admitted. Schema mutation remains behind successful auth.
    await dependencies.requireSchema(runtime.DB);
    const verified = await verifyCaptureSchedulerRequest({
      request,
      secret,
      audience,
      now,
      maximumClockSkewMs: CAPTURE_SCHEDULER_MAX_SKEW_MS,
      nonces: {
        rememberOnce: (nonce, expiresAt) => dependencies.rememberOnce(runtime.DB!, nonce, expiresAt, now),
      },
    });
    if (!verified.ok) {
      const status = verified.reason === "BODY_TOO_LARGE" ? 413 : verified.reason === "REPLAY" ? 409 : 401;
      return Response.json({ error: `CAPTURE_SCHEDULER_AUTH_${verified.reason}` }, { status, headers: HEADERS });
    }
    if (!isCaptureTriggerBody(verified.body)) {
      return Response.json({ error: "CAPTURE_SCHEDULER_PAYLOAD_INVALID" }, { status: 400, headers: HEADERS });
    }

    const scheduledTime = minuteBoundary(now);
    await dependencies.ensureSchema(runtime.DB, now);
    const store = createD1ScheduledCaptureStore(runtime.DB);
    const capture = dependencies.runCapture({
      scheduledTime,
      // Tests may inject a fixed clock, but production must let
      // runScheduledCapture sample capture time after its internal market
      // request completes. Pinning nowMs to the bridge-request timestamp can
      // put freshly normalized provenance a few milliseconds after capturedAt
      // and correctly trip the point-in-time persistence guard.
      nowMs: input.now,
      fetchApp: input.fetchApp,
      store,
    });
    const archive = (async () => {
      const segments: D1MarketArchiveRun[] = [];
      for (let segment = 0; segment < 4; segment += 1) {
        const result = await dependencies.archivePrefix({
          database: runtime.DB!,
          bucket: runtime.ARCHIVE!,
          sealedAt: scheduledTime,
          maximumRows: 5_000,
        });
        segments.push(result);
        if (result.status === "EMPTY") break;
      }
      return segments;
    })();
    const [captureResult, archiveResults] = await Promise.all([capture, archive]);
    return Response.json({
      ok: true,
      scheduledTime,
      capture: captureResult,
      archive: archiveResults,
    }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof MarketIngestionSchemaUnavailableError) {
      return Response.json({ error: error.code }, { status: error.status, headers: HEADERS });
    }
    console.error("scheduled capture bridge failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "CAPTURE_SCHEDULER_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }
}
