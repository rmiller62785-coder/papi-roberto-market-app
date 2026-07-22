import { env } from "cloudflare:workers";
import type { AlpacaBrokerStatus } from "../../../alpaca-broker-status.ts";
import { buildMooSystemStatus, readMooStreamHealth, readStrictUsSource } from "../../../moo-system-status.ts";
import { createD1MooArtifactStore } from "../../../d1-moo-artifact-store.ts";
import { validateTargetSession } from "../../../target-session.ts";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function diagnosticBrokerReference(nowMs: number): AlpacaBrokerStatus {
  return {
    provider: "Alpaca Paper Trading API",
    environment: "paper",
    symbol: "NVDA",
    configured: false,
    assetStatus: null,
    tradable: null,
    shortable: null,
    borrowStatus: null,
    borrowStatusSource: "unavailable",
    checkedAt: nowMs,
    freshness: { state: "unavailable", ageMs: null, maxAgeMs: 60_000 },
    status: "offline",
    detail: "Broker reference is intentionally loaded through the separate broker-status endpoint and never delays Strict status.",
    indicativeOnly: true,
    locateGuaranteed: false,
  };
}

export async function GET(request: Request) {
  const targetSession = new URL(request.url).searchParams.get("targetDate") ?? "";
  const nowMs = Date.now();
  const validation = validateTargetSession(targetSession, nowMs);
  if (!validation.valid) {
    return Response.json(
      { error: "INVALID_TARGET_SESSION", reason: validation.reason },
      { status: 400, headers: HEADERS },
    );
  }

  const runtime = env as unknown as { DB?: D1Database };
  const brokerReference = diagnosticBrokerReference(nowMs);
  const streamHealth = await readMooStreamHealth(runtime.DB, nowMs);
  const strictUsSource = await readStrictUsSource(runtime.DB, validation.date, nowMs, streamHealth);
  let strictArtifact = null;
  let artifactStoreState: "FOUND" | "NOT_FOUND" | "UNAVAILABLE" = "UNAVAILABLE";
  if (runtime.DB) {
    try {
      strictArtifact = await createD1MooArtifactStore(runtime.DB).getFrozen(validation.date);
      artifactStoreState = strictArtifact ? "FOUND" : "NOT_FOUND";
    } catch {
      strictArtifact = null;
      artifactStoreState = "UNAVAILABLE";
    }
  }
  return Response.json(
    buildMooSystemStatus({
      nowMs,
      targetSession: validation.date,
      brokerReference,
      streamHealth,
      strictUsSource,
      strictArtifact,
      artifactStoreState,
    }),
    { headers: HEADERS },
  );
}
