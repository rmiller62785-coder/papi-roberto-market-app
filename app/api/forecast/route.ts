import { env } from "cloudflare:workers";
import { pullPolymarketEvidence, type PolymarketEvidence } from "../../polymarket";
import { aggregateForecastContributions } from "../../forecast-adjustment";
import { asNonActionableResearchForecast } from "../../forecast-contract";
import { ensureForecastSnapshotOutcomeColumns } from "../../d1-schema";
import { classifyMarketEvent, earningsImpactSession } from "../../event-classification";
import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
  newYorkWallTimeUtc,
  nextNasdaqSession,
  previousNasdaqSession,
} from "../../market-session";

type Weight = {
  key: string;
  label: string;
  category: string;
  enabled: number;
  directionWeight: number;
  rangeWeight: number;
  updatedAt: number;
};
type EventRow = {
  id: string;
  source: string;
  category: string;
  headline: string;
  summary: string;
  url: string;
  eventTime: number;
  severity: number;
  clusterCount?: number;
};
type FeedStatus = {
  id: string;
  label: string;
  status: "live" | "limited" | "offline";
  detail: string;
  lastChecked: number;
  lastObserved?: number | null;
};
type FactorSource = {
  kind: "api" | "internal";
  apiBacked: boolean;
  provider: string;
  knowledgeBase: {
    label: string;
    path: string;
  };
  feedIds: string[];
  status: FeedStatus["status"];
  lastChecked: number | null;
};
type Quote = { c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { chartPreviousClose?: number; previousClose?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};
type MarketContext = {
  available: boolean;
  signal: number;
  qqqChangePct: number | null;
  soxxChangePct: number | null;
  intradayRangePct: number | null;
  asOf: number | null;
};
type OvernightContext = {
  available: boolean;
  signal: number;
  nqChangePct: number | null;
  esChangePct: number | null;
  asOf: number | null;
  reason: string;
};
type PullResult = {
  rows: EventRow[];
  feeds: FeedStatus[];
  market: MarketContext;
  overnight: OvernightContext;
  polymarket: PolymarketEvidence;
  updatedAt: number;
};

const defaults = [
  { key: "geopolitical", label: "Geopolitical escalation", category: "News risk", directionWeight: 0, rangeWeight: 0.35 },
  { key: "news_intensity", label: "Breaking-news intensity", category: "News risk", directionWeight: 0, rangeWeight: 0.15 },
  { key: "nvda_earnings", label: "NVDA earnings proximity", category: "Scheduled", directionWeight: 0, rangeWeight: 0.5 },
  { key: "macro_release", label: "Major U.S. macro release", category: "Scheduled", directionWeight: 0, rangeWeight: 0.3 },
  { key: "sec_filing", label: "New NVDA SEC filing", category: "Company", directionWeight: 0, rangeWeight: 0.2 },
  { key: "market_confirmation", label: "QQQ + semiconductor confirmation", category: "Cross-market", directionWeight: 30, rangeWeight: 0.05 },
  { key: "cross_market_volatility", label: "Cross-market volatility", category: "Cross-market", directionWeight: 0, rangeWeight: 0.15 },
  { key: "overnight_futures", label: "Nasdaq + S&P overnight futures", category: "Cross-market", directionWeight: 45, rangeWeight: 0.15 },
  { key: "prediction_market_repricing", label: "Polymarket event repricing", category: "Event market", directionWeight: 0, rangeWeight: 0.1 },
  { key: "monday", label: "Monday effect (experimental)", category: "Calendar", directionWeight: 0, rangeWeight: 0 },
  { key: "pay_period", label: "Pay-period proximity (experimental)", category: "Calendar", directionWeight: 0, rangeWeight: 0 },
];

const factorSourceDefinitions: Record<
  string,
  Omit<FactorSource, "status" | "lastChecked">
> = {
  geopolitical: {
    kind: "api",
    apiBacked: true,
    provider: "Finnhub News + GDELT",
    knowledgeBase: {
      label: "News ingestion, classification, clustering, and geopolitical signal in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["finnhub_news", "gdelt"],
  },
  news_intensity: {
    kind: "api",
    apiBacked: true,
    provider: "Finnhub News + GDELT",
    knowledgeBase: {
      label: "News ingestion, event clustering, freshness decay, and news-load signal in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["finnhub_news", "gdelt"],
  },
  nvda_earnings: {
    kind: "api",
    apiBacked: true,
    provider: "Finnhub Earnings Calendar",
    knowledgeBase: {
      label: "NVDA earnings-calendar ingestion and target-session match in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["earnings"],
  },
  macro_release: {
    kind: "api",
    apiBacked: true,
    provider: "U.S. Bureau of Labor Statistics",
    knowledgeBase: {
      label: "BLS calendar ingestion and target-session macro-release match in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["bls"],
  },
  sec_filing: {
    kind: "api",
    apiBacked: true,
    provider: "SEC EDGAR",
    knowledgeBase: {
      label: "NVIDIA filing ingestion and recent-filing signal in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["sec"],
  },
  market_confirmation: {
    kind: "api",
    apiBacked: true,
    provider: "Finnhub QQQ + SOXX Quotes",
    knowledgeBase: {
      label: "QQQ/SOXX cross-market quote normalization and confirmation signal in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["cross_market"],
  },
  cross_market_volatility: {
    kind: "api",
    apiBacked: true,
    provider: "Finnhub QQQ + SOXX Quotes",
    knowledgeBase: {
      label: "QQQ/SOXX intraday-range calculation and volatility signal in pullIntelligence() / signals()",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["cross_market"],
  },
  overnight_futures: {
    kind: "api",
    apiBacked: true,
    provider: "Yahoo Finance public futures chart",
    knowledgeBase: {
      label: "NQ/ES overnight-market confirmation with provider timestamps and stale gating",
      path: "app/api/forecast/route.ts",
    },
    feedIds: ["overnight_futures"],
  },
  prediction_market_repricing: {
    kind: "api",
    apiBacked: true,
    provider: "Polymarket Gamma + CLOB",
    knowledgeBase: {
      label: "Versioned market selection, liquidity/spread gates, and probability change since the prior NVDA close",
      path: "app/polymarket.ts",
    },
    feedIds: ["polymarket"],
  },
  monday: {
    kind: "internal",
    apiBacked: false,
    provider: "Internal Calendar Engine",
    knowledgeBase: {
      label: "Target-date weekday rule in signals(); no external API",
      path: "app/api/forecast/route.ts",
    },
    feedIds: [],
  },
  pay_period: {
    kind: "internal",
    apiBacked: false,
    provider: "Internal Calendar Engine",
    knowledgeBase: {
      label: "Target-date day-of-month proximity rule in signals(); no external API",
      path: "app/api/forecast/route.ts",
    },
    feedIds: [],
  },
};

const schema = [
  `CREATE TABLE IF NOT EXISTS forecast_weights (key TEXT PRIMARY KEY NOT NULL,label TEXT NOT NULL,category TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,direction_weight REAL NOT NULL DEFAULT 0,range_weight REAL NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS market_events (id TEXT PRIMARY KEY NOT NULL,source TEXT NOT NULL,category TEXT NOT NULL,headline TEXT NOT NULL,summary TEXT NOT NULL,url TEXT NOT NULL,event_time INTEGER NOT NULL,severity REAL NOT NULL,created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS market_events_time_idx ON market_events (event_time DESC)`,
  `CREATE TABLE IF NOT EXISTS forecast_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,target_date TEXT NOT NULL,captured_at INTEGER NOT NULL,interval_label TEXT NOT NULL,base_median REAL NOT NULL,adjusted_median REAL NOT NULL,adjusted_low REAL NOT NULL,adjusted_high REAL NOT NULL,factors_json TEXT NOT NULL,actual_open REAL,median_error REAL,first_minute_close REAL,first_minute_error REAL,outcome_captured_at INTEGER)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS forecast_snapshots_target_interval_idx ON forecast_snapshots (target_date,interval_label)`,
  `CREATE TABLE IF NOT EXISTS forecast_preopen_freezes (target_date TEXT PRIMARY KEY NOT NULL,frozen_at INTEGER NOT NULL,actionable_cutoff_at INTEGER,payload_json TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS automation_capture_health (id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),last_attempt_at INTEGER NOT NULL,last_success_at INTEGER,last_preopen_at INTEGER,last_outcome_at INTEGER,scheduled_at INTEGER NOT NULL,phase TEXT NOT NULL,status TEXT NOT NULL,target_date TEXT,detail TEXT)`,
];

let intelligenceCache: { targetDate: string; expires: number; value: PullResult } | null = null;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
function db() {
  if (!env.DB) throw new Error("Forecast database is unavailable");
  return env.DB;
}
function finnhubKey() {
  return (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.FINNHUB_API_KEY;
}
function weightsAdminEmails() {
  const value = (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.WEIGHTS_ADMIN_EMAILS ?? "";
  return new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}
function researchWriteError(request: Request) {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!authenticatedEmail) return json({ error: "Authentication required for research writes" }, 401);
  if (!weightsAdminEmails().has(authenticatedEmail.toLowerCase())) {
    return json({ error: "This account is not authorized for shared research writes" }, 403);
  }
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    return new URL(origin).origin === new URL(request.url).origin
      ? null
      : json({ error: "Cross-origin research writes are not allowed" }, 403);
  } catch {
    return json({ error: "Invalid request origin" }, 403);
  }
}
async function ensure() {
  const d = db();
  const now = Date.now();
  await d.batch(schema.map((statement) => d.prepare(statement)));
  await ensureForecastSnapshotOutcomeColumns(d);
  await d.batch(
    defaults.map((item) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO forecast_weights (key,label,category,enabled,direction_weight,range_weight,updated_at) VALUES (?,?,?,1,?,?,?)`,
        )
        .bind(item.key, item.label, item.category, item.directionWeight, item.rangeWeight, now),
    ),
  );
  await d.prepare(`UPDATE forecast_weights SET range_weight=0 WHERE range_weight<0`).run();
}

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validTargetSession = (value: string) => {
  try {
    return isNasdaqSessionDate(value);
  } catch {
    return false;
  }
};
function factorSource(key: string, feeds: FeedStatus[], evaluatedAt: number): FactorSource {
  const definition = factorSourceDefinitions[key];
  if (!definition) {
    return {
      kind: "internal",
      apiBacked: false,
      provider: "Unmapped Forecast Configuration",
      knowledgeBase: {
        label: "No registered API or internal signal implementation",
        path: "app/api/forecast/route.ts",
      },
      feedIds: [],
      status: "offline",
      lastChecked: null,
    };
  }
  if (!definition.feedIds.length) {
    return { ...definition, status: "live", lastChecked: evaluatedAt };
  }
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));
  const related = definition.feedIds.map((id) => feedById.get(id));
  const statuses = related.map((feed) => feed?.status ?? "offline");
  const status: FeedStatus["status"] = statuses.every((value) => value === "live")
    ? "live"
    : statuses.every((value) => value === "offline")
      ? "offline"
      : "limited";
  const checks = related.map((feed) => feed?.lastChecked).filter(valid);
  return {
    ...definition,
    status,
    // A composite is only as fresh as its oldest required source. Missing
    // dependencies remain visibly unstamped instead of borrowing another
    // feed's recent check time.
    lastChecked: checks.length === definition.feedIds.length ? Math.min(...checks) : null,
  };
}
function parseGdeltTime(value: unknown) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return Date.parse(raw);
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
}
function parseSecAcceptance(value: unknown) {
  const raw = clean(value);
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    return Date.UTC(+compact[1], +compact[2] - 1, +compact[3], +compact[4], +compact[5], +compact[6]);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
}
function etDate(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function newYorkWallTime(date: string, time: string) {
  return newYorkWallTimeUtc(
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
  );
}
function previousMarketSession(key: string) {
  return previousNasdaqSession(key, { inclusive: false });
}
function nextMarketSession(key: string) {
  return nextNasdaqSession(key, { inclusive: false });
}

export type ForecastFreezePhase =
  | "BEFORE_TARGET_PREMARKET"
  | "ACTIONABLE_WINDOW"
  | "MONITORING_LOCKED"
  | "CROSS_COMPLETE";

/**
 * The forecast route may update the actionable MOO snapshot only during the
 * target session's 04:00-09:24:30 ET window. Evidence after that boundary is
 * monitoring-only and cannot rewrite the frozen decision.
 */
export function forecastFreezePhase(targetDate: string, nowMs = Date.now()) {
  const schedule = nasdaqSessionSchedule(targetDate);
  const premarketStartAt = schedule.premarketOpenAt;
  const actionableCutoffAt = schedule.decisionFreezeAt;
  const regularOpenAt = schedule.regularOpenAt;
  const phase: ForecastFreezePhase = nowMs < premarketStartAt
    ? "BEFORE_TARGET_PREMARKET"
    : nowMs <= actionableCutoffAt
      ? "ACTIONABLE_WINDOW"
      : nowMs < regularOpenAt
        ? "MONITORING_LOCKED"
        : "CROSS_COMPLETE";
  return { phase, premarketStartAt, actionableCutoffAt, regularOpenAt };
}
function priorSessionCloseMs(targetDate: string) {
  const prior = previousMarketSession(targetDate);
  return nasdaqSessionSchedule(prior).regularCloseAt;
}
function regularMarketOpenNow(value = Date.now()) {
  const key = newYorkDateKey(value);
  if (!isNasdaqSessionDate(key)) return false;
  const schedule = nasdaqSessionSchedule(key);
  return value >= schedule.regularOpenAt && value < schedule.regularCloseAt;
}
function eventTopic(event: EventRow) {
  const text = `${event.headline} ${event.summary}`.toLowerCase();
  const tags = [
    "iran", "israel", "hormuz", "missile", "airstrike", "ceasefire", "sanction",
    "nvidia", "nvda", "earnings", "guidance", "semiconductor", "chip export",
    "fomc", "federal reserve", "inflation", "cpi", "ppi", "payroll", "employment",
  ].filter((tag) => text.includes(tag));
  if (tags.length) return `${event.category}:${tags.slice(0, 4).join("-")}`;
  const tokens = event.headline
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !/^(that|this|with|from|have|will|after|before|about|market|markets)$/.test(word))
    .slice(0, 7)
    .sort();
  return `${event.category}:${tokens.join("-")}`;
}
function clusterEvents(rows: EventRow[]) {
  const clusters = new Map<string, EventRow>();
  for (const event of rows.sort((a, b) => b.eventTime - a.eventTime)) {
    const key = eventTopic(event);
    const prior = clusters.get(key);
    if (!prior) clusters.set(key, { ...event, clusterCount: 1 });
    else {
      prior.clusterCount = (prior.clusterCount ?? 1) + 1;
      prior.severity = Math.max(prior.severity, event.severity);
      if (!prior.url && event.url) prior.url = event.url;
      if (event.eventTime > prior.eventTime) {
        prior.headline = event.headline;
        prior.summary = event.summary;
        prior.eventTime = event.eventTime;
        prior.source = event.source;
      }
    }
  }
  return [...clusters.values()];
}
async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}
async function quote(symbol: string, key: string) {
  const payload = (await fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
    "X-Finnhub-Token": key,
  })) as Quote;
  if (!valid(payload.c) || !valid(payload.pc) || payload.pc <= 0) throw new Error("Quote unavailable");
  return payload;
}
async function yahooFuturesQuote(symbol: string) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", "5m");
  url.searchParams.set("range", "2d");
  url.searchParams.set("includePrePost", "true");
  const payload = (await fetchJson(url.toString(), {
    "User-Agent": "Mozilla/5.0 NVDA-Opening-Research/2.0",
  })) as YahooChart;
  const chart = payload.chart?.result?.[0];
  const timestamps = chart?.timestamp ?? [];
  const closes = chart?.indicators?.quote?.[0]?.close ?? [];
  let observedAt: number | null = null;
  let price: number | null = null;
  for (let index = Math.min(timestamps.length, closes.length) - 1; index >= 0; index -= 1) {
    if (!valid(closes[index])) continue;
    observedAt = timestamps[index] * 1000;
    price = closes[index] as number;
    break;
  }
  const previousClose = chart?.meta?.chartPreviousClose ?? chart?.meta?.previousClose ?? null;
  if (!valid(price) || !valid(previousClose) || previousClose <= 0 || !valid(observedAt)) {
    throw new Error("Futures chart did not contain a timestamped quote");
  }
  return { price, previousClose, changePct: ((price / previousClose) - 1) * 100, observedAt };
}
function changePct(value: Quote) {
  return valid(value.c) && valid(value.pc) && value.pc > 0 ? ((value.c / value.pc) - 1) * 100 : null;
}
function rangePct(value: Quote) {
  return valid(value.h) && valid(value.l) && valid(value.pc) && value.pc > 0 ? ((value.h - value.l) / value.pc) * 100 : null;
}

async function pullIntelligence(targetDate: string): Promise<PullResult> {
  if (intelligenceCache && intelligenceCache.targetDate === targetDate && intelligenceCache.expires > Date.now()) return intelligenceCache.value;
  const checkedAt = Date.now();
  const now = Math.floor(checkedAt / 1000);
  const from = new Date(checkedAt - 3 * 864e5).toISOString().slice(0, 10);
  const to = new Date(checkedAt + 45 * 864e5).toISOString().slice(0, 10);
  const rows: EventRow[] = [];
  const feeds: FeedStatus[] = [];
  const key = finnhubKey();
  let market: MarketContext = {
    available: false,
    signal: 0,
    qqqChangePct: null,
    soxxChangePct: null,
    intradayRangePct: null,
    asOf: null,
  };
  let overnight: OvernightContext = {
    available: false,
    signal: 0,
    nqChangePct: null,
    esChangePct: null,
    asOf: null,
    reason: "No fresh overnight futures observation",
  };

  if (key) {
    const headers = { "X-Finnhub-Token": key };
    const [general, company, earnings, qqq, soxx] = await Promise.allSettled([
      fetchJson("https://finnhub.io/api/v1/news?category=general&minId=0", headers),
      fetchJson(`https://finnhub.io/api/v1/company-news?symbol=NVDA&from=${from}&to=${new Date().toISOString().slice(0, 10)}`, headers),
      fetchJson(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=NVDA`, headers),
      quote("QQQ", key),
      quote("SOXX", key),
    ]);
    let newsEndpoints = 0;
    for (const result of [general, company]) {
      if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
      newsEndpoints += 1;
      for (const item of result.value.slice(0, 100) as Array<Record<string, unknown>>) {
        const headline = clean(item.headline);
        const summary = clean(item.summary);
        const classification = classifyMarketEvent(headline, summary);
        const time = Number(item.datetime);
        if (!headline || !Number.isFinite(time) || time <= 0 || time < now - 3 * 86400) continue;
        if (classification.severity < 2 && !/\b(?:nvidia|nvda|semiconductors?|nasdaq|oil|iran|israel|war|fed|inflation)\b/i.test(`${headline} ${summary}`)) continue;
        rows.push({
          id: `fh-${item.id ?? time}-${headline.slice(0, 20)}`,
          source: clean(item.source) || "Finnhub",
          category: classification.category,
          headline,
          summary,
          url: clean(item.url),
          eventTime: time * 1000,
          severity: classification.severity,
        });
      }
    }
    feeds.push({
      id: "finnhub_news",
      label: "Finnhub news",
      status: newsEndpoints === 2 ? "live" : newsEndpoints === 1 ? "limited" : "offline",
      detail: `${newsEndpoints}/2 news feeds responding`,
      lastChecked: checkedAt,
    });
    const earningsList = earnings.status === "fulfilled" &&
      Array.isArray((earnings.value as { earningsCalendar?: unknown }).earningsCalendar)
      ? (earnings.value as { earningsCalendar: Array<Record<string, unknown>> }).earningsCalendar
      : null;
    if (earningsList) {
      const list = earningsList;
      for (const item of list) {
        const date = clean(item.date);
        if (!date) continue;
        const providerHour = clean(item.hour) || "time not supplied";
        const impactDate = earningsImpactSession(date, providerHour, nextMarketSession);
        rows.push({
          id: `earn-${date}-${providerHour}-${item.symbol}`,
          source: "Finnhub earnings calendar",
          category: "Earnings",
          headline: `${item.symbol ?? "NVDA"} earnings scheduled · impacts ${impactDate} open`,
          summary: `Provider timing ${providerHour} on ${date}; EPS estimate ${item.epsEstimate ?? "—"}. After-close releases are mapped to the next U.S. market session.`,
          url: "",
          eventTime: newYorkWallTime(impactDate.replace(/-/g, ""), "0830"),
          severity: 3,
        });
      }
    }
    feeds.push({
      id: "earnings",
      label: "Earnings calendar",
      status: earningsList ? "live" : earnings.status === "fulfilled" ? "limited" : "offline",
      detail: earningsList
        ? "NVDA calendar checked"
        : earnings.status === "fulfilled"
          ? "Calendar response did not contain the expected data shape"
          : "Calendar request failed",
      lastChecked: checkedAt,
    });
    let crossMarketStatus: FeedStatus["status"] = "offline";
    if (qqq.status === "fulfilled" && soxx.status === "fulfilled") {
      const qqqMove = changePct(qqq.value);
      const soxxMove = changePct(soxx.value);
      const ranges = [rangePct(qqq.value), rangePct(soxx.value)].filter(valid);
      const combined = valid(qqqMove) && valid(soxxMove) ? (qqqMove + soxxMove) / 2 : 0;
      const observedTimes = [qqq.value.t, soxx.value.t].filter(valid).map((value) => value * 1000);
      const oldestObservation = observedTimes.length === 2 ? Math.min(...observedTimes) : null;
      const quoteDegraded = oldestObservation == null || !regularMarketOpenNow(checkedAt) || checkedAt - oldestObservation > 90_000;
      const valuesAvailable = valid(qqqMove) && valid(soxxMove);
      market = {
        available: valuesAvailable && !quoteDegraded,
        signal: clamp(combined / 1.5, -1, 1),
        qqqChangePct: qqqMove,
        soxxChangePct: soxxMove,
        intradayRangePct: ranges.length ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length : null,
        asOf: oldestObservation,
      };
      crossMarketStatus = valuesAvailable ? (quoteDegraded ? "limited" : "live") : "limited";
    } else if (qqq.status === "fulfilled" || soxx.status === "fulfilled") {
      crossMarketStatus = "limited";
    }
    feeds.push({
      id: "cross_market",
      label: "QQQ + SOXX",
      status: crossMarketStatus,
      detail: crossMarketStatus === "live"
        ? "Cross-market confirmation active"
        : crossMarketStatus === "limited"
          ? "Quotes were checked but one or more inputs are closed, stale, untimestamped, or incomplete"
          : "Both cross-market quotes are unavailable",
      lastChecked: checkedAt,
    });
  } else {
    feeds.push(
      { id: "finnhub_news", label: "Finnhub news", status: "offline", detail: "API key is not configured", lastChecked: checkedAt },
      { id: "earnings", label: "Earnings calendar", status: "offline", detail: "API key is not configured", lastChecked: checkedAt },
      { id: "cross_market", label: "QQQ + SOXX", status: "offline", detail: "API key is not configured", lastChecked: checkedAt },
    );
  }

  const gdeltUrl = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  gdeltUrl.searchParams.set("query", '(Iran OR Israel OR Hormuz OR missile OR airstrike OR NVIDIA OR NVDA OR semiconductor OR "chip export") sourcelang:english');
  gdeltUrl.searchParams.set("mode", "ArtList");
  gdeltUrl.searchParams.set("maxrecords", "50");
  gdeltUrl.searchParams.set("format", "json");
  gdeltUrl.searchParams.set("timespan", "72h");
  gdeltUrl.searchParams.set("sort", "HybridRel");
  const [gdelt, sec, bls, nq, es, predictionMarkets] = await Promise.allSettled([
    fetchJson(gdeltUrl.toString()),
    fetchJson("https://data.sec.gov/submissions/CIK0001045810.json", {
      "User-Agent": "NVDA Opening Intelligence personal research contact@example.com",
    }),
    fetch("https://www.bls.gov/schedule/news_release/bls.ics", {
      headers: { "User-Agent": "NVDA Opening Intelligence personal research contact@example.com" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    }),
    yahooFuturesQuote("NQ=F"),
    yahooFuturesQuote("ES=F"),
    pullPolymarketEvidence({ priorCloseCutoffMs: priorSessionCloseMs(targetDate) }),
  ]);

  if (nq.status === "fulfilled" && es.status === "fulfilled") {
    const oldestObservation = Math.min(nq.value.observedAt, es.value.observedAt);
    const priorClose = priorSessionCloseMs(targetDate);
    const targetOpen = newYorkWallTime(targetDate.replace(/-/g, ""), "0930");
    const outsideTargetWindow = oldestObservation < priorClose || oldestObservation > targetOpen || checkedAt >= targetOpen;
    const stale = checkedAt - oldestObservation > 20 * 60_000 || oldestObservation > checkedAt + 60_000;
    const unavailable = stale || outsideTargetWindow;
    const combined = (nq.value.changePct + es.value.changePct) / 2;
    overnight = {
      available: !unavailable,
      signal: unavailable ? 0 : clamp(combined / 1.25, -1, 1),
      nqChangePct: nq.value.changePct,
      esChangePct: es.value.changePct,
      asOf: oldestObservation,
      reason: stale
        ? "Futures observations exist but are stale or have invalid clock skew"
        : outsideTargetWindow
          ? "Futures observation is outside the prior-close-to-target-open window"
          : "Fresh Nasdaq and S&P futures agree inside the target overnight window",
    };
    feeds.push({
      id: "overnight_futures",
      label: "NQ + ES overnight futures",
      status: unavailable ? "limited" : "live",
      detail: overnight.reason,
      lastChecked: checkedAt,
      lastObserved: oldestObservation,
    });
  } else {
    feeds.push({
      id: "overnight_futures",
      label: "NQ + ES overnight futures",
      status: nq.status === "fulfilled" || es.status === "fulfilled" ? "limited" : "offline",
      detail: "One or both public futures charts are unavailable",
      lastChecked: checkedAt,
      lastObserved: null,
    });
  }
  const polymarket: PolymarketEvidence = predictionMarkets.status === "fulfilled"
    ? predictionMarkets.value
    : {
        provider: "Polymarket Gamma + CLOB",
        selectorVersion: "geopolitical-v1",
        status: "offline",
        signalState: "unavailable",
        reason: "Polymarket discovery, order book, or history request failed.",
        checkedAt,
        providerObservedAt: null,
        priorCloseCutoffAt: priorSessionCloseMs(targetDate),
        signedRiskOffShock: 0,
        rangeSignal: 0,
        nvdaDirection: null,
        primaryMarketId: null,
        markets: [],
      };
  feeds.push({
    id: "polymarket",
    label: "Polymarket event repricing",
    status: polymarket.status,
    detail: polymarket.reason,
    lastChecked: polymarket.checkedAt,
    lastObserved: polymarket.providerObservedAt,
  });

  if (gdelt.status === "fulfilled") {
    const articles = ((gdelt.value as { articles?: Array<Record<string, unknown>> }).articles ?? []);
    for (const item of articles) {
      const headline = clean(item.title);
      const time = parseGdeltTime(item.seendate);
      const classification = classifyMarketEvent(headline, "");
      if (!headline || !Number.isFinite(time) || classification.severity < 2) continue;
      rows.push({
        id: `gdelt-${clean(item.url).slice(-80) || `${time}-${headline.slice(0, 25)}`}`,
        source: `GDELT · ${clean(item.domain) || "global news"}`,
        category: classification.category,
        headline,
        summary: "Independent global-news coverage detected by the no-key GDELT feed.",
        url: clean(item.url),
        eventTime: time,
        severity: classification.severity,
      });
    }
    feeds.push({ id: "gdelt", label: "GDELT global news", status: "live", detail: `${articles.length} recent articles scanned`, lastChecked: checkedAt });
  } else {
    const finnhubNewsStatus = feeds.find((feed) => feed.id === "finnhub_news")?.status ?? "offline";
    feeds.push({
      id: "gdelt",
      label: "GDELT global news",
      status: finnhubNewsStatus === "offline" ? "offline" : "limited",
      detail: finnhubNewsStatus === "offline"
        ? "No-key feed is rate-limited or unavailable, and Finnhub news is also offline"
        : "No-key feed is rate-limited or unavailable; Finnhub news remains available",
      lastChecked: checkedAt,
    });
  }

  if (sec.status === "fulfilled") {
    const payload = sec.value as { filings?: { recent?: Record<string, string[]> } };
    const recent = payload.filings?.recent;
    if (recent) {
      for (let index = 0; index < Math.min(20, recent.form?.length ?? 0); index += 1) {
        const filed = recent.filingDate?.[index];
        const accepted = parseSecAcceptance(recent.acceptanceDateTime?.[index]);
        const form = recent.form?.[index];
        const accession = recent.accessionNumber?.[index];
        if (!filed || !Number.isFinite(accepted) || !form || !accession || accepted < Date.now() - 7 * 864e5 || !/^(8-K|10-Q|10-K|4)$/.test(form)) continue;
        rows.push({
          id: `sec-${accession}`,
          source: "SEC EDGAR",
          category: "SEC filing",
          headline: `NVIDIA filed Form ${form}`,
          summary: `Official filing accepted ${new Date(accepted).toISOString()}.`,
          url: `https://www.sec.gov/Archives/edgar/data/1045810/${accession.replace(/-/g, "")}/`,
          eventTime: accepted,
          severity: form === "8-K" ? 2.5 : 2,
        });
      }
    }
    feeds.push({ id: "sec", label: "SEC EDGAR", status: "live", detail: "NVIDIA filings checked", lastChecked: checkedAt });
  } else feeds.push({ id: "sec", label: "SEC EDGAR", status: "offline", detail: "Official filing feed unavailable", lastChecked: checkedAt });

  if (bls.status === "fulfilled") {
    for (const block of bls.value.split("BEGIN:VEVENT").slice(1)) {
      const raw = block.match(/DTSTART[^:]*:(\d{8})T?(\d{4})?/);
      const summary = clean(block.match(/SUMMARY:(.+)/)?.[1]);
      if (!raw || !summary || !/consumer price|producer price|employment situation|job openings|productivity/i.test(summary)) continue;
      const date = raw[1];
      const time = raw[2] ?? "0830";
      const stamp = newYorkWallTime(date, time);
      if (stamp < Date.now() - 864e5 || stamp > Date.now() + 45 * 864e5) continue;
      rows.push({
        id: `bls-${date}-${summary}`,
        source: "U.S. Bureau of Labor Statistics",
        category: "Macro",
        headline: summary,
        summary: "Official scheduled U.S. economic release.",
        url: "https://www.bls.gov/schedule/",
        eventTime: stamp,
        severity: 3,
      });
    }
    feeds.push({ id: "bls", label: "BLS calendar", status: "live", detail: "Official macro calendar checked", lastChecked: checkedAt });
  } else feeds.push({ id: "bls", label: "BLS calendar", status: "offline", detail: "Official calendar unavailable", lastChecked: checkedAt });

  const clustered = clusterEvents(rows)
    .sort((a, b) => {
      const aUpcoming = a.eventTime >= checkedAt ? 1 : 0;
      const bUpcoming = b.eventTime >= checkedAt ? 1 : 0;
      if (aUpcoming !== bUpcoming) return bUpcoming - aUpcoming;
      if (aUpcoming) return a.eventTime - b.eventTime;
      return (b.severity * 1e13 + b.eventTime) - (a.severity * 1e13 + a.eventTime);
    })
    .slice(0, 100);
  const value = { rows: clustered, feeds, market, overnight, polymarket, updatedAt: checkedAt };
  intelligenceCache = { targetDate, expires: checkedAt + 60_000, value };
  return value;
}

function signals(
  events: EventRow[],
  targetDate: string,
  market: MarketContext,
  overnight: OvernightContext,
  polymarket: PolymarketEvidence,
) {
  const now = Date.now();
  const targetOpen = newYorkWallTime(targetDate.replace(/-/g, ""), "0930");
  const preOpen = now < targetOpen;
  const recent = events.filter((event) => event.eventTime >= now - 72 * 3600_000 && event.eventTime <= now + 10 * 60_000);
  const target = events.filter((event) => etDate(event.eventTime) === targetDate);
  const day = Number(targetDate.slice(-2));
  const weekday = new Date(`${targetDate}T12:00:00Z`).getUTCDay();
  const freshness = (event: EventRow) => {
    const ageHours = Math.max(0, (now - event.eventTime) / 3600_000);
    return ageHours <= 6 ? 1 : ageHours <= 24 ? 0.8 : ageHours <= 48 ? 0.55 : 0.3;
  };
  const geopoliticalEvents = recent.filter((event) => event.category === "Geopolitical");
  const geopolitical = geopoliticalEvents.length
    ? clamp(
        Math.max(...geopoliticalEvents.map((event) => (event.severity / 3) * freshness(event))) *
          (0.75 + Math.min(0.25, geopoliticalEvents.length * 0.05)),
        0,
        1,
      )
    : 0;
  const newsEvents = recent.filter(
    (event) => !["Geopolitical", "Geopolitical de-escalation", "Earnings", "Macro", "SEC filing"].includes(event.category),
  );
  const newsLoad = newsEvents.reduce(
    (sum, event) => sum + freshness(event) * (event.severity / 3) * Math.min(1.5, 0.75 + (event.clusterCount ?? 1) * 0.1),
    0,
  );
  const volatility = !market.available || market.intradayRangePct == null ? 0 : clamp((market.intradayRangePct - 0.5) / 2, 0, 1);
  return {
    geopolitical,
    news_intensity: clamp(newsLoad / 6, 0, 1),
    nvda_earnings: target.some((event) => event.category === "Earnings") ? 1 : 0,
    macro_release: target.some((event) => event.category === "Macro") ? 1 : 0,
    sec_filing: recent.some((event) => event.category === "SEC filing") ? 1 : 0,
    // Actionable MOO forecasts freeze at 09:24:30 ET. Same-session observations after
    // the open are audit data and cannot rewrite the expected open.
    market_confirmation: preOpen && market.available ? market.signal : 0,
    cross_market_volatility: preOpen ? volatility : 0,
    overnight_futures: overnight.available ? overnight.signal : 0,
    prediction_market_repricing: polymarket.signalState === "active" ? polymarket.rangeSignal : 0,
    monday: weekday === 1 ? 1 : 0,
    pay_period: day <= 3 || Math.abs(day - 15) <= 2 ? 1 : 0,
  };
}
async function weights() {
  const result = await db()
    .prepare(`SELECT key,label,category,enabled,direction_weight AS directionWeight,range_weight AS rangeWeight,updated_at AS updatedAt FROM forecast_weights ORDER BY category,label`)
    .all();
  return result.results as unknown as Weight[];
}
function buildFlag(signal: ReturnType<typeof signals>, events: EventRow[], targetDate: string, updatedAt: number, weightedDirectionBps: number) {
  const score = Math.round(
    clamp(
      Math.max(signal.geopolitical * 40, signal.prediction_market_repricing * 20) +
        signal.news_intensity * 15 +
        signal.nvda_earnings * 30 +
        signal.macro_release * 25 +
        signal.sec_filing * 15 +
        Math.abs(signal.market_confirmation) * 15 +
        signal.cross_market_volatility * 15 +
        Math.abs(signal.overnight_futures) * 10,
      0,
      100,
    ),
  );
  const level = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "ELEVATED" : "CLEAR";
  const direction = weightedDirectionBps >= 0.5
    ? "BULLISH CONFIRMATION"
    : weightedDirectionBps <= -0.5
      ? "BEARISH CONFIRMATION"
      : "DIRECTION UNCONFIRMED";
  const reasons: string[] = [];
  if (signal.geopolitical >= 0.25) reasons.push("Geopolitical escalation");
  if (signal.news_intensity >= 0.35) reasons.push("Breaking-news cluster");
  if (signal.nvda_earnings) reasons.push("NVDA earnings on target session");
  if (signal.macro_release) reasons.push("Major U.S. macro release");
  if (signal.sec_filing) reasons.push("Recent NVIDIA filing");
  if (Math.abs(signal.market_confirmation) >= 0.12) reasons.push(signal.market_confirmation > 0 ? "QQQ/SOXX confirming higher" : "QQQ/SOXX confirming lower");
  if (signal.cross_market_volatility >= 0.3) reasons.push("Elevated cross-market range");
  if (Math.abs(signal.overnight_futures) >= 0.12) reasons.push(signal.overnight_futures > 0 ? "Nasdaq/S&P futures confirming higher" : "Nasdaq/S&P futures confirming lower");
  if (signal.prediction_market_repricing >= 0.02) reasons.push("Prediction-market event repricing");
  const next = events
    .filter((event) => event.eventTime >= Date.now() - 15 * 60_000 && etDate(event.eventTime) <= targetDate)
    .sort((a, b) => a.eventTime - b.eventTime)[0];
  return {
    score,
    level,
    direction,
    headline: reasons[0] ?? "No material event-risk trigger detected",
    reasons: reasons.slice(0, 4),
    evidenceCount: events.filter((event) => event.eventTime > Date.now() - 72 * 3600_000 && event.eventTime <= Date.now() + 10 * 60_000).length,
    nextCatalyst: next ? { headline: next.headline, eventTime: next.eventTime, category: next.category } : null,
    updatedAt,
  };
}

function contributionMethod(
  weight: Weight,
  signal: number,
  source: FactorSource,
  signedSource: boolean,
) {
  const enabled = Boolean(weight.enabled);
  const dedupeGroup = ["geopolitical", "prediction_market_repricing"].includes(weight.key)
    ? "geopolitical_event"
    : weight.key;
  if (!enabled) return { effectMode: "disabled", reason: "Disabled by the research control.", dedupeGroup };
  if (source.status === "offline") return { effectMode: "no_signal", reason: "Required source is offline; contribution is gated to zero.", dedupeGroup };
  if (Math.abs(signal) < 0.0001) return { effectMode: "no_signal", reason: "Source was checked but no qualifying point-in-time signal is active.", dedupeGroup };
  if (signedSource && Math.abs(weight.directionWeight) > 0.0001) {
    return {
      effectMode: "direction_and_range",
      reason: "A signed market-price confirmation can move the central estimate; any configured uncertainty weight also expands the band.",
      dedupeGroup,
    };
  }
  return {
    effectMode: "range_only",
    reason: !signedSource && Math.abs(weight.directionWeight) > 0.0001
      ? "This source is an unsigned severity/proximity signal. Its manual direction weight is ignored until a signed mapping is validated."
      : weight.key === "prediction_market_repricing"
      ? "Polymarket repricing widens event uncertainty but is not assumed to predict NVDA direction before calibration."
      : "Event severity expands uncertainty; no validated directional coefficient is configured.",
    dedupeGroup,
  };
}

export async function GET(request: Request) {
  try {
    await ensure();
    const url = new URL(request.url);
    const targetDate = url.searchParams.get("targetDate") ?? newYorkDateKey(Date.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return json({ error: "targetDate must use YYYY-MM-DD" }, 400);
    }
    if (!validTargetSession(targetDate)) {
      return json({ error: "targetDate must be a valid Nasdaq trading session" }, 400);
    }
    const intelligence = await pullIntelligence(targetDate);
    const d = db();
    const now = Date.now();
    if (intelligence.rows.length) {
      await d.batch(
        intelligence.rows.slice(0, 50).map((event) =>
          d
            .prepare(
              `INSERT INTO market_events (id,source,category,headline,summary,url,event_time,severity,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET headline=excluded.headline,summary=excluded.summary,event_time=excluded.event_time,severity=excluded.severity`,
            )
            .bind(event.id, event.source, event.category, event.headline, event.summary, event.url, event.eventTime, event.severity, now),
        ),
      );
    }
    const configuredWeights = await weights();
    const currentSignals = signals(
      intelligence.rows,
      targetDate,
      intelligence.market,
      intelligence.overnight,
      intelligence.polymarket,
    );
    const signalEvaluatedAt = Date.now();
    const rawContributions = configuredWeights.map((weight) => {
      const signal = currentSignals[weight.key as keyof typeof currentSignals] ?? 0;
      const source = factorSource(weight.key, intelligence.feeds, signalEvaluatedAt);
      const eligible = Boolean(weight.enabled) && source.status !== "offline";
      const signedSource = ["market_confirmation", "overnight_futures"].includes(weight.key);
      return {
        key: weight.key,
        label: weight.label,
        category: weight.category,
        enabled: Boolean(weight.enabled),
        signal,
        directionBps: eligible && signedSource ? signal * weight.directionWeight : 0,
        rangePct: eligible ? Math.abs(signal) * Math.max(0, weight.rangeWeight) : 0,
        source,
        ...contributionMethod(weight, signal, source, signedSource),
      };
    });
    const rangeWinnerByGroup = new Map<string, string>();
    for (const item of rawContributions) {
      if (Math.abs(item.rangePct) < 0.0001) continue;
      const priorKey = rangeWinnerByGroup.get(item.dedupeGroup);
      const prior = priorKey ? rawContributions.find((candidate) => candidate.key === priorKey) : undefined;
      if (!prior || Math.abs(item.rangePct) > Math.abs(prior.rangePct)) {
        rangeWinnerByGroup.set(item.dedupeGroup, item.key);
      }
    }
    const dedupedContributions = rawContributions.map((item) => {
      const appliedRangePct = rangeWinnerByGroup.get(item.dedupeGroup) === item.key ? item.rangePct : 0;
      const deduped = Math.abs(item.rangePct) >= 0.0001 && appliedRangePct === 0;
      return {
        ...item,
        appliedDirectionBps: item.directionBps,
        appliedRangePct,
        applied: Math.abs(item.directionBps) >= 0.0001 || Math.abs(appliedRangePct) >= 0.0001,
        reason: deduped
          ? `${item.reason} Visible as correlated evidence; its range effect is deduplicated in favor of the stronger factor in ${item.dedupeGroup}.`
          : item.reason,
      };
    });
    const { directionBps, rangeExpansionPct, rangeMultiplier, rawDirectionBps, rawRangeExpansionPct, safetyCapApplied } = aggregateForecastContributions(dedupedContributions);
    const directionScale = Math.abs(rawDirectionBps) < 0.0001 ? 0 : directionBps / rawDirectionBps;
    const rangeScale = Math.abs(rawRangeExpansionPct) < 0.0001 ? 0 : rangeExpansionPct / rawRangeExpansionPct;
    const contributions = dedupedContributions.map((item) => {
      const appliedDirectionBps = item.appliedDirectionBps * directionScale;
      const appliedRangePct = item.appliedRangePct * rangeScale;
      return {
        ...item,
        appliedDirectionBps,
        appliedRangePct,
        applied: Math.abs(appliedDirectionBps) >= 0.0001 || Math.abs(appliedRangePct) >= 0.0001,
      };
    });
    const activeDirectionalFactors = Math.abs(directionBps) >= 0.05
      ? contributions.filter((item) => Math.abs(item.appliedDirectionBps) >= 0.05).length
      : 0;
    const activeRangeFactors = contributions.filter((item) => Math.abs(item.appliedRangePct) >= 0.001).length;
    const liveAdjustment = {
      directionBps,
      rangeMultiplier,
      rangeExpansionPct,
      rawDirectionBps,
      rawRangeExpansionPct,
      safetyCapApplied,
      activeDirectionalFactors,
      activeRangeFactors,
    };
    const liveMethodology = {
      version: "open-research-v2",
      state: "RESEARCH_NOT_CALIBRATED",
      readiness: activeDirectionalFactors
        ? "DIRECTION_EVIDENCE_ACTIVE"
        : activeRangeFactors
          ? "DEGRADED_RANGE_ONLY"
          : "NO_QUALIFYING_SIGNAL",
      summary: safetyCapApplied
        ? "Research safety bounds capped the raw manual aggregate at ±100 bp direction and 0.50×–3.00× range width."
        : activeDirectionalFactors
            ? "At least one fresh market-price confirmation is translating evidence into a signed central-estimate shift."
          : "Event APIs are influencing uncertainty, but no fresh validated directional market confirmation is active.",
      rangeDedupe: "Correlated geopolitical news and Polymarket evidence use the larger range effect, not an additive double count.",
    };
    const liveWeights = configuredWeights.map((weight) => ({
      ...weight,
      source: factorSource(weight.key, intelligence.feeds, signalEvaluatedAt),
    }));
    const liveForecastBlock = {
      computedAt: signalEvaluatedAt,
      weights: liveWeights,
      contributions,
      adjustment: liveAdjustment,
      methodology: liveMethodology,
      flag: buildFlag(currentSignals, intelligence.rows, targetDate, intelligence.updatedAt, directionBps),
      polymarket: intelligence.polymarket,
      marketContext: intelligence.market,
      overnightContext: intelligence.overnight,
    };
    const researchForecast = asNonActionableResearchForecast(liveForecastBlock);
    let servedForecastBlock: typeof liveForecastBlock = liveForecastBlock;
    const freezeWindow = forecastFreezePhase(targetDate, signalEvaluatedAt);
    let frozenAt: number | null = null;
    if (freezeWindow.phase === "ACTIONABLE_WINDOW") {
      // The last successful target-session request at or before 09:24:30 ET
      // wins. Later NOII/news/price evidence is monitoring-only.
      await d.prepare(
        `INSERT INTO forecast_preopen_freezes (target_date,frozen_at,actionable_cutoff_at,payload_json) VALUES (?,?,?,?)
         ON CONFLICT(target_date) DO UPDATE SET
           frozen_at=excluded.frozen_at,
           actionable_cutoff_at=excluded.actionable_cutoff_at,
           payload_json=excluded.payload_json
         WHERE excluded.frozen_at >= forecast_preopen_freezes.frozen_at
           AND excluded.frozen_at <= excluded.actionable_cutoff_at`,
      ).bind(
        targetDate,
        signalEvaluatedAt,
        freezeWindow.actionableCutoffAt,
        JSON.stringify(liveForecastBlock),
      ).run();
      frozenAt = signalEvaluatedAt;
    } else {
      const frozen = await d
        .prepare(`SELECT frozen_at AS frozenAt,payload_json AS payloadJson
          FROM forecast_preopen_freezes
          WHERE target_date=? AND frozen_at>=? AND frozen_at<=?`)
        .bind(targetDate, freezeWindow.premarketStartAt, freezeWindow.actionableCutoffAt)
        .first<{ frozenAt: number; payloadJson: string }>();
      if (frozen?.payloadJson) {
        frozenAt = frozen.frozenAt;
        const parsed = JSON.parse(frozen.payloadJson) as typeof liveForecastBlock;
        servedForecastBlock = {
          ...parsed,
          computedAt: frozen.frozenAt,
          methodology: {
            ...parsed.methodology,
            state: freezeWindow.phase === "MONITORING_LOCKED"
              ? "MOO_LOCKED_MONITORING"
              : "PREOPEN_FROZEN_RESEARCH",
            summary: `${parsed.methodology.summary} Served from the last actionable snapshot at or before 09:24:30 ET; later monitoring evidence cannot rewrite the MOO decision.`,
          },
        };
      } else {
        servedForecastBlock = {
          ...liveForecastBlock,
          contributions: contributions.map((item) => ({
            ...item,
            directionBps: 0,
            rangePct: 0,
            appliedDirectionBps: 0,
            appliedRangePct: 0,
            applied: false,
            effectMode: "no_signal",
            reason: "No pre-open feature snapshot exists; post-open evidence is excluded.",
          })),
          adjustment: {
            directionBps: 0,
            rangeMultiplier: 1,
            rangeExpansionPct: 0,
            rawDirectionBps: 0,
            rawRangeExpansionPct: 0,
            safetyCapApplied: false,
            activeDirectionalFactors: 0,
            activeRangeFactors: 0,
          },
          methodology: {
            ...liveMethodology,
            state: "NO_PREOPEN_FREEZE",
            readiness: "NO_QUALIFYING_SIGNAL",
            summary: freezeWindow.phase === "BEFORE_TARGET_PREMARKET"
              ? "The target premarket session has not begun. No actionable freeze exists and current evidence cannot be promoted to a target-session forecast."
              : "No valid target-session snapshot was captured by 09:24:30 ET. Later evidence is monitoring-only and cannot backfill an actionable MOO decision.",
          },
          flag: {
            ...liveForecastBlock.flag,
            direction: "DIRECTION UNCONFIRMED",
            headline: "No actionable MOO freeze was captured",
            reasons: ["Evidence outside the 04:00-09:24:30 ET window is excluded"],
          },
          polymarket: {
            ...intelligence.polymarket,
            signalState: "neutral",
            signedRiskOffShock: 0,
            rangeSignal: 0,
            reason: "Current Polymarket evidence remains visible as research but is excluded from the actionable MOO snapshot.",
          },
        };
      }
    }
    const [snapshots, automation] = await Promise.all([
      d.prepare(
        `SELECT id,target_date AS targetDate,captured_at AS capturedAt,interval_label AS intervalLabel,base_median AS baseMedian,adjusted_median AS adjustedMedian,adjusted_low AS adjustedLow,adjusted_high AS adjustedHigh,actual_open AS actualOpen,median_error AS medianError,first_minute_close AS firstMinuteClose,first_minute_error AS firstMinuteError,outcome_captured_at AS outcomeCapturedAt FROM forecast_snapshots ORDER BY captured_at DESC LIMIT 100`,
      ).all(),
      d.prepare(
        `SELECT last_attempt_at AS lastAttemptAt,last_success_at AS lastSuccessAt,last_preopen_at AS lastPreopenAt,last_outcome_at AS lastOutcomeAt,scheduled_at AS scheduledAt,phase,status,target_date AS targetDate,detail FROM automation_capture_health WHERE id=1`,
      ).first(),
    ]);
    return json({
      weights: servedForecastBlock.weights,
      events: intelligence.rows.slice(0, 40),
      feeds: intelligence.feeds,
      marketContext: servedForecastBlock.marketContext,
      overnightContext: servedForecastBlock.overnightContext,
      polymarket: servedForecastBlock.polymarket,
      flag: servedForecastBlock.flag,
      contributions: servedForecastBlock.contributions,
      adjustment: servedForecastBlock.adjustment,
      methodology: servedForecastBlock.methodology,
      computedAt: servedForecastBlock.computedAt,
      researchForecast,
      freeze: {
        phase: freezeWindow.phase,
        premarketStartAt: freezeWindow.premarketStartAt,
        actionableCutoffAt: freezeWindow.actionableCutoffAt,
        regularOpenAt: freezeWindow.regularOpenAt,
        frozenAt,
        monitoringOnly: freezeWindow.phase === "MONITORING_LOCKED" || freezeWindow.phase === "CROSS_COMPLETE",
      },
      snapshots: snapshots.results,
      automation: automation ?? {
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastPreopenAt: null,
        lastOutcomeAt: null,
        scheduledAt: null,
        phase: null,
        status: "awaiting_first_run",
        targetDate: null,
        detail: "Cloudflare schedule is configured; no eligible capture window has completed yet.",
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Forecast intelligence unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  try {
    const authorizationError = researchWriteError(request);
    if (authorizationError) return authorizationError;
    await ensure();
    const body = (await request.json()) as {
      weights?: Array<Omit<Partial<Weight>, "enabled"> & { enabled?: number | boolean }>;
    };
    if (!Array.isArray(body.weights) || body.weights.length === 0) return json({ error: "non-empty weights array required" }, 400);
    const knownKeys = new Set(defaults.map((item) => item.key));
    const seenKeys = new Set<string>();
    const invalid = body.weights.find((weight) => {
      const enabledValid = typeof weight.enabled === "boolean" || weight.enabled === 0 || weight.enabled === 1;
      const directionValid = valid(weight.directionWeight) && weight.directionWeight >= -100 && weight.directionWeight <= 100;
      const rangeValid = valid(weight.rangeWeight) && weight.rangeWeight >= 0 && weight.rangeWeight <= 2;
      const keyValid = typeof weight.key === "string" && knownKeys.has(weight.key) && !seenKeys.has(weight.key);
      if (typeof weight.key === "string") seenKeys.add(weight.key);
      return !keyValid || !enabledValid || !directionValid || !rangeValid;
    });
    if (invalid) return json({ error: "Every weight must be a unique known factor with complete, in-range values" }, 400);
    const d = db();
    const now = Date.now();
    await d.batch(
      body.weights.map((weight) =>
          d
            .prepare(`UPDATE forecast_weights SET enabled=?,direction_weight=?,range_weight=?,updated_at=? WHERE key=?`)
            .bind(
              weight.enabled === true || weight.enabled === 1 ? 1 : 0,
              weight.directionWeight,
              weight.rangeWeight,
              now,
              weight.key,
            ),
        ),
    );
    const [updatedWeights, intelligence] = await Promise.all([weights(), pullIntelligence(etDate(Date.now()))]);
    const evaluatedAt = Date.now();
    return json({
      weights: updatedWeights.map((weight) => ({
        ...weight,
        source: factorSource(weight.key, intelligence.feeds, evaluatedAt),
      })),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to update weights" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const authorizationError = researchWriteError(request);
    if (authorizationError) return authorizationError;
    await ensure();
    const body = (await request.json()) as Record<string, unknown>;
    const numericKeys = ["baseMedian", "adjustedMedian", "adjustedLow", "adjustedHigh"] as const;
    if (
      typeof body.targetDate !== "string" ||
      typeof body.intervalLabel !== "string" ||
      numericKeys.some((key) => typeof body[key] !== "number" || !Number.isFinite(body[key]))
    ) return json({ error: "Valid snapshot values required" }, 400);
    if (!validTargetSession(body.targetDate)) {
      return json({ error: "targetDate must be a valid Nasdaq trading session" }, 400);
    }
    const actual = typeof body.actualOpen === "number" && Number.isFinite(body.actualOpen) ? body.actualOpen : null;
    if (actual != null) {
      if (body.targetDate > newYorkDateKey(Date.now())) {
        return json({ error: "Future-dated outcomes are not allowed" }, 409);
      }
      if (body.actualOpenSource !== "NASDAQ_OFFICIAL_CROSS") {
        return json({ error: "actualOpen requires actualOpenSource=NASDAQ_OFFICIAL_CROSS" }, 409);
      }
      if (Date.now() < nasdaqSessionSchedule(body.targetDate).regularOpenAt) {
        return json({ error: "The official open is not available before the Opening Cross" }, 409);
      }
    }
    const error = actual == null ? null : Math.abs(actual - (body.adjustedMedian as number));
    const d = db();
    await d
      .prepare(
        `INSERT INTO forecast_snapshots (target_date,captured_at,interval_label,base_median,adjusted_median,adjusted_low,adjusted_high,factors_json,actual_open,median_error,outcome_captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(target_date,interval_label) DO NOTHING`,
      )
      .bind(
        body.targetDate,
        Date.now(),
        body.intervalLabel,
        body.baseMedian,
        body.adjustedMedian,
        body.adjustedLow,
        body.adjustedHigh,
        JSON.stringify({
          modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : "open-research-v2",
          actualOpenSource: actual == null ? null : "NASDAQ_OFFICIAL_CROSS",
          capturedAt: Date.now(),
          sourceCheckedAt: typeof body.sourceCheckedAt === "number" ? body.sourceCheckedAt : null,
          factors: Array.isArray(body.factors) ? body.factors : [],
        }),
        actual,
        error,
        actual == null ? null : Date.now(),
      )
      .run();
    if (actual != null) {
      await d
        .prepare(`UPDATE forecast_snapshots SET actual_open=COALESCE(actual_open,?),median_error=COALESCE(median_error,ABS(?-adjusted_median)),outcome_captured_at=COALESCE(outcome_captured_at,?) WHERE target_date=?`)
        .bind(actual, actual, Date.now(), body.targetDate)
        .run();
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to save snapshot" }, 503);
  }
}
