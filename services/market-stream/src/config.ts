import type { AlpacaFeed, MarketStreamEnv } from "./contracts.ts";

const PLACEHOLDER = /replace|example\.(?:com|test)|changeme|placeholder/i;
export const PRODUCTION_SITES_INGESTION_URL = "https://aperture-nvda-plan.rmiller62785.chatgpt.site/api/internal/market-stream";
const SITES_INGESTION_PATH = "/api/internal/market-stream";
const MINIMUM_APP_SECRET_BYTES = 32;

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

function strongSecret(value: string | null | undefined, name: string) {
  const secret = required(value, name);
  if (new TextEncoder().encode(secret).byteLength < MINIMUM_APP_SECRET_BYTES) throw new Error(`${name}_TOO_SHORT`);
  return secret;
}

function validIngestionUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SITES_INGESTION_URL_INVALID");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== SITES_INGESTION_PATH) {
    throw new Error("SITES_INGESTION_URL_NOT_ALLOWED");
  }
  const localDevelopment = (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
    (parsed.protocol === "http:" || parsed.protocol === "https:");
  if (parsed.href !== PRODUCTION_SITES_INGESTION_URL && !localDevelopment) throw new Error("SITES_INGESTION_URL_NOT_ALLOWED");
  return parsed.href;
}

export function validateMarketStreamEnv(env: MarketStreamEnv) {
  const feed = resolveAlpacaFeed(env.ALPACA_FEED);
  required(env.APCA_API_KEY_ID, "APCA_API_KEY_ID");
  required(env.APCA_API_SECRET_KEY, "APCA_API_SECRET_KEY");
  const ingestionUrl = required(env.SITES_INGESTION_URL, "SITES_INGESTION_URL");
  validIngestionUrl(ingestionUrl);
  strongSecret(env.SITES_INGESTION_SECRET, "SITES_INGESTION_SECRET");
  required(env.SITES_INGESTION_AUDIENCE, "SITES_INGESTION_AUDIENCE");
  required(env.SITES_ACCESS_BYPASS_TOKEN, "SITES_ACCESS_BYPASS_TOKEN");
  strongSecret(env.STREAM_CONTROL_SECRET, "STREAM_CONTROL_SECRET");
  strongSecret(env.BROWSER_ACCESS_SECRET, "BROWSER_ACCESS_SECRET");
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
