import { MarketIngestionSchemaUnavailableError, requireMarketIngestionSchema } from "../../../d1-schema.ts";
import { createMarketStore } from "../../../market-store.ts";
import { ingestMarketStreamBatch, MarketStreamIngestionError } from "../../../market-stream-receiver.ts";
import { verifySitesIngestionRequest } from "../../../../services/market-stream/src/auth.ts";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export type IngestionEnv = {
  DB?: D1Database;
  SITES_INGESTION_SECRET?: string;
  SITES_INGESTION_AUDIENCE?: string;
};

export async function handleMarketStreamPost(request: Request, runtime: IngestionEnv, now = Date.now()) {
  if (!runtime.DB || !runtime.SITES_INGESTION_SECRET?.trim() || !runtime.SITES_INGESTION_AUDIENCE?.trim()) {
    return Response.json({ error: "INGESTION_NOT_CONFIGURED" }, { status: 503, headers: HEADERS });
  }
  try {
    // Fail before nonce admission or payload work if production migrations have
    // not installed the receiver contract. This check is read-only and cached.
    await requireMarketIngestionSchema(runtime.DB);
    const store = createMarketStore(runtime.DB);
    const verified = await verifySitesIngestionRequest({
      request,
      secret: runtime.SITES_INGESTION_SECRET,
      audience: runtime.SITES_INGESTION_AUDIENCE,
      now,
      nonces: { rememberOnce: (nonce, expiresAt) => store.rememberOnce(nonce, expiresAt, now) },
    });
    if (!verified.ok) {
      const status = verified.reason === "BODY_TOO_LARGE" ? 413 : verified.reason === "REPLAY" ? 409 : 401;
      return Response.json({ error: `INGESTION_AUTH_${verified.reason}` }, { status, headers: HEADERS });
    }
    let payload: unknown;
    try { payload = JSON.parse(verified.body); } catch { throw new MarketStreamIngestionError("INGESTION_JSON_INVALID"); }
    return Response.json(await ingestMarketStreamBatch(runtime.DB, payload, now), { headers: HEADERS });
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
