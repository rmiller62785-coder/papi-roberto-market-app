import type { AlpacaFeed, MarketStreamEnv } from "./contracts.ts";

const PLACEHOLDER = /replace|example\.(?:com|test)|changeme|placeholder/i;

export function resolveAlpacaFeed(value: string | null | undefined): AlpacaFeed {
  const normalized = value?.trim().toLowerCase() || "iex";
  if (normalized !== "iex" && normalized !== "sip") throw new Error("ALPACA_FEED_INVALID");
  return normalized;
}

function required(value: string | null | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name}_REQUIRED`);
  if (PLACEHOLDER.test(value)) throw new Error(`${name}_PLACEHOLDER_FORBIDDEN`);
  return value.trim();
}

export function validateMarketStreamEnv(env: MarketStreamEnv) {
  const feed = resolveAlpacaFeed(env.ALPACA_FEED);
  required(env.APCA_API_KEY_ID, "APCA_API_KEY_ID");
  required(env.APCA_API_SECRET_KEY, "APCA_API_SECRET_KEY");
  const ingestionUrl = required(env.SITES_INGESTION_URL, "SITES_INGESTION_URL");
  const parsed = new URL(ingestionUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("SITES_INGESTION_URL_HTTPS_REQUIRED");
  required(env.SITES_INGESTION_SECRET, "SITES_INGESTION_SECRET");
  required(env.SITES_INGESTION_AUDIENCE, "SITES_INGESTION_AUDIENCE");
  required(env.STREAM_CONTROL_SECRET, "STREAM_CONTROL_SECRET");
  required(env.BROWSER_ACCESS_SECRET, "BROWSER_ACCESS_SECRET");
  const origins = required(env.BROWSER_ALLOWED_ORIGINS, "BROWSER_ALLOWED_ORIGINS")
    .split(",")
    .map((item) => new URL(item.trim()).origin);
  if (feed === "sip" && env.SIP_ENTITLED?.trim().toLowerCase() !== "true") throw new Error("SIP_ENTITLEMENT_CONFIRMATION_REQUIRED");
  const maximumBrowserClients = env.MAX_BROWSER_CLIENTS == null ? 100 : Number(env.MAX_BROWSER_CLIENTS);
  if (!Number.isSafeInteger(maximumBrowserClients) || maximumBrowserClients < 1 || maximumBrowserClients > 100) {
    throw new Error("MAX_BROWSER_CLIENTS_INVALID");
  }
  return { feed, origins, maximumBrowserClients };
}

export function originAllowed(origin: string | null, allowedOrigins: string[]) {
  if (!origin) return false;
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}
