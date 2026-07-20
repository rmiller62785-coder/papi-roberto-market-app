import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
  nextNasdaqSession,
  previousNasdaqSession,
} from "../../market-session.ts";

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

type Session = "CLOSED" | "PREMARKET" | "MARKET OPEN" | "AFTER-HOURS";
type SourceStatus = "ok" | "stale" | "error" | "standby" | "not_configured";

const HISTORY_CACHE_MS = 60_000;
const HISTORY_STALE_MS = 120_000;
const OPEN_QUOTE_STALE_MS = 90_000;
const PREMARKET_QUOTE_STALE_MS = 3 * 60_000;
const AFTER_HOURS_QUOTE_STALE_MS = 5 * 60_000;
const PROVIDER_FUTURE_SKEW_MS = 30_000;
// The browser may check this endpoint every two seconds, but the free Finnhub
// plan cannot safely sustain one upstream quote request per browser poll. A
// short server cache keeps the UI responsive while making provider freshness
// explicit instead of turning rate-limit failures into apparent live data.
const FINNHUB_QUOTE_CACHE_MS = 10_000;
// The browser polls every two seconds. This cache limits upstream traffic to
// one Alpaca snapshot per worker instance during that interval.
const ALPACA_SNAPSHOT_CACHE_MS = 1_500;
const ALPACA_DAILY_CACHE_MS = 5 * 60_000;
const PROVIDER_REQUEST_TIMEOUT_MS = 8_000;
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
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error("Yahoo chart feed failed");
  const json = (await response.json()) as { chart?: { result?: Chart[] } };
  const chart = json.chart?.result?.[0];
  if (!chart) throw new Error("Yahoo chart feed returned no NVDA data");
  return chart;
}

let dailyHistoryCache: ChartCache | null = null;
let minuteHistoryCache: ChartCache | null = null;
let finnhubQuoteCache: FinnhubQuoteCache | null = null;
let alpacaSnapshotCache: AlpacaSnapshotCache | null = null;
let alpacaDailyCache: AlpacaDailyCache | null = null;

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
    const chart = kind === "daily"
      ? await yahoo("1d", "1mo", false)
      : await yahoo("1m", "5d", true);
    const fetchedAt = Date.now();
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
  return (chart.timestamp ?? [])
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
    );
}

// The key stays server-side; browser clients receive only normalized NVDA data.
async function finnhubQuote(key: string) {
  const now = Date.now();
  if (finnhubQuoteCache && finnhubQuoteCache.expires > now) {
    return { ...finnhubQuoteCache, cacheHit: true };
  }
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
}

const iso = (value: number | null | undefined) =>
  valid(value) ? new Date(value).toISOString() : null;

type QuoteProvider = "alpaca_iex" | "finnhub" | "yahoo";

export type MarketQuoteCandidate = {
  provider: QuoteProvider;
  price: number;
  observedAtMs: number | null;
  fetchedAtMs: number | null;
  source: string;
};

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
  }));
  const current = evaluated.find((candidate) => candidate.health.currentForSession);
  if (current) return current;
  const timestamped = evaluated
    .filter((candidate) => valid(candidate.observedAtMs) && !candidate.health.futureSkew)
    .sort((a, b) => (b.observedAtMs ?? 0) - (a.observedAtMs ?? 0));
  return timestamped[0] ?? evaluated[0];
}

export async function GET() {
  const endpointCheckedAtMs = Date.now();
  try {
    const finnhubKey = (globalThis as unknown as {
      process?: { env?: Record<string, string> };
    }).process?.env?.FINNHUB_API_KEY;
    const alpaca = alpacaCredentials();
    const targetDate = marketTargetSessionDate(endpointCheckedAtMs);
    const todayKey = newYorkDateKey(endpointCheckedAtMs);
    const marketState = marketSessionState(endpointCheckedAtMs);
    const history = await marketHistory();
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
        timestampMs,
      }];
    });
    const selectedDailyRows = alpacaDailyRows.length ? alpacaDailyRows : yahooDailyRows;
    const daily = selectedDailyRows
      .filter(
        (row): row is {
           date: string;
           dateKey: string;
           open: number;
           high: number;
           low: number;
           close: number;
           timestampMs: number;
        } =>
           row.dateKey < targetDate &&
           Number.isFinite(row.timestampMs) &&
           valid(row.open) &&
           valid(row.high) &&
          valid(row.low) &&
          valid(row.close),
      )
      .slice(-20)
      .map(({ date, dateKey, open, high, low, close }) => ({ date, dateKey, open, high, low, close }));

    const historicalBars = chartBars(minuteChart);
    const historicalParts = historicalBars.map((bar) => ({
      bar,
      parts: ny(bar.time / 1000),
    }));
    const firstMinuteHistory = historicalParts
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
    let alpacaLive: AlpacaSnapshot | null = null;
    let liveQuote: FinnhubQuote | null = null;
    let alpacaFetchedAtMs: number | null = null;
    let finnhubFetchedAtMs: number | null = null;
    let alpacaStatus: SourceStatus = alpaca ? "error" : "not_configured";
    let alpacaDetail = alpaca
      ? "Alpaca IEX snapshot request did not complete"
      : "APCA_API_KEY_ID / APCA_API_SECRET_KEY are not configured";
    let finnhubStatus: SourceStatus = finnhubKey ? "standby" : "not_configured";
    let finnhubDetail = finnhubKey
      ? "Configured as the fallback reference quote"
      : "FINNHUB_API_KEY is not configured";

    if (alpaca) {
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

    if (finnhubKey && marketState.session !== "CLOSED" && (!alpacaCandidate || !alpacaHealth.currentForSession)) {
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
    const yahooCandidate: MarketQuoteCandidate | null = latestHistoryBar
      ? {
        provider: "yahoo",
        price: latestHistoryBar.close,
        observedAtMs: latestHistoryBar.time,
        fetchedAtMs: history.minute.fetchedAt,
        source: "Yahoo Finance NVDA chart fallback · may be delayed",
      }
      : null;
    const selectedQuote = selectMarketQuote(
      [alpacaCandidate, finnhubCandidate, yahooCandidate].filter(
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
    const displayBars = (targetBars.length
      ? targetBars
      : parts.filter((item) => item.date === latestDate)
    ).map((item) => item.bar);
    const analysisBars = displayBars.filter(
      (bar) => bar.time + 60_000 <= endpointCheckedAtMs,
    );
    const premarket = targetBars
      .filter(
        ({ parts: timeParts }) =>
          Number(timeParts.hour) < 9 ||
          (Number(timeParts.hour) === 9 && Number(timeParts.minute) < 30),
      )
      .map((item) => item.bar);
    const targetCloseMinute = nasdaqSessionSchedule(targetDate).earlyClose ? 13 * 60 : 16 * 60;
    const regular = targetBars
      .filter(
        ({ parts: timeParts }) => {
          const minute = Number(timeParts.hour) * 60 + Number(timeParts.minute);
          return minute >= 570 && minute < targetCloseMinute;
        },
      )
      .map((item) => item.bar);
    const firstItem = targetBars.find(
      ({ parts: timeParts }) =>
        Number(timeParts.hour) === 9 && Number(timeParts.minute) === 30,
    );
    const first = firstItem?.bar;

    // A visible 9:30 bar may still be changing. It is complete only after the
    // clock has passed 9:31 ET and Yahoo has published a later bar watermark.
    const hasLaterWatermark = targetBars.some(({ parts: timeParts }) => {
      const minute = Number(timeParts.hour) * 60 + Number(timeParts.minute);
      return minute >= 571;
    });
    const firstMinuteComplete = Boolean(
      first &&
        (targetDate < todayKey ||
          (targetDate === todayKey && nowMinute >= 571 && hasLaterWatermark)),
    );
    const firstMinuteStatus = !first
      ? "NOT_STARTED"
      : firstMinuteComplete
        ? "COMPLETE"
        : "FORMING_931";

    const quoteDay =
      targetDate === todayKey && marketState.session === "MARKET OPEN";
    const endpointCompletedAtMs = Date.now();
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
    const price = selectedQuote?.price ?? previousClose;
    if (!valid(price) && !daily.length && !historicalBars.length) {
      throw new Error("All quote and historical providers are unavailable");
    }
    const displaySessionDate = targetBars.length ? targetDate : latestDate ?? null;
    const displaySessionRelation = targetBars.length
      ? "target_session"
      : displaySessionDate
        ? "latest_available"
        : "unavailable";
    const yahooDailyStatus: SourceStatus = dailyChart
      ? history.daily.staleIfError || (dailyHistoryCacheAgeMs ?? Infinity) > HISTORY_STALE_MS
        ? "stale"
        : "ok"
      : "error";
    const dailyStatus: SourceStatus = alpacaDaily ? "ok" : yahooDailyStatus;
    const minuteStatus: SourceStatus = minuteChart
      ? minuteHistoryStale ? "stale" : "ok"
      : "error";
    const yahooStatus: SourceStatus = yahooDailyStatus === "error" && minuteStatus === "error"
      ? "error"
      : yahooDailyStatus !== "ok" || minuteStatus !== "ok"
        ? "stale"
        : "ok";
    const alpacaCurrent = alpacaHealth.currentForSession;
    const finnhubCurrent = finnhubHealth.currentForSession;

    return Response.json(
      {
        symbol: "NVDA",
        targetDate,
        price,
        previousClose,
        previousCloseSession: verifiedPreviousClose?.session ?? null,
        previousCloseExpectedSession: expectedPreviousSession,
        previousCloseStatus,
        // Backward-compatible aliases. checkedAt is the endpoint completion,
        // while asOf remains the selected quote's best available timestamp.
        asOf: legacyAsOf,
        checkedAt: new Date(endpointCompletedAtMs).toISOString(),
        session: marketState.session,
        source,
        realtime,
        targetSession: {
          hasBars: targetBars.length > 0,
          hasPremarketBars: premarket.length > 0,
          analysisBarCount: analysisBars.filter((bar) =>
            targetBars.some((item) => item.bar.time === bar.time),
          ).length,
          evidenceQualified: targetBars.some((item) => item.bar.time + 60_000 <= endpointCheckedAtMs),
        },
        marketState: {
          ...marketState,
          evaluatedAt: new Date(endpointCheckedAtMs).toISOString(),
        },
        displaySession: {
          date: displaySessionDate,
          relation: displaySessionRelation,
          provider: minuteChart ? "yahoo_minute" : null,
          barCount: displayBars.length,
          latestObservedAt: iso(displayBars.at(-1)?.time),
        },
        freshness: {
          endpoint: {
            checkedAt: new Date(endpointCheckedAtMs).toISOString(),
            completedAt: new Date(endpointCompletedAtMs).toISOString(),
          },
          quote: {
            provider: selectedQuoteProvider,
            status: selectedQuoteStatus,
            observedAt: iso(quoteObservedAtMs),
            fetchedAt: iso(quoteFetchedAtMs),
            ageMs: quoteAgeMs,
            stale: quoteStale,
            marketClosed: marketState.session === "CLOSED",
            state: selectedQuoteHealth.state,
            currentForSession: selectedQuoteHealth.currentForSession,
            futureSkew: selectedQuoteHealth.futureSkew,
            observationTimeSource:
              quoteObservedAtMs == null ? "unavailable" : "provider",
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
            provider: alpacaDaily
              ? minuteChart ? "alpaca_sip_daily+yahoo_minute" : "alpaca_sip_daily"
              : minuteChart ? "yahoo" : dailyChart ? "yahoo_daily" : "unavailable",
            fetchedAt: iso(history.minute.fetchedAt ?? history.daily.fetchedAt),
            dailyProvider: alpacaDaily ? "alpaca_sip" : dailyChart ? "yahoo" : "unavailable",
            dailyFetchedAt: alpacaDaily ? iso(alpacaDaily.fetchedAt) : iso(history.daily.fetchedAt),
            minuteProvider: minuteChart ? "yahoo" : "unavailable",
            minuteFetchedAt: iso(history.minute.fetchedAt),
            dailyStatus,
            minuteStatus,
            dailyError: history.daily.error,
            minuteError: history.minute.error,
            latestMinuteObservedAt: iso(historyObservedAtMs),
            latestDailyObservedAt: iso(dailyObservedAtMs),
            historyWindowStartObservedAt: iso(historyWindowStartObservedAtMs),
            cacheHit: history.daily.cacheHit || history.minute.cacheHit,
            dailyCacheHit: history.daily.cacheHit,
            minuteCacheHit: history.minute.cacheHit,
            cacheAgeMs: historyCacheAgeMs,
            cacheTtlMs: HISTORY_CACHE_MS,
            stale: minuteHistoryStale,
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
            observedAt: iso(historyObservedAtMs),
            fetchedAt: iso(history.minute.fetchedAt ?? history.daily.fetchedAt),
            coverage:
              "NVDA public chart history with pre/post-market bars where available; may be delayed and is not guaranteed consolidated market data.",
            detail: `Daily: ${yahooDailyStatus}${history.daily.error ? ` (${history.daily.error})` : ""}; minute: ${minuteStatus}${history.minute.error ? ` (${history.minute.error})` : ""}`,
          },
        ],
        bars: displayBars,
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
            ? iso(targetBars.at(-1)?.bar.time)
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
