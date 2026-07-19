import { env } from "cloudflare:workers";

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
type MarketContext = {
  available: boolean;
  signal: number;
  qqqChangePct: number | null;
  soxxChangePct: number | null;
  intradayRangePct: number | null;
  asOf: number | null;
};
type PullResult = { rows: EventRow[]; feeds: FeedStatus[]; market: MarketContext; updatedAt: number };

const defaults = [
  { key: "geopolitical", label: "Geopolitical escalation", category: "News risk", directionWeight: 0, rangeWeight: 0.35 },
  { key: "news_intensity", label: "Breaking-news intensity", category: "News risk", directionWeight: 0, rangeWeight: 0.15 },
  { key: "nvda_earnings", label: "NVDA earnings proximity", category: "Scheduled", directionWeight: 0, rangeWeight: 0.5 },
  { key: "macro_release", label: "Major U.S. macro release", category: "Scheduled", directionWeight: 0, rangeWeight: 0.3 },
  { key: "sec_filing", label: "New NVDA SEC filing", category: "Company", directionWeight: 0, rangeWeight: 0.2 },
  { key: "market_confirmation", label: "QQQ + semiconductor confirmation", category: "Cross-market", directionWeight: 30, rangeWeight: 0.05 },
  { key: "cross_market_volatility", label: "Cross-market volatility", category: "Cross-market", directionWeight: 0, rangeWeight: 0.15 },
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
  `CREATE TABLE IF NOT EXISTS forecast_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,target_date TEXT NOT NULL,captured_at INTEGER NOT NULL,interval_label TEXT NOT NULL,base_median REAL NOT NULL,adjusted_median REAL NOT NULL,adjusted_low REAL NOT NULL,adjusted_high REAL NOT NULL,factors_json TEXT NOT NULL,actual_open REAL,median_error REAL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS forecast_snapshots_target_interval_idx ON forecast_snapshots (target_date,interval_label)`,
];

let intelligenceCache: { expires: number; value: PullResult } | null = null;
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
  await d.batch(
    defaults.map((item) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO forecast_weights (key,label,category,enabled,direction_weight,range_weight,updated_at) VALUES (?,?,?,1,?,?,?)`,
        )
        .bind(item.key, item.label, item.category, item.directionWeight, item.rangeWeight, now),
    ),
  );
}

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
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
function classify(headline: string, summary: string) {
  const text = `${headline} ${summary}`.toLowerCase();
  if (/iran|israel|missile|airstrike|air strike|war|hormuz|blockade|military strike|invasion|retaliat|ceasefire|sanction/.test(text))
    return { category: "Geopolitical", severity: 3 };
  if (/earnings|quarterly results|guidance|revenue forecast|eps estimate/.test(text))
    return { category: "Earnings", severity: 2.5 };
  if (/fomc|federal reserve|interest rate|inflation|\bcpi\b|\bppi\b|payroll|employment report|jobs report|job openings/.test(text))
    return { category: "Macro", severity: 2.5 };
  if (/nvidia|\bnvda\b|semiconductor|chip export|ai chip|data center gpu/.test(text))
    return { category: "NVDA / Semis", severity: 2 };
  return { category: "Market", severity: 1 };
}
function parseGdeltTime(value: unknown) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return Date.parse(raw);
  return Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
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
  const target = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
  );
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(candidate)).map((part) => [part.type, part.value]),
    );
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
    );
    candidate += target - rendered;
  }
  return candidate;
}
function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function observedFixedDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function nthWeekdayDate(year: number, month: number, weekday: number, n: number) {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (n - 1) * 7);
  return date.toISOString().slice(0, 10);
}
function priorWeekday(key: string) {
  let value = shiftDateKey(key, -1);
  while ([0, 6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())) value = shiftDateKey(value, -1);
  return value;
}
function earlyCloseDate(key: string) {
  const year = Number(key.slice(0, 4));
  const afterThanksgiving = shiftDateKey(nthWeekdayDate(year, 10, 4, 4), 1);
  const beforeIndependence = priorWeekday(observedFixedDate(year, 6, 4));
  const christmasEve = `${year}-12-24`;
  return key === afterThanksgiving || key === beforeIndependence ||
    (key === christmasEve && observedFixedDate(year, 11, 25) !== christmasEve);
}
function regularMarketOpenNow(value = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  const key = `${parts.year}-${parts.month}-${parts.day}`;
  const closeMinute = earlyCloseDate(key) ? 780 : 960;
  return !["Sat", "Sun"].includes(parts.weekday) && minute >= 570 && minute < closeMinute;
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
function changePct(value: Quote) {
  return valid(value.c) && valid(value.pc) && value.pc > 0 ? ((value.c / value.pc) - 1) * 100 : null;
}
function rangePct(value: Quote) {
  return valid(value.h) && valid(value.l) && valid(value.pc) && value.pc > 0 ? ((value.h - value.l) / value.pc) * 100 : null;
}

async function pullIntelligence(): Promise<PullResult> {
  if (intelligenceCache && intelligenceCache.expires > Date.now()) return intelligenceCache.value;
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
        const classification = classify(headline, summary);
        const time = Number(item.datetime) || now;
        if (!headline || time < now - 3 * 86400) continue;
        if (classification.severity < 2 && !/nvidia|nvda|semiconductor|nasdaq|oil|iran|israel|war|fed|inflation/i.test(`${headline} ${summary}`)) continue;
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
        rows.push({
          id: `earn-${date}-${item.symbol}`,
          source: "Finnhub earnings calendar",
          category: "Earnings",
          headline: `${item.symbol ?? "NVDA"} earnings scheduled`,
          summary: `Scheduled ${item.hour ?? "time not supplied"}; EPS estimate ${item.epsEstimate ?? "—"}.`,
          url: "",
          eventTime: Date.parse(`${date}T12:00:00Z`),
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
  const [gdelt, sec, bls] = await Promise.allSettled([
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
  ]);

  if (gdelt.status === "fulfilled") {
    const articles = ((gdelt.value as { articles?: Array<Record<string, unknown>> }).articles ?? []);
    for (const item of articles) {
      const headline = clean(item.title);
      const time = parseGdeltTime(item.seendate);
      const classification = classify(headline, "");
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
    feeds.push({ id: "gdelt", label: "GDELT global news", status: "limited", detail: "No-key feed rate-limited or unavailable; Finnhub remains active", lastChecked: checkedAt });
  }

  if (sec.status === "fulfilled") {
    const payload = sec.value as { filings?: { recent?: Record<string, string[]> } };
    const recent = payload.filings?.recent;
    if (recent) {
      for (let index = 0; index < Math.min(20, recent.form?.length ?? 0); index += 1) {
        const filed = recent.filingDate?.[index];
        const form = recent.form?.[index];
        const accession = recent.accessionNumber?.[index];
        if (!filed || !form || !accession || Date.parse(filed) < Date.now() - 7 * 864e5 || !/^(8-K|10-Q|10-K|4)$/.test(form)) continue;
        rows.push({
          id: `sec-${accession}`,
          source: "SEC EDGAR",
          category: "SEC filing",
          headline: `NVIDIA filed Form ${form}`,
          summary: `Official filing disseminated ${filed}.`,
          url: `https://www.sec.gov/Archives/edgar/data/1045810/${accession.replace(/-/g, "")}/`,
          eventTime: Date.parse(`${filed}T12:00:00Z`),
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
  const value = { rows: clustered, feeds, market, updatedAt: checkedAt };
  intelligenceCache = { expires: checkedAt + 10 * 60_000, value };
  return value;
}

function signals(events: EventRow[], targetDate: string, market: MarketContext) {
  const now = Date.now();
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
    (event) => !["Earnings", "Macro", "SEC filing"].includes(event.category),
  );
  const newsLoad = newsEvents.reduce(
    (sum, event) => sum + freshness(event) * (event.severity / 3) * Math.min(1.5, 0.75 + (event.clusterCount ?? 1) * 0.1),
    0,
  );
  const volatility = market.intradayRangePct == null ? 0 : clamp((market.intradayRangePct - 0.5) / 2, 0, 1);
  return {
    geopolitical,
    news_intensity: clamp(newsLoad / 6, 0, 1),
    nvda_earnings: target.some((event) => event.category === "Earnings") ? 1 : 0,
    macro_release: target.some((event) => event.category === "Macro") ? 1 : 0,
    sec_filing: recent.some((event) => event.category === "SEC filing") ? 1 : 0,
    market_confirmation: market.available ? market.signal : 0,
    cross_market_volatility: volatility,
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
function buildFlag(signal: ReturnType<typeof signals>, events: EventRow[], targetDate: string, updatedAt: number) {
  const score = Math.round(
    clamp(
      signal.geopolitical * 40 +
        signal.news_intensity * 15 +
        signal.nvda_earnings * 30 +
        signal.macro_release * 25 +
        signal.sec_filing * 15 +
        Math.abs(signal.market_confirmation) * 15 +
        signal.cross_market_volatility * 15,
      0,
      100,
    ),
  );
  const level = score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "ELEVATED" : "CLEAR";
  const direction = signal.market_confirmation >= 0.12 ? "BULLISH CONFIRMATION" : signal.market_confirmation <= -0.12 ? "BEARISH CONFIRMATION" : "DIRECTION UNCONFIRMED";
  const reasons: string[] = [];
  if (signal.geopolitical >= 0.25) reasons.push("Geopolitical escalation");
  if (signal.news_intensity >= 0.35) reasons.push("Breaking-news cluster");
  if (signal.nvda_earnings) reasons.push("NVDA earnings on target session");
  if (signal.macro_release) reasons.push("Major U.S. macro release");
  if (signal.sec_filing) reasons.push("Recent NVIDIA filing");
  if (Math.abs(signal.market_confirmation) >= 0.12) reasons.push(direction === "BULLISH CONFIRMATION" ? "QQQ/SOXX confirming higher" : "QQQ/SOXX confirming lower");
  if (signal.cross_market_volatility >= 0.3) reasons.push("Elevated cross-market range");
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

export async function GET(request: Request) {
  try {
    await ensure();
    const url = new URL(request.url);
    const targetDate = url.searchParams.get("targetDate") ?? new Date().toISOString().slice(0, 10);
    const intelligence = await pullIntelligence();
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
    const currentSignals = signals(intelligence.rows, targetDate, intelligence.market);
    const signalEvaluatedAt = Date.now();
    const contributions = configuredWeights.map((weight) => {
      const signal = currentSignals[weight.key as keyof typeof currentSignals] ?? 0;
      return {
        key: weight.key,
        label: weight.label,
        category: weight.category,
        enabled: Boolean(weight.enabled),
        signal,
        directionBps: Boolean(weight.enabled) ? signal * weight.directionWeight : 0,
        rangePct: Boolean(weight.enabled) ? Math.abs(signal) * weight.rangeWeight : 0,
        source: factorSource(weight.key, intelligence.feeds, signalEvaluatedAt),
      };
    });
    const snapshots = await d
      .prepare(
        `SELECT id,target_date AS targetDate,captured_at AS capturedAt,interval_label AS intervalLabel,base_median AS baseMedian,adjusted_median AS adjustedMedian,adjusted_low AS adjustedLow,adjusted_high AS adjustedHigh,actual_open AS actualOpen,median_error AS medianError FROM forecast_snapshots ORDER BY captured_at DESC LIMIT 100`,
      )
      .all();
    return json({
      weights: configuredWeights.map((weight) => ({
        ...weight,
        source: factorSource(weight.key, intelligence.feeds, signalEvaluatedAt),
      })),
      events: intelligence.rows.slice(0, 40),
      feeds: intelligence.feeds,
      marketContext: intelligence.market,
      flag: buildFlag(currentSignals, intelligence.rows, targetDate, intelligence.updatedAt),
      contributions,
      adjustment: {
        directionBps: contributions.reduce((sum, item) => sum + item.directionBps, 0),
        rangeMultiplier: Math.max(0.5, 1 + contributions.reduce((sum, item) => sum + item.rangePct, 0)),
      },
      snapshots: snapshots.results,
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
    const body = (await request.json()) as { weights?: Array<Partial<Weight>> };
    if (!Array.isArray(body.weights) || body.weights.length === 0) return json({ error: "non-empty weights array required" }, 400);
    const knownKeys = new Set(defaults.map((item) => item.key));
    const seenKeys = new Set<string>();
    const invalid = body.weights.find((weight) => {
      const enabledValid = typeof weight.enabled === "boolean" || weight.enabled === 0 || weight.enabled === 1;
      const directionValid = valid(weight.directionWeight) && weight.directionWeight >= -100 && weight.directionWeight <= 100;
      const rangeValid = valid(weight.rangeWeight) && weight.rangeWeight >= -0.75 && weight.rangeWeight <= 2;
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
    const [updatedWeights, intelligence] = await Promise.all([weights(), pullIntelligence()]);
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
    const actual = typeof body.actualOpen === "number" && Number.isFinite(body.actualOpen) ? body.actualOpen : null;
    const error = actual == null ? null : Math.abs(actual - (body.adjustedMedian as number));
    const d = db();
    await d
      .prepare(
        `INSERT INTO forecast_snapshots (target_date,captured_at,interval_label,base_median,adjusted_median,adjusted_low,adjusted_high,factors_json,actual_open,median_error) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(target_date,interval_label) DO NOTHING`,
      )
      .bind(
        body.targetDate,
        Date.now(),
        body.intervalLabel,
        body.baseMedian,
        body.adjustedMedian,
        body.adjustedLow,
        body.adjustedHigh,
        JSON.stringify(body.factors ?? []),
        actual,
        error,
      )
      .run();
    if (actual != null) {
      await d
        .prepare(`UPDATE forecast_snapshots SET actual_open=COALESCE(actual_open,?),median_error=COALESCE(median_error,ABS(?-adjusted_median)) WHERE target_date=?`)
        .bind(actual, actual, body.targetDate)
        .run();
    }
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to save snapshot" }, 503);
  }
}
