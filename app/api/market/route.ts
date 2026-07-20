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

type HistoryCache = {
  expires: number;
  fetchedAt: number;
  daily: Chart;
  minute: Chart;
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

type Session = "CLOSED" | "PREMARKET" | "MARKET OPEN" | "AFTER-HOURS";
type SourceStatus = "ok" | "stale" | "error" | "standby" | "not_configured";

const HISTORY_CACHE_MS = 60_000;
const HISTORY_STALE_MS = 120_000;
const OPEN_QUOTE_STALE_MS = 90_000;
// The browser may check this endpoint every two seconds, but the free Finnhub
// plan cannot safely sustain one upstream quote request per browser poll. A
// short server cache keeps the UI responsive while making provider freshness
// explicit instead of turning rate-limit failures into apparent live data.
const FINNHUB_QUOTE_CACHE_MS = 10_000;
// The browser polls every two seconds. This cache limits upstream traffic to
// one Alpaca snapshot per worker instance during that interval.
const ALPACA_SNAPSHOT_CACHE_MS = 1_500;
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
  const response = await fetch(url, { headers, cache: "no-store" });
  if (!response.ok) throw new Error("Yahoo chart feed failed");
  const json = (await response.json()) as { chart?: { result?: Chart[] } };
  const chart = json.chart?.result?.[0];
  if (!chart) throw new Error("Yahoo chart feed returned no NVDA data");
  return chart;
}

let historyCache: HistoryCache | null = null;
let finnhubQuoteCache: FinnhubQuoteCache | null = null;
let alpacaSnapshotCache: AlpacaSnapshotCache | null = null;

/**
 * Yahoo history is deliberately cached for one minute. A request to this route
 * therefore does not imply that a new Yahoo observation was fetched.
 */
async function marketHistory(): Promise<HistoryCache & { cacheHit: boolean }> {
  const now = Date.now();
  if (historyCache && historyCache.expires > now) {
    return { ...historyCache, cacheHit: true };
  }
  const [daily, minute] = await Promise.all([
    yahoo("1d", "1mo", false),
    yahoo("1m", "5d", true),
  ]);
  const fetchedAt = Date.now();
  historyCache = {
    expires: fetchedAt + HISTORY_CACHE_MS,
    fetchedAt,
    daily,
    minute,
  };
  return { ...historyCache, cacheHit: false };
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

function observedFixed(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (n - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  date.setUTCDate(date.getUTCDate() - ((7 + date.getUTCDay() - weekday) % 7));
  return date.toISOString().slice(0, 10);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function marketHoliday(key: string) {
  const year = Number(key.slice(0, 4));
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  return new Set([
    observedFixed(year, 0, 1),
    observedFixed(year + 1, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday.toISOString().slice(0, 10),
    lastWeekday(year, 4, 1),
    observedFixed(year, 5, 19),
    observedFixed(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observedFixed(year, 11, 25),
  ]).has(key);
}

function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousMarketSession(key: string) {
  let prior = shiftDateKey(key, -1);
  while (new Date(`${prior}T00:00:00Z`).getUTCDay() % 6 === 0 || marketHoliday(prior)) {
    prior = shiftDateKey(prior, -1);
  }
  return prior;
}

function earlyClose(key: string) {
  const year = Number(key.slice(0, 4));
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const dayAfterThanksgiving = shiftDateKey(thanksgiving, 1);
  const beforeIndependenceHoliday = previousMarketSession(observedFixed(year, 6, 4));
  const christmasEve = `${year}-12-24`;
  return (
    key === dayAfterThanksgiving ||
    key === beforeIndependenceHoliday ||
    (key === christmasEve && !marketHoliday(key))
  );
}

const regularCloseMinute = (key: string) => (earlyClose(key) ? 13 * 60 : 16 * 60);

function targetSessionDate(nowMs = Date.now()) {
  const parts = ny(nowMs / 1000);
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const currentKey = keyFromParts(parts);
  const date = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  if (minute >= regularCloseMinute(currentKey)) date.setUTCDate(date.getUTCDate() + 1);
  while (
    date.getUTCDay() === 0 ||
    date.getUTCDay() === 6 ||
    marketHoliday(date.toISOString().slice(0, 10))
  ) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/** Market state is calendar/time based and never inferred from feed success. */
function sessionState(nowMs = Date.now()): {
  session: Session;
  regularMarketOpen: boolean;
  reason: "weekend" | "holiday" | "early_close" | "outside_regular_hours" | null;
  regularCloseMinute: number;
} {
  const parts = ny(nowMs / 1000);
  const key = keyFromParts(parts);
  const date = new Date(`${key}T00:00:00Z`);
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    return { session: "CLOSED", regularMarketOpen: false, reason: "weekend", regularCloseMinute: 960 };
  }
  if (marketHoliday(key)) {
    return { session: "CLOSED", regularMarketOpen: false, reason: "holiday", regularCloseMinute: 960 };
  }
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const closeMinute = regularCloseMinute(key);
  const session: Session =
    minute < 240
      ? "CLOSED"
      : minute < 570
        ? "PREMARKET"
        : minute < closeMinute
          ? "MARKET OPEN"
          : minute < 1200
            ? "AFTER-HOURS"
            : "CLOSED";
  return {
    session,
    regularMarketOpen: session === "MARKET OPEN",
    reason: session === "MARKET OPEN"
      ? null
      : earlyClose(key) && minute >= closeMinute
        ? "early_close"
        : "outside_regular_hours",
    regularCloseMinute: closeMinute,
  };
}

function chartBars(chart: Chart) {
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

const iso = (value: number | null | undefined) =>
  valid(value) ? new Date(value).toISOString() : null;

export async function GET() {
  const endpointCheckedAtMs = Date.now();
  try {
    const finnhubKey = (globalThis as unknown as {
      process?: { env?: Record<string, string> };
    }).process?.env?.FINNHUB_API_KEY;
    const alpaca = alpacaCredentials();
    const targetDate = targetSessionDate(endpointCheckedAtMs);
    const todayKey = etDate(new Date(endpointCheckedAtMs));
    const marketState = sessionState(endpointCheckedAtMs);
    const history = await marketHistory();
    const nowParts = ny(endpointCheckedAtMs / 1000);
    const nowMinute = Number(nowParts.hour) * 60 + Number(nowParts.minute);
    const fetchedParts = ny(history.fetchedAt / 1000);
    const fetchedMinute = Number(fetchedParts.hour) * 60 + Number(fetchedParts.minute);
    const todaySessionFinalized =
      nowMinute >= marketState.regularCloseMinute &&
      fetchedMinute >= marketState.regularCloseMinute;
    const dailyChart = history.daily;
    const minuteChart = history.minute;
    const dailyQuote = dailyChart.indicators?.quote?.[0];
    const daily = (dailyChart.timestamp ?? [])
      .map((timestamp, index) => ({
        date: displayDate(new Date(timestamp * 1000)),
        dateKey: etDate(new Date(timestamp * 1000)),
        open: dailyQuote?.open?.[index],
        high: dailyQuote?.high?.[index],
        low: dailyQuote?.low?.[index],
        close: dailyQuote?.close?.[index],
      }))
      .filter(
        (row): row is {
           date: string;
           dateKey: string;
           open: number;
           high: number;
           low: number;
           close: number;
        } =>
           row.dateKey < targetDate &&
           (row.dateKey < todayKey || todaySessionFinalized) &&
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
    let price = minuteChart.meta?.regularMarketPrice ?? latestHistoryBar?.close ?? null;
    let legacyAsOf = latestHistoryBar
      ? new Date(latestHistoryBar.time).toISOString()
      : new Date(history.fetchedAt).toISOString();
    let quoteObservedAtMs = latestHistoryBar?.time ?? null;
    let quoteFetchedAtMs: number | null = history.fetchedAt;
    let source = "Yahoo Finance NVDA chart fallback · may be delayed";
    let realtime = false;
    let selectedQuoteProvider: "alpaca_iex" | "finnhub" | "yahoo" = "yahoo";
    let alpacaLive: AlpacaSnapshot | null = null;
    let liveQuote: FinnhubQuote | null = null;
    let alpacaFetchedAtMs: number | null = null;
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
        quoteFetchedAtMs = result.fetchedAt;
        const tradeTime = Date.parse(alpacaLive.latestTrade?.t ?? "");
        quoteObservedAtMs = Number.isFinite(tradeTime) ? tradeTime : null;
        price = alpacaLive.latestTrade!.p!;
        legacyAsOf = quoteObservedAtMs == null
          ? ""
          : new Date(quoteObservedAtMs).toISOString();
        source = "Alpaca IEX NVDA snapshot · single-exchange coverage";
        selectedQuoteProvider = "alpaca_iex";
        alpacaStatus = quoteObservedAtMs != null ? "ok" : "stale";
        alpacaDetail = `${result.cacheHit ? "Cached" : "Fresh"} IEX snapshot returned with latest trade and quote timestamps`;
      } catch (error) {
        alpacaDetail = error instanceof Error
          ? error.message
          : "Alpaca IEX snapshot request failed";
      }
    }

    if (!alpacaLive && finnhubKey) {
      try {
        const result = await finnhubQuote(finnhubKey);
        liveQuote = result.quote;
        quoteFetchedAtMs = result.fetchedAt;
        quoteObservedAtMs = liveQuote.t ? liveQuote.t * 1000 : null;
        price = liveQuote.c!;
        // Preserve the legacy non-null asOf field, but expose whether this value
        // is a provider observation or only the fetch time in freshness.quote.
        legacyAsOf = quoteObservedAtMs == null
          ? ""
          : new Date(quoteObservedAtMs).toISOString();
        source = "Finnhub NVDA quote snapshot";
        selectedQuoteProvider = "finnhub";
        // A timestamped snapshot is not automatically "real-time." Outside
        // regular hours it is a closed/extended-session observation, and while
        // open it must also pass the explicit age gate below.
        realtime = false;
        finnhubStatus = quoteObservedAtMs != null ? "ok" : "stale";
        finnhubDetail = liveQuote.t
          ? `${result.cacheHit ? "Cached" : "Fresh"} quote snapshot returned with provider observation time`
          : "Quote snapshot returned without a provider observation time";
      } catch (error) {
        finnhubDetail =
          error instanceof Error ? error.message : "Finnhub quote request failed";
      }
    }

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
    const targetCloseMinute = regularCloseMinute(targetDate);
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
    const historyCacheAgeMs = Math.max(0, endpointCompletedAtMs - history.fetchedAt);
    const quoteAgeMs = valid(quoteObservedAtMs)
      ? Math.max(0, endpointCompletedAtMs - quoteObservedAtMs)
      : null;
    const quoteStale = Boolean(
      marketState.regularMarketOpen &&
        (!valid(quoteAgeMs) || quoteAgeMs > OPEN_QUOTE_STALE_MS),
    );
    let selectedQuoteStatus: SourceStatus = selectedQuoteProvider === "alpaca_iex"
      ? alpacaStatus
      : selectedQuoteProvider === "finnhub"
        ? finnhubStatus
        : "stale";
    if (selectedQuoteStatus === "ok" && quoteStale) {
      selectedQuoteStatus = "stale";
      if (selectedQuoteProvider === "alpaca_iex") alpacaStatus = "stale";
      if (selectedQuoteProvider === "finnhub") finnhubStatus = "stale";
    }
    realtime = Boolean(
      selectedQuoteStatus === "ok" &&
        marketState.regularMarketOpen &&
        valid(quoteAgeMs) &&
        quoteAgeMs <= OPEN_QUOTE_STALE_MS,
    );

    const latestDailyTimestamp = dailyChart.timestamp?.at(-1);
    const earliestDailyTimestamp = dailyChart.timestamp?.at(0);
    const dailyObservedAtMs = valid(latestDailyTimestamp)
      ? latestDailyTimestamp * 1000
      : null;
    const historyObservedAtMs = latestHistoryBar?.time ?? null;
    const historyWindowStartObservedAtMs = Math.min(
      ...[
        valid(earliestDailyTimestamp) ? earliestDailyTimestamp * 1000 : null,
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

    return Response.json(
      {
        symbol: "NVDA",
        targetDate,
        price,
        previousClose:
          alpacaLive?.prevDailyBar?.c ??
          daily.at(-1)?.close ??
          liveQuote?.pc ??
          minuteChart.meta?.chartPreviousClose ??
          minuteChart.meta?.previousClose ??
          null,
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
        freshness: {
          endpoint: {
            checkedAt: new Date(endpointCheckedAtMs).toISOString(),
            completedAt: new Date(endpointCompletedAtMs).toISOString(),
          },
          quote: {
            provider: selectedQuoteProvider,
            observedAt: iso(quoteObservedAtMs),
            fetchedAt: iso(quoteFetchedAtMs),
            ageMs: quoteAgeMs,
            stale: quoteStale,
            marketClosed: !marketState.regularMarketOpen,
            observationTimeSource:
              quoteObservedAtMs == null ? "unavailable" : "provider",
          },
          history: {
            provider: "yahoo",
            fetchedAt: new Date(history.fetchedAt).toISOString(),
            latestMinuteObservedAt: iso(historyObservedAtMs),
            latestDailyObservedAt: iso(dailyObservedAtMs),
            historyWindowStartObservedAt: iso(historyWindowStartObservedAtMs),
            cacheHit: history.cacheHit,
            cacheAgeMs: historyCacheAgeMs,
            cacheTtlMs: HISTORY_CACHE_MS,
            stale: historyCacheAgeMs > HISTORY_STALE_MS,
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
            id: "finnhub",
            role: "fallback_reference_quote",
            status: finnhubStatus,
            observedAt: liveQuote?.t ? new Date(liveQuote.t * 1000).toISOString() : null,
            fetchedAt: liveQuote ? iso(quoteFetchedAtMs) : null,
            coverage:
              "NVDA quote snapshot; exchange coverage and latency depend on the Finnhub plan; not an order book.",
            detail: finnhubDetail,
          },
          {
            id: "yahoo",
            role: "minute_and_daily_history",
            status: historyCacheAgeMs > HISTORY_STALE_MS ? "stale" : "ok",
            observedAt: iso(historyObservedAtMs),
            fetchedAt: new Date(history.fetchedAt).toISOString(),
            coverage:
              "NVDA public chart history with pre/post-market bars where available; may be delayed and is not guaranteed consolidated market data.",
            detail: history.cacheHit
              ? "Served from the app's one-minute history cache"
              : "Fresh history request completed",
          },
        ],
        bars: displayBars,
        analysisBars,
        daily,
        firstMinuteHistory,
        day: {
          open:
            quoteDay && valid(alpacaLive?.dailyBar?.o)
              ? alpacaLive!.dailyBar!.o!
              : quoteDay && valid(liveQuote?.o)
              ? liveQuote!.o!
              : (regular.at(0)?.open ?? null),
          high:
            quoteDay && valid(alpacaLive?.dailyBar?.h)
              ? alpacaLive!.dailyBar!.h!
              : quoteDay && valid(liveQuote?.h)
              ? liveQuote!.h!
              : regular.length
                ? Math.max(...regular.map((bar) => bar.high))
                : null,
          low:
            quoteDay && valid(alpacaLive?.dailyBar?.l)
              ? alpacaLive!.dailyBar!.l!
              : quoteDay && valid(liveQuote?.l)
              ? liveQuote!.l!
              : regular.length
                ? Math.min(...regular.map((bar) => bar.low))
                : null,
          volume:
            quoteDay && valid(alpacaLive?.dailyBar?.v)
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
            (alpacaLive || liveQuote)
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
    return Response.json(
      {
        error: "Market data unavailable",
        detail: error instanceof Error ? error.message : "unknown",
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
