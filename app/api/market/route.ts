import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
  nextNasdaqSession,
  previousNasdaqSession,
} from "../../market-session.ts";
import {
  marketValue,
  TARGET_MARKET_SCHEMA_VERSION,
  unavailableMarketValue,
  type MarketFreshness,
  type MarketProvenance,
  type MarketValue,
  type TargetMarketEnvelope,
  type TargetMarketView,
} from "../../market-contract.ts";
import {
  canonicalMarketBars,
  completedDailyRows,
  completedMarketBars,
} from "../../market-reducer.ts";
import { frozenEnvelopeFromArchive } from "../../market-archive.ts";
import {
  createMarketStore,
  type MarketCompletedMinuteBar,
  type MarketQualifiedObservation,
} from "../../market-store.ts";
import {
  classifyTargetSession,
  enumerateNearbyTargetSessions,
  validateTargetSession,
} from "../../target-session.ts";

type Quote = {
  high?: Array<number | null>;
  low?: Array<number | null>;
  open?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
};

type Chart = {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: Quote[] };
};

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FinnhubQuote = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

type AlpacaTrade = {
  p?: number;
  s?: number;
  t?: string;
  x?: string;
};

type AlpacaQuote = {
  ap?: number;
  as?: number;
  bp?: number;
  bs?: number;
  t?: string;
};

type AlpacaBar = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  t?: string;
  v?: number;
};

type AlpacaSnapshot = {
  symbol?: string;
  latestTrade?: AlpacaTrade;
  latestQuote?: AlpacaQuote;
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
};

type AlpacaBarsResponse = {
  bars?: AlpacaBar[];
  next_page_token?: string | null;
  symbol?: string;
};

type ChartCache = {
  expires: number;
  fetchedAt: number;
  chart: Chart;
};

type ChartResult = {
  chart: Chart | null;
  fetchedAt: number | null;
  cacheHit: boolean;
  staleIfError: boolean;
  error: string | null;
};

type FinnhubQuoteCache = {
  quote: FinnhubQuote;
  fetchedAt: number;
  expires: number;
};

type AlpacaSnapshotCache = {
  snapshot: AlpacaSnapshot;
  fetchedAt: number;
  expires: number;
};

type AlpacaDailyCache = {
  bars: AlpacaBar[];
  fetchedAt: number;
  expires: number;
};

type ProviderRequestState = {
  inFlight: Promise<unknown> | null;
  consecutiveFailures: number;
  retryAt: number;
};

type Session = "CLOSED" | "PREMARKET" | "MARKET OPEN" | "AFTER-HOURS";
type SourceStatus = "ok" | "stale" | "error" | "standby" | "not_configured";

const HISTORY_CACHE_MS = 60_000;
const HISTORY_STALE_MS = 120_000;
const OPEN_QUOTE_STALE_MS = 90_000;
const PREMARKET_QUOTE_STALE_MS = 3 * 60_000;
const AFTER_HOURS_QUOTE_STALE_MS = 5 * 60_000;
const PROVIDER_FUTURE_SKEW_MS = 30_000;
// Public refreshes never map one-to-one to provider calls. These successful
// caches are reinforced below by per-provider single-flight and failure
// backoff, while observation timestamps still determine market freshness.
const FINNHUB_QUOTE_CACHE_MS = 10_000;
const ALPACA_SNAPSHOT_CACHE_MS = 5_000;
const ALPACA_DAILY_CACHE_MS = 5 * 60_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 8_000;
const PROVIDER_ERROR_BACKOFF_BASE_MS = 2_000;
const PROVIDER_ERROR_BACKOFF_MAX_MS = 60_000;
const PROVIDER_CIRCUIT_FAILURE_THRESHOLD = 3;
const PROVIDER_CIRCUIT_BACKOFF_MS = 10_000;
const headers = {
  "User-Agent": "Mozilla/5.0 NVDA-Live-Structure/4.0",
  Accept: "application/json",
};

const etDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const displayDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "2-digit",
  }).format(date);

async function yahoo(interval: string, range: string, prepost = true) {
  const url = new URL("https://query1.finance.yahoo.com/v8/finance/chart/NVDA");
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", String(prepost));
  return providerRequest(
    `yahoo:chart:NVDA:${interval}:${range}:${prepost ? "prepost" : "regular"}`,
    `Yahoo ${interval} NVDA chart`,
    async () => {
      const response = await fetch(url, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error("Yahoo chart feed failed");
      const json = (await response.json()) as { chart?: { result?: Chart[] } };
      const chart = json.chart?.result?.[0];
      if (!chart) throw new Error("Yahoo chart feed returned no NVDA data");
      // Coalesced callers share the same provider-check timestamp. This is the
      // time Aperture obtained the payload, not a new market observation time.
      return { chart, fetchedAt: Date.now() };
    },
  );
}

let dailyHistoryCache: ChartCache | null = null;
let minuteHistoryCache: ChartCache | null = null;
let finnhubQuoteCache: FinnhubQuoteCache | null = null;
let alpacaSnapshotCache: AlpacaSnapshotCache | null = null;
let alpacaDailyCache: AlpacaDailyCache | null = null;
const providerRequestStates = new Map<string, ProviderRequestState>();

class ProviderRequestDeferredError extends Error {
  readonly code = "PROVIDER_RETRY_DEFERRED";
  readonly retryAt: number;

  constructor(label: string, retryAt: number) {
    super(`${label} request temporarily deferred after an upstream failure`);
    this.name = "ProviderRequestDeferredError";
    this.retryAt = retryAt;
  }
}

function providerFailureBackoffMs(consecutiveFailures: number) {
  if (consecutiveFailures >= PROVIDER_CIRCUIT_FAILURE_THRESHOLD) {
    return Math.min(
      PROVIDER_ERROR_BACKOFF_MAX_MS,
      PROVIDER_CIRCUIT_BACKOFF_MS * (2 ** (consecutiveFailures - PROVIDER_CIRCUIT_FAILURE_THRESHOLD)),
    );
  }
  return Math.min(
    PROVIDER_ERROR_BACKOFF_MAX_MS,
    PROVIDER_ERROR_BACKOFF_BASE_MS * (2 ** Math.max(0, consecutiveFailures - 1)),
  );
}

/**
 * Coalesce one raw provider request per key and keep repeated public requests
 * from hammering a failing upstream. Keys describe provider/product/symbol,
 * never credentials, target sessions, or decision cutoffs. Raw payload sharing
 * is therefore independent from the point-in-time filters applied downstream.
 */
async function providerRequest<T>(
  key: string,
  label: string,
  operation: () => Promise<T>,
  now: () => number = () => Date.now(),
): Promise<T> {
  let state = providerRequestStates.get(key);
  if (!state) {
    state = { inFlight: null, consecutiveFailures: 0, retryAt: 0 };
    providerRequestStates.set(key, state);
  }
  if (state.inFlight) return state.inFlight as Promise<T>;
  if (state.retryAt > now()) throw new ProviderRequestDeferredError(label, state.retryAt);

  const pending = Promise.resolve()
    .then(operation)
    .then((value) => {
      state!.consecutiveFailures = 0;
      state!.retryAt = 0;
      return value;
    }, (error: unknown) => {
      state!.consecutiveFailures += 1;
      state!.retryAt = now() + providerFailureBackoffMs(state!.consecutiveFailures);
      throw error;
    })
    .finally(() => {
      if (state!.inFlight === pending) state!.inFlight = null;
    });
  state.inFlight = pending;
  return pending;
}

/** A narrow test seam for concurrency/backoff behavior; production callers use provider-specific keys. */
export function __providerRequestForTests<T>(
  key: string,
  operation: () => Promise<T>,
  now: () => number = () => Date.now(),
): Promise<T> {
  return providerRequest(`test:${key}`, "Test provider", operation, now);
}

/**
 * Yahoo history is deliberately cached for one minute. A request to this route
 * therefore does not imply that a new Yahoo observation was fetched.
 */
async function chartHistory(
  kind: "daily" | "minute",
): Promise<ChartResult> {
  const now = Date.now();
  const cached = kind === "daily" ? dailyHistoryCache : minuteHistoryCache;
  if (cached && cached.expires > now) {
    return {
      chart: cached.chart,
      fetchedAt: cached.fetchedAt,
      cacheHit: true,
      staleIfError: false,
      error: null,
    };
  }
  try {
    const result = kind === "daily"
      ? await yahoo("1d", "1mo", false)
      : await yahoo("1m", "5d", true);
    const { chart, fetchedAt } = result;
    const next = { expires: fetchedAt + HISTORY_CACHE_MS, fetchedAt, chart };
    if (kind === "daily") dailyHistoryCache = next;
    else minuteHistoryCache = next;
    return { chart, fetchedAt, cacheHit: false, staleIfError: false, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : `Yahoo ${kind} history failed`;
    if (cached) {
      return {
        chart: cached.chart,
        fetchedAt: cached.fetchedAt,
        cacheHit: true,
        staleIfError: true,
        error: detail,
      };
    }
    return { chart: null, fetchedAt: null, cacheHit: false, staleIfError: false, error: detail };
  }
}

async function marketHistory() {
  const [daily, minute] = await Promise.all([
    chartHistory("daily"),
    chartHistory("minute"),
  ]);
  return { daily, minute };
}

export function __resetMarketRouteCachesForTests() {
  dailyHistoryCache = null;
  minuteHistoryCache = null;
  finnhubQuoteCache = null;
  alpacaSnapshotCache = null;
  alpacaDailyCache = null;
  providerRequestStates.clear();
}

function ny(epochSeconds: number) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(epochSeconds * 1000))
      .map((part) => [part.type, part.value]),
  );
}

function valid(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const keyFromParts = (parts: Record<string, string>) =>
  `${parts.year}-${parts.month}-${parts.day}`;

export function marketTargetSessionDate(nowMs = Date.now()) {
  const currentKey = newYorkDateKey(nowMs);
  if (!isNasdaqSessionDate(currentKey)) return nextNasdaqSession(currentKey);
  const schedule = nasdaqSessionSchedule(currentKey);
  return nowMs >= schedule.regularCloseAt
    ? nextNasdaqSession(currentKey, { inclusive: false })
    : currentKey;
}

/** Market state is calendar/time based and never inferred from feed success. */
export function marketSessionState(nowMs = Date.now()): {
  session: Session;
  regularMarketOpen: boolean;
  reason: "weekend" | "holiday" | "early_close" | "outside_regular_hours" | null;
  regularCloseMinute: number;
} {
  const key = newYorkDateKey(nowMs);
  const date = new Date(`${key}T00:00:00Z`);
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    return { session: "CLOSED", regularMarketOpen: false, reason: "weekend", regularCloseMinute: 960 };
  }
  if (!isNasdaqSessionDate(key)) {
    return { session: "CLOSED", regularMarketOpen: false, reason: "holiday", regularCloseMinute: 960 };
  }
  const schedule = nasdaqSessionSchedule(key);
  const closeMinute = schedule.earlyClose ? 13 * 60 : 16 * 60;
  const session: Session =
    nowMs < schedule.premarketOpenAt
      ? "CLOSED"
      : nowMs < schedule.regularOpenAt
        ? "PREMARKET"
        : nowMs < schedule.regularCloseAt
          ? "MARKET OPEN"
          : nowMs < schedule.afterHoursCloseAt
            ? "AFTER-HOURS"
            : "CLOSED";
  return {
    session,
    regularMarketOpen: session === "MARKET OPEN",
    reason: session === "MARKET OPEN"
      ? null
      : schedule.earlyClose && nowMs >= schedule.regularCloseAt
        ? "early_close"
        : "outside_regular_hours",
    regularCloseMinute: closeMinute,
  };
}

function chartBars(chart: Chart | null) {
  if (!chart) return [];
  const quote = chart.indicators?.quote?.[0];
  return canonicalMarketBars((chart.timestamp ?? [])
    .map((timestamp, index) => ({
      time: timestamp * 1000,
      open: quote?.open?.[index],
      high: quote?.high?.[index],
      low: quote?.low?.[index],
      close: quote?.close?.[index],
      volume: quote?.volume?.[index] ?? 0,
    }))
    .filter(
      (bar): bar is Bar =>
        valid(bar.open) && valid(bar.high) && valid(bar.low) && valid(bar.close),
    ));
}

// The key stays server-side; browser clients receive only normalized NVDA data.
async function finnhubQuote(key: string) {
  const now = Date.now();
  if (finnhubQuoteCache && finnhubQuoteCache.expires > now) {
    return { ...finnhubQuoteCache, cacheHit: true };
  }
  return providerRequest("finnhub:quote:NVDA", "Finnhub NVDA quote", async () => {
    const response = await fetch("https://finnhub.io/api/v1/quote?symbol=NVDA", {
      headers: { "X-Finnhub-Token": key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Finnhub quote failed (${response.status})`);
    const quote = (await response.json()) as FinnhubQuote;
    if (!valid(quote.c) || quote.c <= 0) throw new Error("Finnhub returned no NVDA quote");
    const fetchedAt = Date.now();
    finnhubQuoteCache = {
      quote,
      fetchedAt,
      expires: fetchedAt + FINNHUB_QUOTE_CACHE_MS,
    };
    return { ...finnhubQuoteCache, cacheHit: false };
  });
}

function alpacaCredentials() {
  const env = (globalThis as unknown as {
    process?: { env?: Record<string, string> };
  }).process?.env;
  const keyId = env?.APCA_API_KEY_ID?.trim();
  const secretKey = env?.APCA_API_SECRET_KEY?.trim();
  return keyId && secretKey ? { keyId, secretKey } : null;
}

// Alpaca credentials never leave the server. The Basic-plan IEX snapshot is a
// real-time single-exchange reference, not consolidated SIP NBBO or Nasdaq NOII.
async function alpacaSnapshot(credentials: { keyId: string; secretKey: string }) {
  const now = Date.now();
  if (alpacaSnapshotCache && alpacaSnapshotCache.expires > now) {
    return { ...alpacaSnapshotCache, cacheHit: true };
  }
  return providerRequest("alpaca:snapshot:NVDA:iex", "Alpaca IEX NVDA snapshot", async () => {
    const response = await fetch(
      "https://data.alpaca.markets/v2/stocks/NVDA/snapshot?feed=iex",
      {
        headers: {
          "APCA-API-KEY-ID": credentials.keyId,
          "APCA-API-SECRET-KEY": credentials.secretKey,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) throw new Error(`Alpaca IEX snapshot failed (${response.status})`);
    const snapshot = (await response.json()) as AlpacaSnapshot;
    if (!valid(snapshot.latestTrade?.p) || snapshot.latestTrade!.p! <= 0) {
      throw new Error("Alpaca returned no valid NVDA trade");
    }
    const fetchedAt = Date.now();
    alpacaSnapshotCache = {
      snapshot,
      fetchedAt,
      expires: fetchedAt + ALPACA_SNAPSHOT_CACHE_MS,
    };
    return { ...alpacaSnapshotCache, cacheHit: false };
  });
}

async function alpacaDailyHistory(credentials: { keyId: string; secretKey: string }) {
  const now = Date.now();
  if (alpacaDailyCache && alpacaDailyCache.expires > now) {
    return { ...alpacaDailyCache, cacheHit: true };
  }
  const url = new URL("https://data.alpaca.markets/v2/stocks/NVDA/bars");
  url.searchParams.set("timeframe", "1Day");
  url.searchParams.set("start", new Date(now - 70 * 24 * 60 * 60_000).toISOString());
  // Basic accounts may receive SIP data with a delay. Completed daily sessions
  // are unaffected, and the current target session is filtered out below.
  url.searchParams.set("end", new Date(now - 16 * 60_000).toISOString());
  url.searchParams.set("limit", "100");
  url.searchParams.set("adjustment", "raw");
  url.searchParams.set("feed", "sip");
  url.searchParams.set("sort", "asc");
  return providerRequest("alpaca:daily:NVDA:sip", "Alpaca SIP NVDA daily history", async () => {
    const response = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": credentials.keyId,
        "APCA-API-SECRET-KEY": credentials.secretKey,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Alpaca SIP daily history failed (${response.status})`);
    const payload = (await response.json()) as AlpacaBarsResponse;
    const bars = (payload.bars ?? []).filter(
      (bar) =>
        valid(bar.o) &&
        valid(bar.h) &&
        valid(bar.l) &&
        valid(bar.c) &&
        typeof bar.t === "string",
    );
    if (!bars.length) throw new Error("Alpaca returned no NVDA daily history");
    const fetchedAt = Date.now();
    alpacaDailyCache = {
      bars,
      fetchedAt,
      expires: fetchedAt + ALPACA_DAILY_CACHE_MS,
    };
    return { ...alpacaDailyCache, cacheHit: false };
  });
}

const iso = (value: number | null | undefined) =>
  valid(value) ? new Date(value).toISOString() : null;

type QuoteProvider = "aperture_stream" | "alpaca_iex" | "finnhub" | "yahoo";

export type MarketQuoteCandidate = {
  provider: QuoteProvider;
  price: number;
  observedAtMs: number | null;
  fetchedAtMs: number | null;
  source: string;
  sourceId?: string;
  coverage?: string;
  receivedAtMs?: number | null;
  processedAtMs?: number | null;
  availableAtMs?: number | null;
  persistedAtMs?: number | null;
  strictExecutionEligible?: boolean;
};

export type DurableLatestMarketData = {
  observations: MarketQualifiedObservation[];
  completedBars: MarketCompletedMinuteBar[];
  databaseAvailable: boolean;
  observationReadFailed: boolean;
  completedBarReadFailed: boolean;
};

const emptyDurableLatestMarketData = (databaseAvailable = false): DurableLatestMarketData => ({
  observations: [],
  completedBars: [],
  databaseAvailable,
  observationReadFailed: false,
  completedBarReadFailed: false,
});

function isIexCoverage(observation: Pick<MarketQualifiedObservation, "feed" | "coverage">) {
  return observation.feed.toLowerCase() === "iex" || /\bIEX\b/i.test(observation.coverage);
}

/**
 * Convert only an exact-session, point-in-time durable observation into a
 * display quote candidate. IEX remains research-only even if a malformed row
 * were ever labelled STRICT_EXECUTION upstream.
 */
export function durableStreamQuoteCandidate(
  observations: MarketQualifiedObservation[],
  targetDate: string,
  cutoff: number,
): MarketQuoteCandidate | null {
  const eligible = observations.filter((observation) =>
    observation.symbol === "NVDA" &&
    observation.sessionDate === targetDate &&
    newYorkDateKey(observation.providerTime) === targetDate &&
    observation.providerTime <= cutoff &&
    observation.receivedAt <= observation.processedAt &&
    observation.processedAt <= observation.availableAt &&
    observation.availableAt <= cutoff &&
    valid(observation.price) && observation.price > 0
  ).sort((left, right) =>
    right.providerTime - left.providerTime ||
    right.availableAt - left.availableAt ||
    right.serviceSequence - left.serviceSequence
  );
  const observation = eligible[0];
  if (!observation) return null;
  const iex = isIexCoverage(observation);
  const strictExecutionEligible = !iex &&
    observation.qualification === "STRICT_EXECUTION" &&
    observation.entitlement === "ENTITLED" &&
    (observation.coverage === "CONSOLIDATED_SIP" ||
      (observation.kind === "OPENING_CROSS" && observation.coverage === "NASDAQ_OFFICIAL_CROSS"));
  const qualification = strictExecutionEligible
    ? "execution-qualified observation"
    : "research-only observation; not a strict execution entitlement";
  return {
    provider: "aperture_stream",
    price: observation.price,
    observedAtMs: observation.providerTime,
    fetchedAtMs: observation.availableAt,
    source: `Aperture durable ${observation.provider} ${observation.feed.toUpperCase()} stream · ${qualification}`,
    sourceId: `market_stream:${observation.provider}:${observation.feed}`,
    coverage: iex
      ? "IEX single-exchange stream; research-only and never promoted to strict execution coverage."
      : `${observation.coverage}; qualification=${observation.qualification}.`,
    receivedAtMs: observation.receivedAt,
    processedAtMs: observation.processedAt,
    availableAtMs: observation.availableAt,
    persistedAtMs: observation.createdAt,
    strictExecutionEligible,
  };
}

function validDurableCompletedBar(
  bar: MarketCompletedMinuteBar,
  targetDate: string,
  cutoff: number,
) {
  return bar.symbol === "NVDA" &&
    bar.sessionDate === targetDate &&
    newYorkDateKey(bar.minuteStart) === targetDate &&
    bar.minuteEnd === bar.minuteStart + 60_000 &&
    bar.minuteEnd <= cutoff &&
    bar.receivedAt <= bar.processedAt &&
    bar.processedAt <= bar.availableAt &&
    bar.availableAt <= cutoff &&
    valid(bar.open) && valid(bar.high) && valid(bar.low) && valid(bar.close) && valid(bar.volume) &&
    bar.volume >= 0 && bar.high >= bar.low &&
    bar.open >= bar.low && bar.open <= bar.high &&
    bar.close >= bar.low && bar.close <= bar.high;
}

/**
 * Select one durable provider/feed series, then its latest available revision
 * per minute. Selecting a single series prevents silent cross-feed blending;
 * the chosen bars may overlay REST history but are never price-averaged.
 */
export function selectDurableCompletedMinuteBars(
  completedBars: MarketCompletedMinuteBar[],
  targetDate: string,
  cutoff: number,
  preferredSource?: { provider: string; feed: string } | null,
) {
  const groups = new Map<string, MarketCompletedMinuteBar[]>();
  for (const bar of completedBars) {
    if (!validDurableCompletedBar(bar, targetDate, cutoff)) continue;
    const key = `${bar.provider}\u0000${bar.feed}`;
    const group = groups.get(key) ?? [];
    group.push(bar);
    groups.set(key, group);
  }
  const ranked = [...groups.entries()].map(([key, rows]) => ({
    key,
    rows,
    preferred: preferredSource != null && key === `${preferredSource.provider}\u0000${preferredSource.feed}`,
    sip: rows[0]?.feed.toLowerCase() === "sip",
    latestAvailableAt: Math.max(...rows.map((row) => row.availableAt)),
  })).sort((left, right) =>
    Number(right.preferred) - Number(left.preferred) ||
    Number(right.sip) - Number(left.sip) ||
    right.latestAvailableAt - left.latestAvailableAt ||
    right.rows.length - left.rows.length ||
    left.key.localeCompare(right.key)
  );
  const selected = ranked[0]?.rows ?? [];
  const latestByMinute = new Map<number, MarketCompletedMinuteBar>();
  for (const bar of selected) {
    const previous = latestByMinute.get(bar.minuteStart);
    if (!previous || bar.revision > previous.revision ||
      (bar.revision === previous.revision && bar.availableAt > previous.availableAt)) {
      latestByMinute.set(bar.minuteStart, bar);
    }
  }
  return [...latestByMinute.values()].sort((left, right) => left.minuteStart - right.minuteStart);
}

export function mergeDurableCompletedMinuteBars(
  baseBars: Bar[],
  durableBars: MarketCompletedMinuteBar[],
) {
  return canonicalMarketBars([
    ...baseBars,
    ...durableBars.map((bar) => ({
      time: bar.minuteStart,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    })),
  ]);
}

async function readDurableLatestMarketData(input: {
  targetDate: string;
  cutoff: number;
}): Promise<DurableLatestMarketData> {
  try {
    const runtime = await import("cloudflare:workers") as unknown as {
      env?: { DB?: D1Database };
    };
    if (!runtime.env?.DB) return emptyDurableLatestMarketData(false);
    const store = createMarketStore(runtime.env.DB);
    const [observationResult, completedBarResult] = await Promise.allSettled([
      store.readObservationsAsOf({
        symbol: "NVDA",
        targetDate: input.targetDate,
        cutoff: input.cutoff,
        limit: 100,
      }),
      store.readCompletedBarsAsOf({
        symbol: "NVDA",
        targetDate: input.targetDate,
        cutoff: input.cutoff,
        limit: 1_000,
      }),
    ]);
    return {
      observations: observationResult.status === "fulfilled" ? observationResult.value : [],
      completedBars: completedBarResult.status === "fulfilled" ? completedBarResult.value : [],
      databaseAvailable: true,
      observationReadFailed: observationResult.status === "rejected",
      completedBarReadFailed: completedBarResult.status === "rejected",
    };
  } catch {
    // Durable reads are an additive LATEST source. Provider fallbacks must
    // remain available when D1 is unbound or its read schema is unavailable.
    return {
      ...emptyDurableLatestMarketData(false),
      observationReadFailed: true,
      completedBarReadFailed: true,
    };
  }
}

type QuoteHealth = {
  ageMs: number | null;
  stale: boolean;
  futureSkew: boolean;
  currentForSession: boolean;
  state: "current" | "stale" | "market_closed" | "unavailable";
};

function quoteThreshold(session: Session) {
  if (session === "MARKET OPEN") return OPEN_QUOTE_STALE_MS;
  if (session === "PREMARKET") return PREMARKET_QUOTE_STALE_MS;
  if (session === "AFTER-HOURS") return AFTER_HOURS_QUOTE_STALE_MS;
  return null;
}

export function marketQuoteHealth(
  observedAtMs: number | null,
  session: Session,
  nowMs: number,
): QuoteHealth {
  const threshold = quoteThreshold(session);
  const hasObservation = valid(observedAtMs);
  const futureSkew = hasObservation && observedAtMs > nowMs + PROVIDER_FUTURE_SKEW_MS;
  const rawAge = hasObservation ? nowMs - observedAtMs : null;
  const ageMs = rawAge == null ? null : Math.max(0, rawAge);
  if (session === "CLOSED") {
    return {
      ageMs,
      stale: false,
      futureSkew,
      currentForSession: false,
      state: hasObservation && !futureSkew ? "market_closed" : "unavailable",
    };
  }
  const currentForSession = Boolean(
    hasObservation && !futureSkew && threshold != null && rawAge! <= threshold,
  );
  return {
    ageMs,
    stale: !currentForSession,
    futureSkew,
    currentForSession,
    state: currentForSession ? "current" : "stale",
  };
}

export function selectMarketQuote(
  candidates: MarketQuoteCandidate[],
  session: Session,
  nowMs: number,
) {
  const usable = candidates.filter((candidate) => valid(candidate.price) && candidate.price > 0);
  if (!usable.length) return null;
  const evaluated = usable.map((candidate) => ({
    ...candidate,
    health: marketQuoteHealth(candidate.observedAtMs, session, nowMs),
  })).filter((candidate) => !candidate.health.futureSkew);
  if (!evaluated.length) return null;
  const current = evaluated.find((candidate) => candidate.health.currentForSession);
  if (current) return current;
  const timestamped = evaluated
    .filter((candidate) => valid(candidate.observedAtMs) && !candidate.health.futureSkew)
    .sort((a, b) => (b.observedAtMs ?? 0) - (a.observedAtMs ?? 0));
  return timestamped[0] ?? evaluated.find((candidate) => candidate.observedAtMs == null) ?? null;
}

function supportedTargetDate(targetDate: string, nowMs: number) {
  return enumerateNearbyTargetSessions(nowMs, { past: 5, future: 10 })
    .some((option) => option.date === targetDate);
}

function targetFieldFreshness(input: {
  targetDate: string;
  todayKey: string;
  nowMs: number;
  regularOpenAt: number;
  regularCloseAt: number;
  view: TargetMarketView;
}): Exclude<MarketFreshness, null> {
  if (input.view === "DECISION_FREEZE") return "FROZEN";
  if (input.targetDate < input.todayKey || input.nowMs >= input.regularCloseAt) return "FINAL";
  if (input.targetDate > input.todayKey || input.nowMs < input.regularOpenAt) return "MARKET_CLOSED";
  return "LIVE";
}

function marketProvenance(input: {
  sourceId: string;
  provider: string;
  coverage: string;
  sourceObservedAt: number | null;
  receivedAt: number | null;
  processedAt: number;
  checkedAt: number;
}): MarketProvenance {
  // Normalization cannot make a value available before processing completes.
  const availableAt = Math.max(input.receivedAt ?? 0, input.processedAt);
  return {
    ...input,
    availableAt,
    persistedAt: null,
    ageMs: input.sourceObservedAt == null
      ? null
      : Math.max(0, input.processedAt - input.sourceObservedAt),
  };
}

function unavailableFreezeEnvelope(input: {
  targetDate: string;
  requestedAt: number;
  effectiveAsOf: number;
}): TargetMarketEnvelope {
  const schedule = nasdaqSessionSchedule(input.targetDate);
  const missing = () => unavailableMarketValue<number>({
    availability: "MISSING",
    freshness: "FROZEN",
    reasonCode: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE",
  });
  return {
    schemaVersion: TARGET_MARKET_SCHEMA_VERSION,
    symbol: "NVDA",
    targetDate: input.targetDate,
    relation: classifyTargetSession(input.targetDate, input.requestedAt),
    requestedAt: input.requestedAt,
    effectiveAsOf: input.effectiveAsOf,
    view: "DECISION_FREEZE",
    schedule: {
      premarketOpenAt: schedule.premarketOpenAt,
      regularOpenAt: schedule.regularOpenAt,
      regularCloseAt: schedule.regularCloseAt,
      earlyClose: schedule.earlyClose,
    },
    archive: {
      status: "UNAVAILABLE",
      latestPersistedAt: null,
      latestCompletedBarAt: null,
    },
    quote: missing(),
    previousSession: {
      date: previousNasdaqSession(input.targetDate, { inclusive: false }),
      open: missing(),
      high: missing(),
      low: missing(),
      close: missing(),
      volume: missing(),
    },
    targetSession: {
      premarket: {
        high: missing(),
        low: missing(),
        current: missing(),
        volume: missing(),
      },
      regular: {
        open: missing(),
        high: missing(),
        low: missing(),
        close: missing(),
        volume: missing(),
      },
      firstMinute: {
        high: missing(),
        low: missing(),
        close: missing(),
        volume: missing(),
        complete: false,
      },
    },
  };
}

async function archivedFreezeEnvelope(input: {
  targetDate: string;
  requestedAt: number;
  cutoff: number;
}) {
  try {
    const runtime = await import("cloudflare:workers") as unknown as {
      env?: { DB?: D1Database };
    };
    if (!runtime.env?.DB) return null;
    const store = createMarketStore(runtime.env.DB);
    const finalCheckpoint = await store.readSessionSnapshotAsOf({
      symbol: "NVDA",
      targetDate: input.targetDate,
      cutoff: input.cutoff,
      checkpoint: "T-5M",
    });
    const snapshot = finalCheckpoint ?? await store.readSessionSnapshotAsOf({
      symbol: "NVDA",
      targetDate: input.targetDate,
      cutoff: input.cutoff,
    });
    if (!snapshot) return null;
    return frozenEnvelopeFromArchive({
      snapshot,
      targetDate: input.targetDate,
      requestedAt: input.requestedAt,
      cutoff: input.cutoff,
    });
  } catch {
    return null;
  }
}

export async function GET(request?: Request) {
  const endpointCheckedAtMs = Date.now();
  try {
    const url = request ? new URL(request.url) : null;
    const requestedTargetDate = url?.searchParams.get("targetDate") ?? null;
    const explicitTargetDate = requestedTargetDate != null;
    const targetDate = requestedTargetDate ?? marketTargetSessionDate(endpointCheckedAtMs);
    if (explicitTargetDate) {
      const validation = validateTargetSession(targetDate, endpointCheckedAtMs);
      if (!validation.valid) {
        return Response.json(
          { error: "INVALID_TARGET_SESSION", reason: validation.reason },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      if (!supportedTargetDate(targetDate, endpointCheckedAtMs)) {
        return Response.json(
          { error: "TARGET_SESSION_OUT_OF_RANGE" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    const requestedView = url?.searchParams.get("view") ?? "LATEST";
    if (requestedView !== "LATEST" && requestedView !== "DECISION_FREEZE" && requestedView !== "STRICT") {
      return Response.json(
        { error: "INVALID_MARKET_VIEW" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const targetSchedule = nasdaqSessionSchedule(targetDate);
    // Strict consumers delegate the cutoff decision to the server. A browser
    // clock can neither keep a selected session live after the freeze nor force
    // a checkpoint early. Explicit LATEST remains available to the research
    // dashboard, which is intentionally separate from Strict MOO.
    const view: TargetMarketView = requestedView === "STRICT"
      ? endpointCheckedAtMs >= targetSchedule.decisionFreezeAt ? "DECISION_FREEZE" : "LATEST"
      : requestedView;
    const effectiveAsOf = view === "DECISION_FREEZE"
      ? Math.min(endpointCheckedAtMs, targetSchedule.decisionFreezeAt)
      : endpointCheckedAtMs;
    if (view === "DECISION_FREEZE" && endpointCheckedAtMs >= targetSchedule.decisionFreezeAt) {
      // A fresh provider response after the cutoff cannot reconstruct what the
      // application knew at 09:24:30 ET. Serve only the immutable D1 checkpoint
      // that was itself available by the cutoff; otherwise fail before any
      // provider request and expose no live legacy aliases.
      const archived = await archivedFreezeEnvelope({
        targetDate,
        requestedAt: endpointCheckedAtMs,
        cutoff: targetSchedule.decisionFreezeAt,
      });
      if (archived) {
        return Response.json(
          {
            marketContract: archived,
            symbol: "NVDA",
            targetDate,
            checkedAt: new Date(endpointCheckedAtMs).toISOString(),
            session: "FROZEN",
            source: "Aperture D1 point-in-time archive",
            realtime: false,
          },
          { headers: { "Cache-Control": "private, no-store, max-age=0" } },
        );
      }
      return Response.json(
        {
          error: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE",
          targetDate,
          marketContract: unavailableFreezeEnvelope({
            targetDate,
            requestedAt: endpointCheckedAtMs,
            effectiveAsOf,
          }),
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    const finnhubKey = (globalThis as unknown as {
      process?: { env?: Record<string, string> };
    }).process?.env?.FINNHUB_API_KEY;
    const alpaca = alpacaCredentials();
    const todayKey = newYorkDateKey(endpointCheckedAtMs);
    const marketState = marketSessionState(endpointCheckedAtMs);
    const [history, durableLatest] = await Promise.all([
      marketHistory(),
      view === "LATEST"
        ? readDurableLatestMarketData({ targetDate, cutoff: effectiveAsOf })
        : Promise.resolve(emptyDurableLatestMarketData(false)),
    ]);
    let alpacaDaily: Awaited<ReturnType<typeof alpacaDailyHistory>> | null = null;
    let alpacaDailyDetail = alpaca
      ? "Alpaca SIP daily-history request did not complete"
      : "Alpaca credentials are not configured";
    if (alpaca) {
      try {
        alpacaDaily = await alpacaDailyHistory(alpaca);
        alpacaDailyDetail = `${alpacaDaily.cacheHit ? "Cached" : "Fresh"} consolidated daily history returned`;
      } catch (error) {
        alpacaDailyDetail = error instanceof Error
          ? error.message
          : "Alpaca SIP daily-history request failed";
      }
    }
    const nowParts = ny(endpointCheckedAtMs / 1000);
    const nowMinute = Number(nowParts.hour) * 60 + Number(nowParts.minute);
    const dailyChart = history.daily.chart;
    const minuteChart = history.minute.chart;
    const dailyQuote = dailyChart?.indicators?.quote?.[0];
    const yahooDailyRows = (dailyChart?.timestamp ?? [])
      .map((timestamp, index) => ({
        date: displayDate(new Date(timestamp * 1000)),
        dateKey: etDate(new Date(timestamp * 1000)),
        open: dailyQuote?.open?.[index],
        high: dailyQuote?.high?.[index],
        low: dailyQuote?.low?.[index],
        close: dailyQuote?.close?.[index],
        volume: dailyQuote?.volume?.[index],
        timestampMs: timestamp * 1000,
      }));
    const alpacaDailyRows = (alpacaDaily?.bars ?? []).flatMap((bar) => {
      const timestampMs = Date.parse(bar.t ?? "");
      if (!Number.isFinite(timestampMs)) return [];
      return [{
        date: displayDate(new Date(timestampMs)),
        dateKey: etDate(new Date(timestampMs)),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        timestampMs,
      }];
    });
    const selectedDailyRows = alpacaDailyRows.length ? alpacaDailyRows : yahooDailyRows;
    const normalizedDailyRows = selectedDailyRows.flatMap((row) => {
      if (
        !Number.isSafeInteger(row.timestampMs) || row.timestampMs < 0 ||
        !valid(row.open) || !valid(row.high) || !valid(row.low) || !valid(row.close)
      ) return [];
      return [{
        date: row.date,
        dateKey: row.dateKey,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: valid(row.volume) ? row.volume : undefined,
        timestampMs: row.timestampMs,
      }];
    });
    const eligibleDailyRows = completedDailyRows(normalizedDailyRows, effectiveAsOf);
    const targetDailyRow = eligibleDailyRows.find((row) => row.dateKey === targetDate) ?? null;
    const daily = eligibleDailyRows
      .filter((row) => row.dateKey < targetDate)
      .slice(-20)
      .map(({ date, dateKey, open, high, low, close }) => ({ date, dateKey, open, high, low, close }));

    const canonicalHistoryBars = chartBars(minuteChart);
    const durableCandidate = targetDate === todayKey && view === "LATEST"
      ? durableStreamQuoteCandidate(durableLatest.observations, targetDate, effectiveAsOf)
      : null;
    const durableCandidateObservation = durableCandidate == null
      ? null
      : durableLatest.observations.find((observation) =>
        observation.providerTime === durableCandidate.observedAtMs &&
        `market_stream:${observation.provider}:${observation.feed}` === durableCandidate.sourceId
      ) ?? null;
    const durableCompletedBars = view === "LATEST"
      ? selectDurableCompletedMinuteBars(
        durableLatest.completedBars,
        targetDate,
        effectiveAsOf,
        durableCandidateObservation
          ? { provider: durableCandidateObservation.provider, feed: durableCandidateObservation.feed }
          : null,
      )
      : [];
    const durableBarByMinute = new Map(
      durableCompletedBars.map((bar) => [bar.minuteStart, bar] as const),
    );
    const historicalBars = view === "DECISION_FREEZE"
      ? completedMarketBars(canonicalHistoryBars, effectiveAsOf)
      : mergeDurableCompletedMinuteBars(canonicalHistoryBars, durableCompletedBars);
    const completedHistoricalParts = completedMarketBars(historicalBars, effectiveAsOf).map((bar) => ({
      bar,
      parts: ny(bar.time / 1000),
    }));
    const firstMinuteHistory = completedHistoricalParts
      .filter(
        ({ parts }) =>
          keyFromParts(parts) < targetDate &&
          Number(parts.hour) === 9 &&
          Number(parts.minute) === 30,
      )
      .slice(-10)
      .map(({ bar, parts }) => ({
        date: keyFromParts(parts),
        range: bar.high - bar.low,
        volume: bar.volume,
        close: bar.close,
      }));

    const latestHistoryBar = historicalBars.at(-1) ?? null;
    const latestYahooHistoryBar = canonicalHistoryBars.at(-1) ?? null;
    let alpacaLive: AlpacaSnapshot | null = null;
    let liveQuote: FinnhubQuote | null = null;
    let alpacaFetchedAtMs: number | null = null;
    let finnhubFetchedAtMs: number | null = null;
    let alpacaStatus: SourceStatus = alpaca ? "standby" : "not_configured";
    let alpacaDetail = alpaca
      ? "Configured as a fallback when the durable stream is not current"
      : "APCA_API_KEY_ID / APCA_API_SECRET_KEY are not configured";
    let finnhubStatus: SourceStatus = finnhubKey ? "standby" : "not_configured";
    let finnhubDetail = finnhubKey
      ? "Configured as the fallback reference quote"
      : "FINNHUB_API_KEY is not configured";
    const durableCandidateHealth = marketQuoteHealth(
      durableCandidate?.observedAtMs ?? null,
      marketState.session,
      endpointCheckedAtMs,
    );
    const currentLiveTarget = targetDate === todayKey && view === "LATEST";

    if (alpaca && currentLiveTarget && !durableCandidateHealth.currentForSession) {
      alpacaStatus = "error";
      try {
        const result = await alpacaSnapshot(alpaca);
        alpacaLive = result.snapshot;
        alpacaFetchedAtMs = result.fetchedAt;
        alpacaDetail = `${result.cacheHit ? "Cached" : "Fresh"} IEX snapshot returned with latest trade and quote timestamps`;
      } catch (error) {
        alpacaDetail = error instanceof Error
          ? error.message
          : "Alpaca IEX snapshot request failed";
      }
    } else if (alpaca && durableCandidateHealth.currentForSession) {
      alpacaDetail = "Standby; current durable stream observation is preferred";
    } else if (alpaca && !currentLiveTarget) {
      alpacaDetail = "Standby; live quote fallback is excluded for this target/view";
    }

    const parsedAlpacaObservedAt = Date.parse(alpacaLive?.latestTrade?.t ?? "");
    const alpacaCandidate: MarketQuoteCandidate | null = alpacaLive && valid(alpacaLive.latestTrade?.p)
      ? {
        provider: "alpaca_iex",
        price: alpacaLive.latestTrade!.p!,
        observedAtMs: Number.isFinite(parsedAlpacaObservedAt) ? parsedAlpacaObservedAt : null,
        fetchedAtMs: alpacaFetchedAtMs,
        source: "Alpaca IEX NVDA snapshot · single-exchange coverage",
      }
      : null;
    const alpacaHealth = marketQuoteHealth(
      alpacaCandidate?.observedAtMs ?? null,
      marketState.session,
      endpointCheckedAtMs,
    );
    if (alpacaLive) {
      alpacaStatus = alpacaCandidate?.observedAtMs != null ? "ok" : "stale";
      if (alpacaHealth.stale || alpacaHealth.futureSkew) alpacaStatus = "stale";
      if (alpacaHealth.futureSkew) alpacaDetail += "; invalid future timestamp";
      else if (alpacaHealth.stale) alpacaDetail += "; observation is not current for this session";
    }

    if (
      finnhubKey &&
      currentLiveTarget &&
      marketState.session !== "CLOSED" &&
      !durableCandidateHealth.currentForSession &&
      (!alpacaCandidate || !alpacaHealth.currentForSession)
    ) {
      try {
        const result = await finnhubQuote(finnhubKey);
        liveQuote = result.quote;
        finnhubFetchedAtMs = result.fetchedAt;
        finnhubDetail = liveQuote.t
          ? `${result.cacheHit ? "Cached" : "Fresh"} quote snapshot returned with provider observation time`
          : "Quote snapshot returned without a provider observation time";
      } catch (error) {
        finnhubDetail =
          error instanceof Error ? error.message : "Finnhub quote request failed";
      }
    }

    const finnhubCandidate: MarketQuoteCandidate | null = liveQuote && valid(liveQuote.c)
      ? {
        provider: "finnhub",
        price: liveQuote.c,
        observedAtMs: liveQuote.t ? liveQuote.t * 1000 : null,
        fetchedAtMs: finnhubFetchedAtMs,
        source: "Finnhub NVDA quote snapshot",
      }
      : null;
    const finnhubHealth = marketQuoteHealth(
      finnhubCandidate?.observedAtMs ?? null,
      marketState.session,
      endpointCheckedAtMs,
    );
    if (liveQuote) {
      finnhubStatus = finnhubCandidate?.observedAtMs != null ? "ok" : "stale";
      if (finnhubHealth.stale || finnhubHealth.futureSkew) finnhubStatus = "stale";
      if (finnhubHealth.futureSkew) finnhubDetail += "; invalid future timestamp";
      else if (finnhubHealth.stale) finnhubDetail += "; observation is not current for this session";
    }
    const yahooCandidate: MarketQuoteCandidate | null = latestYahooHistoryBar
      ? {
        provider: "yahoo",
        price: latestYahooHistoryBar.close,
        observedAtMs: latestYahooHistoryBar.time,
        fetchedAtMs: history.minute.fetchedAt,
        source: "Yahoo Finance NVDA chart fallback · may be delayed",
      }
      : null;
    const selectedQuote = selectMarketQuote(
      [durableCandidate, alpacaCandidate, finnhubCandidate, yahooCandidate].filter(
        (candidate): candidate is MarketQuoteCandidate => candidate != null,
      ),
      marketState.session,
      endpointCheckedAtMs,
    );
    const selectedQuoteProvider: QuoteProvider = selectedQuote?.provider ?? "yahoo";
    const quoteObservedAtMs = selectedQuote?.observedAtMs ?? null;
    const quoteFetchedAtMs = selectedQuote?.fetchedAtMs ?? null;
    const selectedQuoteHealth = selectedQuote?.health ?? marketQuoteHealth(
      null,
      marketState.session,
      endpointCheckedAtMs,
    );
    const quoteAgeMs = selectedQuoteHealth.ageMs;
    const quoteStale = selectedQuoteHealth.stale;
    let selectedQuoteStatus: SourceStatus = quoteObservedAtMs != null ? "ok" : "stale";
    if (quoteStale || selectedQuoteHealth.futureSkew) selectedQuoteStatus = "stale";
    let source = selectedQuote?.source ?? "Current NVDA quote unavailable";
    const legacyAsOf = iso(quoteObservedAtMs) ?? "";
    const realtime = Boolean(marketState.regularMarketOpen && selectedQuoteHealth.currentForSession);

    const parts = historicalBars.map((bar) => {
      const timeParts = ny(bar.time / 1000);
      return { bar, parts: timeParts, date: keyFromParts(timeParts) };
    });
    const targetBars = parts.filter((item) => item.date === targetDate);
    const latestDate = parts.at(-1)?.date;
    const displayBars = (targetBars.length || explicitTargetDate
      ? targetBars
      : parts.filter((item) => item.date === latestDate)
    ).map((item) => item.bar);
    const analysisBars = completedMarketBars(displayBars, effectiveAsOf);
    const completedTargetBars = completedMarketBars(
      targetBars.map((item) => item.bar),
      effectiveAsOf,
    );
    const completedTargetParts = completedTargetBars.map((bar) => {
      const timeParts = ny(bar.time / 1000);
      return { bar, parts: timeParts, date: keyFromParts(timeParts) };
    });
    const premarket = completedTargetParts
      .filter(
        ({ parts: timeParts }) =>
          (Number(timeParts.hour) >= 4 && Number(timeParts.hour) < 9) ||
          (Number(timeParts.hour) === 9 && Number(timeParts.minute) < 30),
      )
      .map((item) => item.bar);
    const targetCloseMinute = targetSchedule.earlyClose ? 13 * 60 : 16 * 60;
    const regular = completedTargetParts
      .filter(
        ({ parts: timeParts }) => {
          const minute = Number(timeParts.hour) * 60 + Number(timeParts.minute);
          return minute >= 570 && minute < targetCloseMinute;
        },
      )
      .map((item) => item.bar);
    const firstItem = completedTargetParts.find(
      ({ parts: timeParts }) =>
        Number(timeParts.hour) === 9 && Number(timeParts.minute) === 30,
    );
    const first = firstItem?.bar;

    // A Yahoo 9:30 bar needs a later watermark because it may still be forming.
    // A hash-verified durable row is already a completed-minute revision and
    // therefore supplies its own completion watermark.
    const hasLaterWatermark = targetBars.some(({ parts: timeParts }) => {
      const minute = Number(timeParts.hour) * 60 + Number(timeParts.minute);
      return minute >= 571;
    });
    const firstMinuteIsDurable = Boolean(first && durableBarByMinute.has(first.time));
    const firstMinuteComplete = Boolean(
      first &&
        (targetDate < todayKey ||
          (targetDate === todayKey &&
            effectiveAsOf >= targetSchedule.regularOpenAt + 60_000 &&
            nowMinute >= 571 &&
            (firstMinuteIsDurable || hasLaterWatermark))),
    );
    const firstMinuteStatus = !first
      ? "NOT_STARTED"
      : firstMinuteComplete
        ? "COMPLETE"
        : "FORMING_931";

    const quoteDay =
      targetDate === todayKey && marketState.session === "MARKET OPEN";
    const endpointCompletedAtMs = Date.now();
    if ((view === "DECISION_FREEZE" || requestedView === "STRICT") && endpointCompletedAtMs >= targetSchedule.decisionFreezeAt) {
      // A request that began before the cutoff but completed after it is also
      // ineligible: its received/processed values were not available in time.
      // Recheck the immutable archive because STRICT may have resolved to
      // LATEST at request start; never return that live response after crossing.
      const archived = await archivedFreezeEnvelope({
        targetDate,
        requestedAt: endpointCompletedAtMs,
        cutoff: targetSchedule.decisionFreezeAt,
      });
      if (archived) {
        return Response.json({
          marketContract: archived,
          symbol: "NVDA",
          targetDate,
          checkedAt: new Date(endpointCompletedAtMs).toISOString(),
          session: "FROZEN",
          source: "Aperture D1 point-in-time archive",
          realtime: false,
        }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
      }
      return Response.json(
        {
          error: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE",
          targetDate,
          marketContract: unavailableFreezeEnvelope({
            targetDate,
            requestedAt: endpointCheckedAtMs,
            effectiveAsOf: targetSchedule.decisionFreezeAt,
          }),
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    // The response cannot claim an as-of instant earlier than normalization and
    // provider processing. Selection still uses the conservative request-start
    // cutoff above; availability is exposed at completion.
    const contractEffectiveAsOf = endpointCompletedAtMs;
    const minuteHistoryCacheAgeMs = history.minute.fetchedAt == null
      ? null
      : Math.max(0, endpointCompletedAtMs - history.minute.fetchedAt);
    const dailyHistoryCacheAgeMs = history.daily.fetchedAt == null
      ? null
      : Math.max(0, endpointCompletedAtMs - history.daily.fetchedAt);
    const historyCacheAgeMs = minuteHistoryCacheAgeMs ?? dailyHistoryCacheAgeMs;
    const minuteHistoryStale =
      minuteChart == null ||
      history.minute.staleIfError ||
      minuteHistoryCacheAgeMs == null ||
      minuteHistoryCacheAgeMs > HISTORY_STALE_MS;

    const completedDailyTimestamps = selectedDailyRows
      .filter((row) => daily.some((item) => item.dateKey === row.dateKey))
      .map((row) => row.timestampMs)
      .filter(valid);
    const dailyObservedAtMs = completedDailyTimestamps.at(-1) ?? null;
    const earliestDailyObservedAtMs = completedDailyTimestamps.at(0) ?? null;
    const historyObservedAtMs = latestHistoryBar?.time ?? null;
    const historyWindowStartObservedAtMs = Math.min(
      ...[
        earliestDailyObservedAtMs,
        historicalBars.at(0)?.time ?? null,
      ].filter(valid),
    );
    const observedCandidates = [
      quoteObservedAtMs,
      historyObservedAtMs,
      dailyObservedAtMs,
      Number.isFinite(historyWindowStartObservedAtMs) ? historyWindowStartObservedAtMs : null,
    ].filter(valid);
    const newestInputObservedAtMs = observedCandidates.length
      ? Math.max(...observedCandidates)
      : null;
    const oldestInputObservedAtMs = observedCandidates.length
      ? Math.min(...observedCandidates)
      : null;
    const expectedPreviousSession = previousNasdaqSession(targetDate, { inclusive: false });
    const expectedPreviousDaily = daily.find((row) => row.dateKey === expectedPreviousSession);
    const expectedPreviousSourceRow = eligibleDailyRows.find(
      (row) => row.dateKey === expectedPreviousSession,
    ) ?? null;
    const snapshotBarDate = (bar: AlpacaBar | undefined) => {
      const timestamp = Date.parse(bar?.t ?? "");
      return Number.isFinite(timestamp) ? newYorkDateKey(timestamp) : null;
    };
    type PreviousCloseEvidence = {
      value: number;
      session: string | null;
      provider: string;
      fetchedAtMs: number | null;
      dateVerified: boolean;
    };
    const dailyProvider = alpacaDailyRows.length ? "alpaca_sip_history" : "yahoo_daily";
    const dailyFetchedAtMs = alpacaDailyRows.length
      ? alpacaDaily?.fetchedAt ?? null
      : history.daily.fetchedAt;
    const snapshotCandidates = [alpacaLive?.dailyBar, alpacaLive?.prevDailyBar]
      .flatMap((bar): PreviousCloseEvidence[] => {
        const session = snapshotBarDate(bar);
        return valid(bar?.c) && session && session < targetDate
          ? [{
              value: bar!.c!,
              session,
              provider: "alpaca_iex_snapshot",
              fetchedAtMs: alpacaFetchedAtMs,
              dateVerified: true,
            }]
          : [];
      });
    const verifiedPreviousClose: PreviousCloseEvidence | null = expectedPreviousDaily
      ? {
          value: expectedPreviousDaily.close,
          session: expectedPreviousSession,
          provider: dailyProvider,
          fetchedAtMs: dailyFetchedAtMs,
          dateVerified: true,
        }
      : snapshotCandidates.find((candidate) => candidate.session === expectedPreviousSession) ?? null;
    const latestDaily = daily.at(-1);
    const datedFallbackCandidates: PreviousCloseEvidence[] = [
      ...(latestDaily
        ? [{
            value: latestDaily.close,
            session: latestDaily.dateKey ?? null,
            provider: dailyProvider,
            fetchedAtMs: dailyFetchedAtMs,
            dateVerified: true,
          }]
        : []),
      ...snapshotCandidates,
    ].filter((candidate) => candidate.session !== expectedPreviousSession)
      .sort((left, right) => (right.session ?? "").localeCompare(left.session ?? ""));
    const undatedFallbackCandidates: PreviousCloseEvidence[] = [
      ...(valid(liveQuote?.pc)
        ? [{
            value: liveQuote!.pc!,
            session: null,
            provider: "finnhub_quote_previous_close",
            fetchedAtMs: finnhubFetchedAtMs,
            dateVerified: false,
          }]
        : []),
      ...(valid(minuteChart?.meta?.chartPreviousClose)
        ? [{
            value: minuteChart!.meta!.chartPreviousClose!,
            session: null,
            provider: "yahoo_chart_previous_close",
            fetchedAtMs: history.minute.fetchedAt,
            dateVerified: false,
          }]
        : []),
      ...(valid(minuteChart?.meta?.previousClose)
        ? [{
            value: minuteChart!.meta!.previousClose!,
            session: null,
            provider: "yahoo_previous_close",
            fetchedAtMs: history.minute.fetchedAt,
            dateVerified: false,
          }]
        : []),
    ];
    const fallbackPreviousClose = datedFallbackCandidates[0] ?? undatedFallbackCandidates[0] ?? null;
    const previousCloseEvidence = verifiedPreviousClose ?? fallbackPreviousClose;
    // previousClose is forecast-critical. Never substitute an older or undated
    // candidate for the expected prior Nasdaq session; expose that evidence
    // separately so callers can diagnose degradation without consuming it.
    const previousClose = verifiedPreviousClose?.value ?? null;
    const previousCloseStatus = verifiedPreviousClose
      ? "verified"
      : previousCloseEvidence
        ? "degraded"
        : "unavailable";
    if (!selectedQuote) {
      source = verifiedPreviousClose
        ? `Verified ${expectedPreviousSession} NVDA close · no current quote`
        : "Current quote and verified prior-session close unavailable";
    }
    const targetSpecificPrice = targetDate === todayKey && view === "LATEST"
      ? selectedQuote?.price ?? completedTargetBars.at(-1)?.close ?? targetDailyRow?.close ?? null
      : completedTargetBars.at(-1)?.close ?? targetDailyRow?.close ?? null;
    const price = explicitTargetDate
      ? targetSpecificPrice
      : selectedQuote?.price ?? previousClose;
    const usesLatestQuote = Boolean(
      targetDate === todayKey && view === "LATEST" && selectedQuote && valid(price),
    );
    if (explicitTargetDate && targetDate !== todayKey) {
      source = targetSpecificPrice == null
        ? `No qualified ${targetDate} NVDA observation is available`
        : durableCompletedBars.length
          ? `Aperture durable ${durableCompletedBars[0]!.provider} ${durableCompletedBars[0]!.feed.toUpperCase()} completed-minute stream · research only`
          : targetBars.length
          ? `Yahoo Finance ${targetDate} completed minute history · may be delayed`
          : `${dailyProvider} completed ${targetDate} daily history`;
    }
    if (!valid(price) && !daily.length && !historicalBars.length) {
      throw new Error("All quote and historical providers are unavailable");
    }
    const displaySessionDate = targetBars.length
      ? targetDate
      : explicitTargetDate
        ? targetDate
        : latestDate ?? null;
    const displaySessionRelation = targetBars.length
      ? "target_session"
      : explicitTargetDate
        ? "unavailable"
        : displaySessionDate
        ? "latest_available"
        : "unavailable";
    const yahooDailyStatus: SourceStatus = dailyChart
      ? history.daily.staleIfError || (dailyHistoryCacheAgeMs ?? Infinity) > HISTORY_STALE_MS
        ? "stale"
        : "ok"
      : "error";
    const dailyStatus: SourceStatus = alpacaDaily ? "ok" : yahooDailyStatus;
    const yahooMinuteStatus: SourceStatus = minuteChart
      ? minuteHistoryStale ? "stale" : "ok"
      : "error";
    const minuteStatus: SourceStatus = durableCompletedBars.length
      ? "ok"
      : yahooMinuteStatus;
    const yahooStatus: SourceStatus = yahooDailyStatus === "error" && yahooMinuteStatus === "error"
      ? "error"
      : yahooDailyStatus !== "ok" || yahooMinuteStatus !== "ok"
        ? "stale"
        : "ok";
    const alpacaCurrent = alpacaHealth.currentForSession;
    const finnhubCurrent = finnhubHealth.currentForSession;

    const relation = classifyTargetSession(targetDate, endpointCheckedAtMs);
    const targetFreshness = targetFieldFreshness({
      targetDate,
      todayKey,
      nowMs: effectiveAsOf,
      regularOpenAt: targetSchedule.regularOpenAt,
      regularCloseAt: targetSchedule.regularCloseAt,
      view,
    });
    const durableMinuteSource = durableCompletedBars.at(-1) ?? null;
    const minuteProvider = durableCompletedBars.length
      ? minuteChart
        ? `Aperture durable ${durableMinuteSource!.provider} ${durableMinuteSource!.feed.toUpperCase()} stream + Yahoo Finance fallback`
        : `Aperture durable ${durableMinuteSource!.provider} ${durableMinuteSource!.feed.toUpperCase()} stream`
      : minuteChart
        ? "Yahoo Finance"
        : "Minute history unavailable";
    const minuteCoverage = durableCompletedBars.length
      ? "Research-only completed-minute evidence. Durable revisions override the same REST minute without averaging; gaps may retain public chart fallbacks. IEX is never consolidated or strict execution coverage."
      : "Public NVDA one-minute chart history; may be delayed and is not consolidated execution data.";
    const minuteReceivedAt = history.minute.fetchedAt;
    const dailySourceId = alpacaDaily ? "alpaca_sip_history" : "yahoo";
    const dailyProviderName = alpacaDaily ? "Alpaca SIP daily history" : "Yahoo Finance daily history";
    const dailyCoverage = alpacaDaily
      ? "Consolidated completed daily OHLCV history; not a live execution quote."
      : "Public completed daily OHLCV history; may be delayed.";
    const dailyReceivedAtForContract = alpacaDaily?.fetchedAt ?? history.daily.fetchedAt;
    const targetMinuteObservedAt = completedTargetBars.at(-1)?.time ?? null;
    const targetDailyObservedAt = targetDailyRow?.timestampMs ?? null;
    const targetHistoryObservedAt = targetMinuteObservedAt ?? targetDailyObservedAt;
    const targetDurableMinute = targetMinuteObservedAt == null
      ? null
      : durableBarByMinute.get(targetMinuteObservedAt) ?? null;
    const targetHistoryReceivedAt = targetMinuteObservedAt != null
      ? targetDurableMinute?.receivedAt ?? minuteReceivedAt
      : targetDailyRow
        ? dailyReceivedAtForContract
        : null;
    const durableMinuteProvenance = (bar: MarketCompletedMinuteBar): MarketProvenance => ({
      sourceId: `market_stream:${bar.provider}:${bar.feed}`,
      provider: `Aperture durable ${bar.provider} ${bar.feed.toUpperCase()} completed-minute stream`,
      coverage: minuteCoverage,
      sourceObservedAt: bar.providerTime,
      receivedAt: bar.receivedAt,
      processedAt: bar.processedAt,
      availableAt: bar.availableAt,
      checkedAt: endpointCheckedAtMs,
      persistedAt: bar.createdAt,
      ageMs: Math.max(0, bar.processedAt - bar.providerTime),
    });
    const targetHistoryProvenance = targetDurableMinute
      ? durableMinuteProvenance(targetDurableMinute)
      : marketProvenance({
        sourceId: targetMinuteObservedAt != null ? "yahoo" : dailySourceId,
        provider: targetMinuteObservedAt != null ? minuteProvider : dailyProviderName,
        coverage: targetMinuteObservedAt != null ? minuteCoverage : dailyCoverage,
        sourceObservedAt: targetHistoryObservedAt,
        receivedAt: targetHistoryReceivedAt,
        processedAt: endpointCompletedAtMs,
        checkedAt: endpointCheckedAtMs,
      });
    const minuteProvenance = (observedAt: number | null) => {
      const durableBar = observedAt == null ? null : durableBarByMinute.get(observedAt) ?? null;
      return durableBar
        ? durableMinuteProvenance(durableBar)
        : marketProvenance({
          sourceId: "yahoo",
          provider: minuteProvider,
          coverage: minuteCoverage,
          sourceObservedAt: observedAt,
          receivedAt: minuteReceivedAt,
          processedAt: endpointCompletedAtMs,
          checkedAt: endpointCheckedAtMs,
        });
    };
    const previousProvenance = marketProvenance({
      sourceId: dailySourceId,
      provider: dailyProviderName,
      coverage: dailyCoverage,
      sourceObservedAt: expectedPreviousSourceRow?.timestampMs ?? null,
      receivedAt: dailyReceivedAtForContract,
      processedAt: endpointCompletedAtMs,
      checkedAt: endpointCheckedAtMs,
    });
    const previousSessionNotComplete = nasdaqSessionSchedule(expectedPreviousSession).regularCloseAt > effectiveAsOf;
    const unavailableForHistory = (
      notStarted: boolean,
      notStartedReason: string,
      missingReason: string,
      providerFailed: boolean,
      provenance: MarketProvenance | null = null,
    ): MarketValue<number> => unavailableMarketValue({
      availability: notStarted ? "NOT_STARTED" : providerFailed ? "SOURCE_ERROR" : "MISSING",
      reasonCode: notStarted ? notStartedReason : providerFailed ? "MARKET_HISTORY_SOURCE_ERROR" : missingReason,
      provenance,
    });
    const completedValue = (
      value: number | null | undefined,
      notStarted: boolean,
      notStartedReason: string,
      missingReason: string,
      provenance: MarketProvenance,
      freshness = targetFreshness,
      providerFailed = false,
    ): MarketValue<number> => valid(value)
      ? marketValue({ value, freshness, provenance })
      : unavailableForHistory(notStarted, notStartedReason, missingReason, providerFailed, provenance);

    const quoteNotStarted = targetDate > todayKey || effectiveAsOf < targetSchedule.premarketOpenAt;
    let contractQuote: MarketValue<number>;
    if (quoteNotStarted) {
      contractQuote = unavailableMarketValue({
        availability: "NOT_STARTED",
        reasonCode: "TARGET_SESSION_NOT_STARTED",
      });
    } else if (targetDate === todayKey && view === "LATEST" && selectedQuote && valid(price)) {
      const selectedQuoteProvenance = selectedQuote.provider === "aperture_stream"
        ? {
          sourceId: selectedQuote.sourceId ?? "market_stream",
          provider: selectedQuote.source,
          coverage: selectedQuote.coverage ?? "Durable research observation; execution qualification unavailable.",
          sourceObservedAt: selectedQuote.observedAtMs,
          receivedAt: selectedQuote.receivedAtMs ?? selectedQuote.fetchedAtMs,
          processedAt: selectedQuote.processedAtMs ?? endpointCompletedAtMs,
          availableAt: selectedQuote.availableAtMs ?? selectedQuote.fetchedAtMs,
          checkedAt: endpointCheckedAtMs,
          persistedAt: selectedQuote.persistedAtMs ?? null,
          ageMs: selectedQuote.observedAtMs == null
            ? null
            : Math.max(0, (selectedQuote.processedAtMs ?? endpointCompletedAtMs) - selectedQuote.observedAtMs),
        } satisfies MarketProvenance
        : marketProvenance({
          sourceId: selectedQuote.provider,
          provider: selectedQuote.source,
          coverage: selectedQuote.provider === "alpaca_iex"
            ? "IEX single-exchange reference; not consolidated SIP."
            : selectedQuote.provider === "finnhub"
              ? "Fallback quote; coverage depends on the configured plan."
              : minuteCoverage,
          sourceObservedAt: selectedQuote.observedAtMs,
          receivedAt: selectedQuote.fetchedAtMs,
          processedAt: endpointCompletedAtMs,
          checkedAt: endpointCheckedAtMs,
        });
      contractQuote = marketValue({
        value: price,
        freshness: selectedQuoteHealth.currentForSession
          ? "LIVE"
          : marketState.session === "CLOSED"
            ? "MARKET_CLOSED"
            : "STALE",
        provenance: selectedQuoteProvenance,
      });
    } else if (valid(targetSpecificPrice)) {
      contractQuote = marketValue({
        value: targetSpecificPrice,
        freshness: targetFreshness,
        provenance: targetHistoryProvenance,
      });
    } else {
      contractQuote = unavailableForHistory(
        false,
        "TARGET_SESSION_NOT_STARTED",
        "TARGET_SESSION_OBSERVATION_MISSING",
        minuteStatus === "error" && dailyStatus === "error",
        targetHistoryProvenance,
      );
    }

    const previousValue = (
      value: number | null | undefined,
      missingReason: string,
    ) => completedValue(
      value,
      previousSessionNotComplete,
      "PREVIOUS_SESSION_NOT_FINAL",
      missingReason,
      previousProvenance,
      "FINAL",
      dailyStatus === "error",
    );
    const premarketStarted = effectiveAsOf >= targetSchedule.premarketOpenAt;
    const regularStarted = effectiveAsOf >= targetSchedule.regularOpenAt;
    const firstMinuteReady = effectiveAsOf >= targetSchedule.regularOpenAt + 60_000 && firstMinuteComplete;
    const premarketFreshness: Exclude<MarketFreshness, null> =
      view === "DECISION_FREEZE"
        ? "FROZEN"
        : targetDate === todayKey && effectiveAsOf < targetSchedule.regularOpenAt ? "LIVE" : "FINAL";
    const regularFreshness: Exclude<MarketFreshness, null> =
      view === "DECISION_FREEZE"
        ? "FROZEN"
        : targetDate === todayKey && effectiveAsOf < targetSchedule.regularCloseAt ? "LIVE" : "FINAL";
    const premarketObservedAt = premarket.at(-1)?.time ?? null;
    const regularObservedAt = regular.at(-1)?.time ?? null;
    const premarketProvenance = minuteProvenance(premarketObservedAt);
    const regularProvenance = minuteProvenance(regularObservedAt);
    const firstMinuteProvenance = minuteProvenance(first?.time ?? null);
    const minuteProviderFailed = minuteStatus === "error";
    const premarketHigh = premarket.length ? Math.max(...premarket.map((bar) => bar.high)) : null;
    const premarketLow = premarket.length ? Math.min(...premarket.map((bar) => bar.low)) : null;
    const premarketVolume = premarket.length
      ? premarket.reduce((sum, bar) => sum + bar.volume, 0)
      : null;
    const regularOpen = regular.at(0)?.open ?? null;
    const regularHigh = regular.length ? Math.max(...regular.map((bar) => bar.high)) : null;
    const regularLow = regular.length ? Math.min(...regular.map((bar) => bar.low)) : null;
    const regularClose = regular.at(-1)?.close ?? null;
    const regularVolume = regular.length
      ? regular.reduce((sum, bar) => sum + bar.volume, 0)
      : null;
    const durablePersistedAtCandidates = [
      durableCandidate?.persistedAtMs ?? null,
      ...durableCompletedBars.map((bar) => bar.createdAt),
    ].filter(valid);
    const durableLatestPersistedAt = durablePersistedAtCandidates.length
      ? Math.max(...durablePersistedAtCandidates)
      : null;
    const durableHasEvidence = durableCandidate != null || durableCompletedBars.length > 0;
    const durableReadDegraded = durableLatest.observationReadFailed || durableLatest.completedBarReadFailed;
    const archiveStatus: TargetMarketEnvelope["archive"]["status"] = durableHasEvidence
      ? durableReadDegraded ? "STALE" : "CURRENT"
      : durableLatest.databaseAvailable && !durableReadDegraded
        ? "EMPTY"
        : "UNAVAILABLE";

    const marketContract: TargetMarketEnvelope = {
      schemaVersion: TARGET_MARKET_SCHEMA_VERSION,
      symbol: "NVDA",
      targetDate,
      relation,
      requestedAt: endpointCheckedAtMs,
      effectiveAsOf: contractEffectiveAsOf,
      view,
      schedule: {
        premarketOpenAt: targetSchedule.premarketOpenAt,
        regularOpenAt: targetSchedule.regularOpenAt,
        regularCloseAt: targetSchedule.regularCloseAt,
        earlyClose: targetSchedule.earlyClose,
      },
      archive: {
        status: archiveStatus,
        latestPersistedAt: durableLatestPersistedAt,
        latestCompletedBarAt: completedTargetBars.at(-1)?.time != null
          ? completedTargetBars.at(-1)!.time + 60_000
          : null,
      },
      quote: contractQuote,
      previousSession: {
        date: expectedPreviousSession,
        open: previousValue(expectedPreviousSourceRow?.open, "PREVIOUS_SESSION_OPEN_MISSING"),
        high: previousValue(expectedPreviousSourceRow?.high, "PREVIOUS_SESSION_HIGH_MISSING"),
        low: previousValue(expectedPreviousSourceRow?.low, "PREVIOUS_SESSION_LOW_MISSING"),
        close: previousValue(expectedPreviousSourceRow?.close, "PREVIOUS_SESSION_CLOSE_MISSING"),
        volume: previousValue(expectedPreviousSourceRow?.volume, "PREVIOUS_SESSION_VOLUME_MISSING"),
      },
      targetSession: {
        premarket: {
          high: completedValue(premarketHigh, !premarketStarted, "TARGET_PREMARKET_NOT_STARTED", "TARGET_PREMARKET_HIGH_MISSING", premarketProvenance, premarketFreshness, minuteProviderFailed),
          low: completedValue(premarketLow, !premarketStarted, "TARGET_PREMARKET_NOT_STARTED", "TARGET_PREMARKET_LOW_MISSING", premarketProvenance, premarketFreshness, minuteProviderFailed),
          current: completedValue(premarket.at(-1)?.close, !premarketStarted, "TARGET_PREMARKET_NOT_STARTED", "TARGET_PREMARKET_CURRENT_MISSING", premarketProvenance, premarketFreshness, minuteProviderFailed),
          volume: completedValue(premarketVolume, !premarketStarted, "TARGET_PREMARKET_NOT_STARTED", "TARGET_PREMARKET_VOLUME_MISSING", premarketProvenance, premarketFreshness, minuteProviderFailed),
        },
        regular: {
          open: completedValue(regularOpen, !regularStarted, "TARGET_REGULAR_SESSION_NOT_STARTED", "TARGET_REGULAR_OPEN_MISSING", regularProvenance, regularFreshness, minuteProviderFailed),
          high: completedValue(regularHigh, !regularStarted, "TARGET_REGULAR_SESSION_NOT_STARTED", "TARGET_REGULAR_HIGH_MISSING", regularProvenance, regularFreshness, minuteProviderFailed),
          low: completedValue(regularLow, !regularStarted, "TARGET_REGULAR_SESSION_NOT_STARTED", "TARGET_REGULAR_LOW_MISSING", regularProvenance, regularFreshness, minuteProviderFailed),
          close: completedValue(regularClose, !regularStarted, "TARGET_REGULAR_SESSION_NOT_STARTED", "TARGET_REGULAR_CLOSE_MISSING", regularProvenance, regularFreshness, minuteProviderFailed),
          volume: completedValue(regularVolume, !regularStarted, "TARGET_REGULAR_SESSION_NOT_STARTED", "TARGET_REGULAR_VOLUME_MISSING", regularProvenance, regularFreshness, minuteProviderFailed),
        },
        firstMinute: {
          high: completedValue(firstMinuteReady ? first?.high : null, !firstMinuteReady, first ? "TARGET_FIRST_MINUTE_FORMING" : "TARGET_FIRST_MINUTE_NOT_STARTED", "TARGET_FIRST_MINUTE_HIGH_MISSING", firstMinuteProvenance, "FINAL", minuteProviderFailed),
          low: completedValue(firstMinuteReady ? first?.low : null, !firstMinuteReady, first ? "TARGET_FIRST_MINUTE_FORMING" : "TARGET_FIRST_MINUTE_NOT_STARTED", "TARGET_FIRST_MINUTE_LOW_MISSING", firstMinuteProvenance, "FINAL", minuteProviderFailed),
          close: completedValue(firstMinuteReady ? first?.close : null, !firstMinuteReady, first ? "TARGET_FIRST_MINUTE_FORMING" : "TARGET_FIRST_MINUTE_NOT_STARTED", "TARGET_FIRST_MINUTE_CLOSE_MISSING", firstMinuteProvenance, "FINAL", minuteProviderFailed),
          volume: completedValue(firstMinuteReady ? first?.volume : null, !firstMinuteReady, first ? "TARGET_FIRST_MINUTE_FORMING" : "TARGET_FIRST_MINUTE_NOT_STARTED", "TARGET_FIRST_MINUTE_VOLUME_MISSING", firstMinuteProvenance, "FINAL", minuteProviderFailed),
          complete: firstMinuteReady,
        },
      },
    };

    return Response.json(
      {
        marketContract,
        symbol: "NVDA",
        targetDate,
        price,
        previousClose,
        previousCloseSession: verifiedPreviousClose?.session ?? null,
        previousCloseExpectedSession: expectedPreviousSession,
        previousCloseStatus,
        // Backward-compatible aliases. checkedAt is the endpoint completion,
        // while asOf remains the selected quote's best available timestamp.
        asOf: usesLatestQuote
          ? legacyAsOf
          : explicitTargetDate ? iso(targetHistoryObservedAt) ?? "" : legacyAsOf,
        checkedAt: new Date(endpointCompletedAtMs).toISOString(),
        session: explicitTargetDate && targetDate !== todayKey ? "CLOSED" : marketState.session,
        source,
        realtime: explicitTargetDate
          ? Boolean(targetDate === todayKey && view === "LATEST" && realtime)
          : realtime,
        targetSession: {
          hasBars: targetBars.length > 0,
          hasPremarketBars: premarket.length > 0,
          analysisBarCount: analysisBars.filter((bar) =>
            targetBars.some((item) => item.bar.time === bar.time),
          ).length,
          evidenceQualified: completedTargetBars.length > 0,
        },
        marketState: {
          ...marketState,
          ...(explicitTargetDate && targetDate !== todayKey
            ? { session: "CLOSED", regularMarketOpen: false, reason: "outside_regular_hours" }
            : {}),
          evaluatedAt: new Date(endpointCheckedAtMs).toISOString(),
        },
        displaySession: {
          date: displaySessionDate,
          relation: displaySessionRelation,
          provider: durableCompletedBars.length
            ? minuteChart ? "aperture_durable_stream+yahoo_minute" : "aperture_durable_stream"
            : minuteChart ? "yahoo_minute" : null,
          barCount: displayBars.length,
          latestObservedAt: iso(displayBars.at(-1)?.time),
        },
        freshness: {
          endpoint: {
            checkedAt: new Date(endpointCheckedAtMs).toISOString(),
            completedAt: new Date(endpointCompletedAtMs).toISOString(),
          },
          quote: {
            provider: usesLatestQuote
              ? selectedQuoteProvider
              : explicitTargetDate
              ? targetMinuteObservedAt != null
                ? targetDurableMinute ? "aperture_stream" : "yahoo"
                : targetDailyRow ? dailyProvider : "unavailable"
              : selectedQuoteProvider,
            status: usesLatestQuote
              ? selectedQuoteStatus
              : explicitTargetDate
              ? contractQuote.availability === "AVAILABLE"
                ? contractQuote.freshness === "STALE" ? "stale" : "ok"
                : contractQuote.availability === "NOT_STARTED" ? "standby" : "error"
              : selectedQuoteStatus,
            observedAt: usesLatestQuote
              ? iso(quoteObservedAtMs)
              : explicitTargetDate ? iso(targetHistoryObservedAt) : iso(quoteObservedAtMs),
            fetchedAt: usesLatestQuote
              ? iso(quoteFetchedAtMs)
              : explicitTargetDate ? iso(targetHistoryReceivedAt) : iso(quoteFetchedAtMs),
            ageMs: usesLatestQuote
              ? quoteAgeMs
              : explicitTargetDate ? contractQuote.provenance?.ageMs ?? null : quoteAgeMs,
            stale: usesLatestQuote
              ? quoteStale
              : explicitTargetDate ? contractQuote.freshness === "STALE" : quoteStale,
            marketClosed: usesLatestQuote
              ? marketState.session === "CLOSED"
              : explicitTargetDate
              ? contractQuote.freshness === "MARKET_CLOSED" || contractQuote.freshness === "FINAL"
              : marketState.session === "CLOSED",
            state: usesLatestQuote
              ? selectedQuoteHealth.state
              : explicitTargetDate
              ? contractQuote.availability !== "AVAILABLE"
                ? "unavailable"
                : contractQuote.freshness === "STALE" ? "stale" : contractQuote.freshness === "LIVE" ? "current" : "market_closed"
              : selectedQuoteHealth.state,
            currentForSession: usesLatestQuote
              ? selectedQuoteHealth.currentForSession
              : explicitTargetDate ? contractQuote.freshness === "LIVE" : selectedQuoteHealth.currentForSession,
            futureSkew: usesLatestQuote
              ? selectedQuoteHealth.futureSkew
              : explicitTargetDate ? false : selectedQuoteHealth.futureSkew,
            observationTimeSource:
              (usesLatestQuote
                ? quoteObservedAtMs
                : explicitTargetDate ? targetHistoryObservedAt : quoteObservedAtMs) == null
                ? "unavailable"
                : "provider",
          },
          previousClose: {
            status: previousCloseStatus,
            expectedSession: expectedPreviousSession,
            actualSession: previousCloseEvidence?.session ?? null,
            provider: previousCloseEvidence?.provider ?? null,
            value: previousCloseEvidence?.value ?? null,
            fetchedAt: iso(previousCloseEvidence?.fetchedAtMs),
            dateVerified: Boolean(previousCloseEvidence?.dateVerified),
            usedInForecast: Boolean(verifiedPreviousClose),
            detail: verifiedPreviousClose
              ? `Verified close for the expected prior Nasdaq session ${expectedPreviousSession}`
              : previousCloseEvidence?.session
                ? `Latest dated close is ${previousCloseEvidence.session}; expected ${expectedPreviousSession}. Candidate is diagnostic only and is not used in the forecast.`
                : previousCloseEvidence
                  ? `Provider returned an undated previous-close value; expected ${expectedPreviousSession}. Candidate is diagnostic only and is not used in the forecast.`
                  : `No previous-close candidate was available for expected session ${expectedPreviousSession}.`,
          },
          history: {
            provider: durableCompletedBars.length
              ? alpacaDaily
                ? minuteChart ? "alpaca_sip_daily+aperture_durable_stream+yahoo_minute" : "alpaca_sip_daily+aperture_durable_stream"
                : minuteChart ? "aperture_durable_stream+yahoo" : "aperture_durable_stream"
              : alpacaDaily
                ? minuteChart ? "alpaca_sip_daily+yahoo_minute" : "alpaca_sip_daily"
                : minuteChart ? "yahoo" : dailyChart ? "yahoo_daily" : "unavailable",
            fetchedAt: iso(Math.max(
              ...[
                durableMinuteSource?.availableAt ?? null,
                history.minute.fetchedAt,
                history.daily.fetchedAt,
              ].filter(valid),
            )),
            dailyProvider: alpacaDaily ? "alpaca_sip" : dailyChart ? "yahoo" : "unavailable",
            dailyFetchedAt: alpacaDaily ? iso(alpacaDaily.fetchedAt) : iso(history.daily.fetchedAt),
            minuteProvider: durableCompletedBars.length
              ? minuteChart ? "aperture_durable_stream+yahoo" : "aperture_durable_stream"
              : minuteChart ? "yahoo" : "unavailable",
            minuteFetchedAt: iso(durableMinuteSource?.availableAt ?? history.minute.fetchedAt),
            dailyStatus,
            minuteStatus,
            dailyError: history.daily.error,
            minuteError: history.minute.error,
            durableObservationReadFailed: durableLatest.observationReadFailed,
            durableCompletedBarReadFailed: durableLatest.completedBarReadFailed,
            latestMinuteObservedAt: iso(historyObservedAtMs),
            latestDailyObservedAt: iso(dailyObservedAtMs),
            historyWindowStartObservedAt: iso(historyWindowStartObservedAtMs),
            cacheHit: history.daily.cacheHit || history.minute.cacheHit,
            dailyCacheHit: history.daily.cacheHit,
            minuteCacheHit: history.minute.cacheHit,
            cacheAgeMs: historyCacheAgeMs,
            cacheTtlMs: HISTORY_CACHE_MS,
            stale: minuteStatus !== "ok",
          },
          derived: {
            calculatedAt: new Date(endpointCompletedAtMs).toISOString(),
            oldestInputObservedAt: iso(oldestInputObservedAtMs),
            newestInputObservedAt: iso(newestInputObservedAtMs),
            note: "Calculation time is not a new market observation.",
          },
        },
        sources: [
          {
            id: "previous_close",
            role: "forecast_previous_close",
            status: previousCloseStatus === "verified"
              ? "ok"
              : previousCloseStatus === "degraded"
                ? "stale"
                : "error",
            observedAt: null,
            fetchedAt: iso(previousCloseEvidence?.fetchedAtMs),
            coverage:
              "Forecast-critical prior close; accepted only when its session date matches the expected prior Nasdaq trading session.",
            detail: verifiedPreviousClose
              ? `${verifiedPreviousClose.provider} verified ${expectedPreviousSession}`
              : previousCloseEvidence?.session
                ? `${previousCloseEvidence.provider} supplied ${previousCloseEvidence.session}; expected ${expectedPreviousSession}; excluded from forecast inputs`
                : previousCloseEvidence
                  ? `${previousCloseEvidence.provider} supplied no verifiable session date; expected ${expectedPreviousSession}; excluded from forecast inputs`
                  : `No candidate returned for expected session ${expectedPreviousSession}`,
          },
          {
            id: "aperture_durable_stream",
            role: "durable_research_quote_and_completed_minutes",
            status: durableHasEvidence
              ? durableReadDegraded ? "stale" : "ok"
              : durableLatest.databaseAvailable
                ? durableReadDegraded ? "error" : "standby"
                : "not_configured",
            observedAt: iso(Math.max(
              ...[
                durableCandidate?.observedAtMs ?? null,
                durableMinuteSource?.providerTime ?? null,
              ].filter(valid),
            )),
            fetchedAt: iso(Math.max(
              ...[
                durableCandidate?.availableAtMs ?? null,
                durableMinuteSource?.availableAt ?? null,
              ].filter(valid),
            )),
            coverage:
              "Exact-session, as-of D1 observations and authoritative completed-minute revisions. IEX remains research-only and never satisfies strict execution readiness.",
            detail: `${durableLatest.observations.length} observation row(s), ${durableCompletedBars.length} selected completed minute(s); observation read ${durableLatest.observationReadFailed ? "failed" : "ok"}; minute read ${durableLatest.completedBarReadFailed ? "failed" : "ok"}.`,
          },
          {
            id: "alpaca_iex",
            role: "preferred_reference_quote",
            status: alpacaStatus,
            observedAt: alpacaLive?.latestTrade?.t ?? null,
            fetchedAt: alpacaLive ? iso(alpacaFetchedAtMs) : null,
            coverage:
              "Real-time IEX single-exchange NVDA snapshot on Alpaca Basic; not consolidated SIP NBBO, Tradegate, or Nasdaq NOII.",
            detail: alpacaDetail,
          },
          {
            id: "alpaca_sip_history",
            role: "completed_daily_history",
            status: alpacaDaily ? "ok" : alpaca ? "error" : "not_configured",
            observedAt: iso(dailyObservedAtMs),
            fetchedAt: alpacaDaily ? new Date(alpacaDaily.fetchedAt).toISOString() : null,
            coverage:
              "Consolidated SIP daily OHLCV bars from Alpaca; only completed sessions enter the historical model inputs.",
            detail: alpacaDailyDetail,
          },
          {
            id: "finnhub",
            role: "fallback_reference_quote",
            status: finnhubStatus,
            observedAt: liveQuote?.t ? new Date(liveQuote.t * 1000).toISOString() : null,
            fetchedAt: liveQuote ? iso(finnhubFetchedAtMs) : null,
            coverage:
              "NVDA quote snapshot; exchange coverage and latency depend on the Finnhub plan; not an order book.",
            detail: finnhubDetail,
          },
          {
            id: "yahoo",
            role: alpacaDaily ? "minute_history_and_daily_fallback" : "minute_and_daily_history",
            status: yahooStatus,
            observedAt: iso(latestYahooHistoryBar?.time),
            fetchedAt: iso(history.minute.fetchedAt ?? history.daily.fetchedAt),
            coverage:
              "NVDA public chart history with pre/post-market bars where available; may be delayed and is not guaranteed consolidated market data.",
            detail: `Daily: ${yahooDailyStatus}${history.daily.error ? ` (${history.daily.error})` : ""}; minute: ${yahooMinuteStatus}${history.minute.error ? ` (${history.minute.error})` : ""}`,
          },
        ],
        // Strict consumers may render this legacy alias as calculation input.
        // Keep a still-forming display candle on the research dashboard only;
        // the separately fetched Strict payload exposes completed candles in
        // both aliases so its runtime boundary cannot reject an otherwise
        // coherent current-session response.
        bars: requestedView === "STRICT" ? analysisBars : displayBars,
        analysisBars,
        daily,
        firstMinuteHistory,
        day: {
          open:
            quoteDay && alpacaCurrent && valid(alpacaLive?.dailyBar?.o)
              ? alpacaLive!.dailyBar!.o!
              : quoteDay && finnhubCurrent && valid(liveQuote?.o)
              ? liveQuote!.o!
              : (regular.at(0)?.open ?? null),
          high:
            quoteDay && alpacaCurrent && valid(alpacaLive?.dailyBar?.h)
              ? alpacaLive!.dailyBar!.h!
              : quoteDay && finnhubCurrent && valid(liveQuote?.h)
              ? liveQuote!.h!
              : regular.length
                ? Math.max(...regular.map((bar) => bar.high))
                : null,
          low:
            quoteDay && alpacaCurrent && valid(alpacaLive?.dailyBar?.l)
              ? alpacaLive!.dailyBar!.l!
              : quoteDay && finnhubCurrent && valid(liveQuote?.l)
              ? liveQuote!.l!
              : regular.length
                ? Math.min(...regular.map((bar) => bar.low))
                : null,
          volume:
            quoteDay && alpacaCurrent && valid(alpacaLive?.dailyBar?.v)
              ? alpacaLive!.dailyBar!.v!
              : regular.reduce((sum, bar) => sum + bar.volume, 0),
        },
        premarket: {
          high: premarket.length
            ? Math.max(...premarket.map((bar) => bar.high))
            : null,
          low: premarket.length
            ? Math.min(...premarket.map((bar) => bar.low))
            : null,
          current:
            targetDate === todayKey &&
            marketState.session === "PREMARKET" &&
            selectedQuoteHealth.currentForSession
              ? price
              : (premarket.at(-1)?.close ?? null),
          volume: premarket.reduce((sum, bar) => sum + bar.volume, 0),
        },
        firstMinute: {
          close: first?.close ?? null,
          high: first?.high ?? null,
          low: first?.low ?? null,
          volume: first?.volume ?? 0,
          observedAt: first ? new Date(first.time).toISOString() : null,
          complete: firstMinuteComplete,
          status: firstMinuteStatus,
          completionWatermarkAt: firstMinuteComplete
            ? firstMinuteIsDurable && first
              ? iso(durableBarByMinute.get(first.time)?.minuteEnd)
              : iso(targetBars.at(-1)?.bar.time)
            : null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "CDN-Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    // A 503 means the required Yahoo history source failed. It is independent
    // of the market's open/closed state, which is returned on successful calls.
    console.error("market GET failed", error instanceof Error ? error.message : error);
    return Response.json(
      {
        error: "Market data unavailable",
        detail: "MARKET_DATA_UPSTREAM_UNAVAILABLE",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
