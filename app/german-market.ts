export const TRADEGATE_NVDA_URL = "https://www.tradegatebsx.com/orderbuch.php?isin=US67066G1040&lang=en";
export const TRADEGATE_NVDA_ISIN = "US67066G1040";
// Public Tradegate evidence is rejected when the displayed market is too wide
// to be a credible price-discovery midpoint. This remains far looser than a
// strict execution gate because the adapter is research-only.
export const GERMAN_MAX_SPREAD_BPS = 50;

export type GermanMarketStatus = "live" | "limited" | "offline";
export type GermanMarketSignalState = "active" | "neutral" | "unavailable";

export type GermanMarketQuote = {
  bidEur: number;
  askEur: number;
  midpointEur: number;
  spreadBps: number;
  lastEur: number | null;
  bidSize: number | null;
  askSize: number | null;
  highEur: number | null;
  lowEur: number | null;
  volume: number | null;
  changePct: number | null;
};

export type GermanMarketEvidence = {
  provider: "Tradegate BSX public page + Yahoo Finance FX/history";
  venue: "Tradegate BSX (XGAT)";
  symbol: "NVD";
  isin: "US67066G1040";
  currency: "EUR";
  status: GermanMarketStatus;
  signalState: GermanMarketSignalState;
  reason: string;
  checkedAt: number;
  providerObservedAt: number | null;
  fxObservedAt: number | null;
  previousUsCloseObservedAt: number | null;
  quote: GermanMarketQuote | null;
  eurUsd: number | null;
  impliedUsd: number | null;
  previousUsCloseUsd: number | null;
  impliedGapPct: number | null;
  signal: number;
  rangeSignal: number;
  nvdaDirection: null;
  calibrationStatus: "UNCALIBRATED";
  effectMode: "RANGE_ONLY";
  strictEligible: false;
  sourceUrl: string;
};

export type PullGermanMarketOptions = {
  targetDate: string;
  expectedPreviousSession: string;
  priorSessionCloseMs: number;
  targetOpenMs: number;
  fetcher?: typeof fetch;
  now?: number;
};

type ParsedTradegate = {
  quote: GermanMarketQuote;
  observedAt: number;
};

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

const MAX_TRADEGATE_AGE_MS = 10 * 60_000;
const MAX_FX_AGE_MS = 20 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const ACTIVE_GAP_THRESHOLD_PCT = 0.1;
const PROVIDER = "Tradegate BSX public page + Yahoo Finance FX/history" as const;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function elementText(html: string, id: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/(?:strong|td|span)>`, "i"));
  if (!match) return "";
  return match[1]
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function numeric(value: string) {
  const normalized = value.replace(/[^0-9.,+\-]/g, "").replace(/,/g, "");
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function timeZoneOffsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(+value.year, +value.month - 1, +value.day, +value.hour, +value.minute, +value.second);
  return represented - Math.floor(instant / 1000) * 1000;
}

function berlinWallTimeUtc(date: string, time: string) {
  const dateMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;
  const desired = Date.UTC(
    +dateMatch[3],
    +dateMatch[2] - 1,
    +dateMatch[1],
    +timeMatch[1],
    +timeMatch[2],
    +timeMatch[3],
  );
  let result = desired - timeZoneOffsetMs(desired, "Europe/Berlin");
  result = desired - timeZoneOffsetMs(result, "Europe/Berlin");
  return result;
}

export function parseTradegateNvdaHtml(html: string): ParsedTradegate | null {
  if (
    !html.includes(TRADEGATE_NVDA_ISIN) ||
    !/Nvidia Corp\.?/i.test(html) ||
    !/(?:>NVD<|\bNVD\b)/.test(html)
  ) return null;
  const bidEur = numeric(elementText(html, "bid"));
  const askEur = numeric(elementText(html, "ask"));
  const observedAt = berlinWallTimeUtc(elementText(html, "rt_datum"), elementText(html, "rt_zeit"));
  if (!finite(bidEur) || !finite(askEur) || bidEur <= 0 || askEur < bidEur || !finite(observedAt)) return null;
  const optional = (id: string) => numeric(elementText(html, id));
  return {
    observedAt,
    quote: {
      bidEur,
      askEur,
      midpointEur: (bidEur + askEur) / 2,
      spreadBps: ((askEur - bidEur) / ((bidEur + askEur) / 2)) * 10_000,
      lastEur: optional("last"),
      bidSize: optional("bidsize"),
      askSize: optional("asksize"),
      highEur: optional("high"),
      lowEur: optional("low"),
      volume: optional("stueck"),
      changePct: optional("delta"),
    },
  };
}

async function request(fetcher: typeof fetch, url: string, accept: string) {
  const response = await fetcher(url, {
    headers: { Accept: accept, "User-Agent": "NVDA-Opening-Research/2.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function newYorkDateKey(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

async function yahooLatestFx(fetcher: typeof fetch) {
  const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/EURUSD%3DX");
  url.searchParams.set("interval", "5m");
  url.searchParams.set("range", "2d");
  url.searchParams.set("includePrePost", "true");
  const payload = await (await request(fetcher, url.toString(), "application/json")).json() as YahooChart;
  const chart = payload.chart?.result?.[0];
  const timestamps = chart?.timestamp ?? [];
  const closes = chart?.indicators?.quote?.[0]?.close ?? [];
  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
    const close = closes[index];
    if (finite(close) && close > 0 && finite(timestamps[index])) {
      return { eurUsd: close, observedAt: timestamps[index] * 1000 };
    }
  }
  throw new Error("EUR/USD chart had no timestamped price");
}

async function yahooPreviousNvdaClose(fetcher: typeof fetch, expectedSession: string, availableAt: number) {
  const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/NVDA");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("range", "1mo");
  url.searchParams.set("events", "history");
  const payload = await (await request(fetcher, url.toString(), "application/json")).json() as YahooChart;
  const chart = payload.chart?.result?.[0];
  const timestamps = chart?.timestamp ?? [];
  const closes = chart?.indicators?.quote?.[0]?.close ?? [];
  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
    const close = closes[index];
    if (!finite(close) || close <= 0 || newYorkDateKey(timestamps[index] * 1000) !== expectedSession) continue;
    return { close, observedAt: availableAt };
  }
  throw new Error(`NVDA close for ${expectedSession} was unavailable`);
}

function baseEvidence(checkedAt: number): GermanMarketEvidence {
  return {
    provider: PROVIDER,
    venue: "Tradegate BSX (XGAT)",
    symbol: "NVD",
    isin: TRADEGATE_NVDA_ISIN,
    currency: "EUR",
    status: "offline",
    signalState: "unavailable",
    reason: "Tradegate research evidence is unavailable.",
    checkedAt,
    providerObservedAt: null,
    fxObservedAt: null,
    previousUsCloseObservedAt: null,
    quote: null,
    eurUsd: null,
    impliedUsd: null,
    previousUsCloseUsd: null,
    impliedGapPct: null,
    signal: 0,
    rangeSignal: 0,
    nvdaDirection: null,
    calibrationStatus: "UNCALIBRATED",
    effectMode: "RANGE_ONLY",
    strictEligible: false,
    sourceUrl: TRADEGATE_NVDA_URL,
  };
}

export async function pullGermanMarketEvidence({
  targetDate,
  expectedPreviousSession,
  priorSessionCloseMs,
  targetOpenMs,
  fetcher = globalThis.fetch,
  now = Date.now(),
}: PullGermanMarketOptions): Promise<GermanMarketEvidence> {
  const checkedAt = finite(now) ? now : Date.now();
  const fallback = baseEvidence(checkedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(expectedPreviousSession) ||
    !finite(priorSessionCloseMs) ||
    !finite(targetOpenMs) ||
    priorSessionCloseMs >= targetOpenMs ||
    typeof fetcher !== "function"
  ) return { ...fallback, reason: "Valid target-session boundaries and a public fetcher are required." };

  const [tradegateResult, fxResult, previousCloseResult] = await Promise.allSettled([
    request(fetcher, TRADEGATE_NVDA_URL, "text/html").then((response) => response.text()).then(parseTradegateNvdaHtml),
    yahooLatestFx(fetcher),
    yahooPreviousNvdaClose(fetcher, expectedPreviousSession, priorSessionCloseMs),
  ]);
  const tradegate = tradegateResult.status === "fulfilled" ? tradegateResult.value : null;
  if (!tradegate) {
    return {
      ...fallback,
      reason: tradegateResult.status === "fulfilled"
        ? "The Tradegate page did not contain the exact timestamped NVIDIA NVD/ISIN quote contract."
        : "The official Tradegate NVIDIA page request failed.",
    };
  }

  const fx = fxResult.status === "fulfilled" ? fxResult.value : null;
  const previousClose = previousCloseResult.status === "fulfilled" ? previousCloseResult.value : null;
  const impliedUsd = fx ? tradegate.quote.midpointEur * fx.eurUsd : null;
  const impliedGapPct = impliedUsd != null && previousClose ? ((impliedUsd / previousClose.close) - 1) * 100 : null;
  const shared = {
    ...fallback,
    status: "limited" as const,
    providerObservedAt: tradegate.observedAt,
    fxObservedAt: fx?.observedAt ?? null,
    previousUsCloseObservedAt: previousClose?.observedAt ?? null,
    quote: tradegate.quote,
    eurUsd: fx?.eurUsd ?? null,
    impliedUsd,
    previousUsCloseUsd: previousClose?.close ?? null,
    impliedGapPct,
  };

  const invalidDepth =
    (tradegate.quote.bidSize != null && tradegate.quote.bidSize <= 0) ||
    (tradegate.quote.askSize != null && tradegate.quote.askSize <= 0);
  if (tradegate.quote.spreadBps > GERMAN_MAX_SPREAD_BPS || invalidDepth) {
    return {
      ...shared,
      reason: invalidDepth
        ? "Tradegate displayed zero or nonpositive quoted depth; midpoint is display-only and the signal is held neutral."
        : `Tradegate spread exceeds ${GERMAN_MAX_SPREAD_BPS} bp; midpoint is display-only and the signal is held neutral.`,
    };
  }

  if (!fx) return { ...shared, reason: "Tradegate quote loaded, but timestamped EUR/USD research data is unavailable." };
  if (!previousClose) return { ...shared, reason: `Tradegate and FX loaded, but the ${expectedPreviousSession} U.S. close is unavailable.` };
  const futureSkew = tradegate.observedAt > checkedAt + MAX_CLOCK_SKEW_MS || fx.observedAt > checkedAt + MAX_CLOCK_SKEW_MS;
  if (futureSkew) return { ...shared, reason: "German or FX evidence has an invalid future timestamp; signal held neutral." };
  const staleQuote = checkedAt - tradegate.observedAt > MAX_TRADEGATE_AGE_MS;
  const staleFx = checkedAt - fx.observedAt > MAX_FX_AGE_MS;
  if (staleQuote || staleFx) {
    return {
      ...shared,
      reason: staleQuote
        ? "The German venue is closed or its public observation is older than 10 minutes; signal held neutral."
        : "EUR/USD is older than 20 minutes; signal held neutral.",
    };
  }
  const insideTargetWindow =
    checkedAt < targetOpenMs &&
    tradegate.observedAt >= priorSessionCloseMs &&
    tradegate.observedAt <= targetOpenMs &&
    fx.observedAt >= priorSessionCloseMs &&
    fx.observedAt <= targetOpenMs;
  if (!insideTargetWindow) {
    return { ...shared, reason: "Fresh observations are outside the prior-close-to-target-open window; signal held neutral." };
  }

  const rangeSignal = clamp(Math.abs(impliedGapPct ?? 0) / 2, 0, 1);
  const active = Math.abs(impliedGapPct ?? 0) >= ACTIVE_GAP_THRESHOLD_PCT;
  return {
    ...shared,
    status: "live",
    signalState: active ? "active" : "neutral",
    reason: active
      ? `FX-converted German midpoint implies a ${(impliedGapPct ?? 0) >= 0 ? "+" : ""}${(impliedGapPct ?? 0).toFixed(2)}% provisional gap versus the prior U.S. close. Range-only until calibrated.`
      : "FX-converted German midpoint is within 0.10% of the prior U.S. close; no provisional range signal.",
    // A signed observation is retained for research/audit, but nvdaDirection
    // remains null and the forecast factor is explicitly range-only.
    signal: clamp((impliedGapPct ?? 0) / 2, -1, 1),
    rangeSignal,
  };
}
