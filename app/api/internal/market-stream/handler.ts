import { MarketIngestionSchemaUnavailableError, requireMarketIngestionSchema } from "../../../d1-schema.ts";
import { createMarketStore } from "../../../market-store.ts";
import {
  ingestMarketPriorityProjection,
  ingestMarketStreamBatch,
  MarketStreamIngestionError,
} from "../../../market-stream-receiver.ts";
import { verifySitesIngestionRequest } from "../../../../services/market-stream/src/auth.ts";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export type IngestionEnv = {
  DB?: D1Database;
  SITES_INGESTION_SECRET?: string;
  /** Optional overlap key for zero-downtime HMAC rotation. */
  SITES_INGESTION_SECRET_PREVIOUS?: string;
  /** Epoch milliseconds after which the overlap key is ignored. */
  SITES_INGESTION_SECRET_PREVIOUS_VALID_UNTIL?: string;
  SITES_INGESTION_AUDIENCE?: string;
};

const strongSecret = (value: string | undefined) =>
  typeof value === "string" && new TextEncoder().encode(value).byteLength >= 32;

export async function handleMarketStreamPost(request: Request, runtime: IngestionEnv, now = Date.now()) {
  if (!runtime.DB || !strongSecret(runtime.SITES_INGESTION_SECRET) || !runtime.SITES_INGESTION_AUDIENCE?.trim() ||
    (runtime.SITES_INGESTION_SECRET_PREVIOUS != null && !strongSecret(runtime.SITES_INGESTION_SECRET_PREVIOUS))) {
    return Response.json({ error: "INGESTION_NOT_CONFIGURED" }, { status: 503, headers: HEADERS });
  }
  try {
    // Fail before nonce admission or payload work if production migrations have
    // not installed the receiver contract. This check is read-only and cached.
    await requireMarketIngestionSchema(runtime.DB);
    const store = createMarketStore(runtime.DB);
    const previousValidUntil = Number(runtime.SITES_INGESTION_SECRET_PREVIOUS_VALID_UNTIL);
    const previousEnabled = strongSecret(runtime.SITES_INGESTION_SECRET_PREVIOUS) &&
      Number.isSafeInteger(previousValidUntil) && previousValidUntil >= now;
    const secrets = [runtime.SITES_INGESTION_SECRET, previousEnabled ? runtime.SITES_INGESTION_SECRET_PREVIOUS : undefined]
      .filter((secret): secret is string => typeof secret === "string");
    let verified: Awaited<ReturnType<typeof verifySitesIngestionRequest>> = { ok: false, reason: "SIGNATURE_INVALID" };
    for (const secret of secrets) {
      verified = await verifySitesIngestionRequest({
        request: request.clone(),
        secret,
        audience: runtime.SITES_INGESTION_AUDIENCE,
        now,
        nonces: { rememberOnce: (nonce, expiresAt) => store.rememberOnce(nonce, expiresAt, now) },
      });
      if (verified.ok || verified.reason !== "SIGNATURE_INVALID") break;
    }
    if (!verified.ok) {
      const status = verified.reason === "BODY_TOO_LARGE" ? 413 : verified.reason === "REPLAY" ? 409 : 401;
      return Response.json({ error: `INGESTION_AUTH_${verified.reason}` }, { status, headers: HEADERS });
    }
    let payload: unknown;
    try { payload = JSON.parse(verified.body); } catch { throw new MarketStreamIngestionError("INGESTION_JSON_INVALID"); }
    const requestType = payload != null && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).requestType
      : null;
    const priority = requestType === "PRIORITY_QUOTE_PROJECTION" || requestType === "PRIORITY_STATE_PROJECTION";
    return Response.json(priority
      ? await ingestMarketPriorityProjection(runtime.DB, payload, now)
      : await ingestMarketStreamBatch(runtime.DB, payload, now), { headers: HEADERS });
  } catch (error) {
    if (error instanceof MarketIngestionSchemaUnavailableError) {
      return Response.json({ error: error.code }, { status: error.status, headers: HEADERS });
    }
    if (error instanceof MarketStreamIngestionError) {
      return Response.json({ error: error.code }, { status: error.status, headers: HEADERS });
    }
    console.error("market stream ingestion failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "INGESTION_UNAVAILABLE" }, { status: 503, headers: HEADERS });
  }
}
