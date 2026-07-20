const ALPACA_PAPER_ASSET_URL = "https://paper-api.alpaca.markets/v2/assets/NVDA";
const CACHE_MAX_AGE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type AlpacaAssetResponse = {
  symbol?: unknown;
  status?: unknown;
  tradable?: unknown;
  shortable?: unknown;
  borrow_status?: unknown;
  easy_to_borrow?: unknown;
};

type Credentials = {
  keyId: string;
  secretKey: string;
};

export type AlpacaBrokerStatus = {
  provider: "Alpaca Paper Trading API";
  environment: "paper";
  symbol: "NVDA";
  configured: boolean;
  assetStatus: string | null;
  tradable: boolean | null;
  shortable: boolean | null;
  borrowStatus: string | null;
  borrowStatusSource: "borrow_status" | "easy_to_borrow" | "unavailable";
  checkedAt: number;
  freshness: {
    state: "fresh" | "cached" | "stale" | "unavailable";
    ageMs: number | null;
    maxAgeMs: typeof CACHE_MAX_AGE_MS;
  };
  status: "live" | "limited" | "offline";
  detail: string;
  indicativeOnly: true;
  locateGuaranteed: false;
};

type CacheEntry = {
  value: AlpacaBrokerStatus;
  expiresAt: number;
};

type PullOptions = {
  fetcher?: typeof fetch;
  now?: number;
  credentials?: Credentials | null;
};

let cache: CacheEntry | null = null;
let inFlight: Promise<AlpacaBrokerStatus> | null = null;

function runtimeCredentials(): Credentials | null {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  const keyId = env?.APCA_API_KEY_ID?.trim();
  const secretKey = env?.APCA_API_SECRET_KEY?.trim();
  return keyId && secretKey ? { keyId, secretKey } : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function normalizeBorrowStatus(asset: AlpacaAssetResponse): {
  borrowStatus: string | null;
  borrowStatusSource: AlpacaBrokerStatus["borrowStatusSource"];
} {
  const current = stringValue(asset.borrow_status);
  if (current) return { borrowStatus: current, borrowStatusSource: "borrow_status" };
  if (asset.easy_to_borrow === true) {
    return { borrowStatus: "easy_to_borrow", borrowStatusSource: "easy_to_borrow" };
  }
  if (asset.easy_to_borrow === false) {
    return {
      borrowStatus: asset.shortable === true ? "hard_to_borrow" : "unavailable",
      borrowStatusSource: "easy_to_borrow",
    };
  }
  return { borrowStatus: null, borrowStatusSource: "unavailable" };
}

function unavailable(checkedAt: number, configured: boolean, detail: string): AlpacaBrokerStatus {
  return {
    provider: "Alpaca Paper Trading API",
    environment: "paper",
    symbol: "NVDA",
    configured,
    assetStatus: null,
    tradable: null,
    shortable: null,
    borrowStatus: null,
    borrowStatusSource: "unavailable",
    checkedAt,
    freshness: { state: "unavailable", ageMs: null, maxAgeMs: CACHE_MAX_AGE_MS },
    status: "offline",
    detail,
    indicativeOnly: true,
    locateGuaranteed: false,
  };
}

function cachedValue(value: AlpacaBrokerStatus, now: number, state: "cached" | "stale"): AlpacaBrokerStatus {
  return {
    ...value,
    freshness: {
      state,
      ageMs: Math.max(0, now - value.checkedAt),
      maxAgeMs: CACHE_MAX_AGE_MS,
    },
    status: state === "stale" ? "limited" : value.status,
    detail: state === "stale"
      ? "The latest Alpaca asset check failed; the last known asset metadata is shown as stale and remains indicative only. It is not a locate guarantee."
      : value.detail,
  };
}

export function __resetAlpacaBrokerStatusCacheForTests() {
  cache = null;
  inFlight = null;
}

export async function pullAlpacaBrokerStatus(options: PullOptions = {}): Promise<AlpacaBrokerStatus> {
  const now = Number.isFinite(options.now) ? options.now! : Date.now();
  const credentials = options.credentials === undefined ? runtimeCredentials() : options.credentials;
  if (!credentials) {
    return unavailable(
      now,
      false,
      "Alpaca paper credentials are not configured. No account, balance, order, or credential data is exposed.",
    );
  }

  if (cache && cache.expiresAt > now) return cachedValue(cache.value, now, "cached");
  if (inFlight) return inFlight;

  const fetcher = options.fetcher ?? globalThis.fetch;
  inFlight = (async () => {
    try {
      const response = await fetcher(ALPACA_PAPER_ASSET_URL, {
        headers: {
          "APCA-API-KEY-ID": credentials.keyId,
          "APCA-API-SECRET-KEY": credentials.secretKey,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const asset = await response.json() as AlpacaAssetResponse;
      if (stringValue(asset.symbol) !== "nvda") throw new Error("Unexpected asset response");

      const { borrowStatus, borrowStatusSource } = normalizeBorrowStatus(asset);
      const tradable = typeof asset.tradable === "boolean" ? asset.tradable : null;
      const shortable = typeof asset.shortable === "boolean" ? asset.shortable : null;
      const value: AlpacaBrokerStatus = {
        provider: "Alpaca Paper Trading API",
        environment: "paper",
        symbol: "NVDA",
        configured: true,
        assetStatus: stringValue(asset.status),
        tradable,
        shortable,
        borrowStatus,
        borrowStatusSource,
        checkedAt: now,
        freshness: { state: "fresh", ageMs: 0, maxAgeMs: CACHE_MAX_AGE_MS },
        status: "live",
        detail: shortable === false
          ? "Alpaca currently marks NVDA as not shortable. Asset metadata is indicative, account-specific availability may differ, and no locate is guaranteed."
          : borrowStatus === "hard_to_borrow"
            ? "Alpaca currently marks NVDA hard to borrow. A locate may be required; this asset check does not reserve or guarantee shares."
            : "Alpaca asset metadata loaded. Shortability and borrow status are indicative only, may change, and do not reserve or guarantee a locate.",
        indicativeOnly: true,
        locateGuaranteed: false,
      };
      cache = { value, expiresAt: now + CACHE_MAX_AGE_MS };
      return value;
    } catch (error) {
      if (cache) return cachedValue(cache.value, now, "stale");
      const reason = error instanceof Error ? error.message : "unknown error";
      return unavailable(
        now,
        true,
        `Alpaca paper asset metadata is temporarily unavailable (${reason}). No account, balance, order, or credential data is exposed.`,
      );
    }
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
