export const POLYMARKET_SELECTOR_VERSION = "geopolitical-v1";

export type PolymarketFeedStatus = "live" | "limited" | "offline";
export type PolymarketSignalState = "active" | "neutral" | "unavailable";
export type PolymarketPolarity = "YES_IS_RISK_OFF" | "YES_IS_DEESCALATION";

type RegistryRule = {
  id: string;
  topic: string;
  query: string;
  polarity: PolymarketPolarity;
  include: RegExp;
  exclude?: RegExp;
};

export type PolymarketDisplayMarket = {
  id: string;
  eventId: string;
  topic: string;
  question: string;
  url: string;
  polarity: PolymarketPolarity;
  currentProbability: number;
  priorCloseProbability: number | null;
  probabilityShock: number | null;
  signedRiskOffShock: number | null;
  rangeSignal: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  liquidity: number;
  volume24h: number;
  endDate: string;
  gammaUpdatedAt: number | null;
  bookSnapshotAt: number | null;
  baselineObservedAt: number | null;
  checkedAt: number;
};

export type PolymarketEvidence = {
  provider: "Polymarket Gamma + CLOB";
  selectorVersion: string;
  status: PolymarketFeedStatus;
  signalState: PolymarketSignalState;
  reason: string;
  checkedAt: number;
  providerObservedAt: number | null;
  priorCloseCutoffAt: number;
  signedRiskOffShock: number;
  rangeSignal: number;
  nvdaDirection: null;
  primaryMarketId: string | null;
  markets: PolymarketDisplayMarket[];
};

export type PullPolymarketEvidenceOptions = {
  priorCloseCutoffMs: number;
  fetcher?: typeof fetch;
  now?: number;
};

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
const MIN_LIQUIDITY = 25_000;
const MIN_VOLUME_24H = 5_000;
const MAX_SPREAD = 0.1;
const ACTIVE_SHOCK_THRESHOLD = 0.02;
const HISTORY_LOOKBACK_SECONDS = 7 * 24 * 60 * 60;
// A prediction-market comparison must represent the probability around the
// U.S. close, not merely the last observation from an arbitrarily old market.
// Polymarket history is requested at 10-minute fidelity, so two hours leaves
// room for sparse contracts while rejecting stale weekend/illiquid baselines.
export const POLYMARKET_MAX_BASELINE_AGE_MS = 2 * 60 * 60_000;
const MAX_BOOK_AGE_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_EVENTS_PER_QUERY = 6;
const MAX_EVENT_DETAILS = 16;
const lastGoodByCutoff = new Map<number, PolymarketEvidence>();

export function __resetPolymarketCacheForTests() {
  lastGoodByCutoff.clear();
}

// Every rule fixes both relevance and outcome polarity before any observation
// is consumed. Candidate wording that does not match a registered rule is
// display-ineligible and contributes no signal.
const registry: readonly RegistryRule[] = [
  {
    id: "us_iran_military",
    topic: "U.S.–Iran military escalation",
    query: "US Iran strike",
    polarity: "YES_IS_RISK_OFF",
    include: /(?=.*\b(?:iran|iranian)\b)(?=.*\b(?:u\.?s\.?|united states)\b)(?=.*\b(?:strike|attack|invad|bomb|military action)\w*\b)/i,
    exclude: /\b(?:ceasefire|peace deal|nuclear deal|withdrawal agreement)\b/i,
  },
  {
    id: "israel_iran_military",
    topic: "Israel–Iran military escalation",
    query: "Israel Iran strike",
    polarity: "YES_IS_RISK_OFF",
    include: /(?=.*\b(?:iran|iranian)\b)(?=.*\bisrael(?:i)?\b)(?=.*\b(?:strike|attack|invad|bomb|military action)\w*\b)/i,
    exclude: /\b(?:ceasefire|peace deal|nuclear deal)\b/i,
  },
  {
    id: "hormuz_disruption",
    topic: "Strait of Hormuz disruption",
    query: "Strait of Hormuz closure",
    polarity: "YES_IS_RISK_OFF",
    include: /(?=.*\b(?:strait of hormuz|hormuz)\b)(?=.*\b(?:close|closure|block|blockade|disrupt|halt|attack)\w*\b)/i,
    exclude: /\b(?:returns? to normal|reopen|reopening|normalization)\b/i,
  },
  {
    id: "iran_deescalation",
    topic: "Iran de-escalation",
    query: "Iran ceasefire deal",
    polarity: "YES_IS_DEESCALATION",
    include: /(?=.*\b(?:iran|iranian|strait of hormuz|hormuz)\b)(?=.*\b(?:ceasefire|peace deal|nuclear deal|returns? to normal|reopen|normalization)\w*\b)/i,
  },
] as const;

type Candidate = {
  marketId: string;
  eventId: string;
  eventSlug: string;
  topic: string;
  question: string;
  polarity: PolymarketPolarity;
  yesTokenId: string;
  liquidity: number;
  volume24h: number;
  endDate: string;
  gammaUpdatedAt: number | null;
};

type Book = {
  asset_id?: unknown;
  timestamp?: unknown;
  bids?: unknown;
  asks?: unknown;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const number = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const timestamp = (value: unknown) => {
  const numeric = number(value);
  if (numeric != null) return numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const parseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const records = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];

export function roundRobinUnique(queues: string[][], limit: number) {
  const working = queues.map((queue) => [...queue]);
  const selected: string[] = [];
  const seen = new Set<string>();
  while (selected.length < limit && working.some((queue) => queue.length)) {
    for (const queue of working) {
      while (queue.length && seen.has(queue[0])) queue.shift();
      const next = queue.shift();
      if (!next) continue;
      seen.add(next);
      selected.push(next);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

async function jsonRequest(fetcher: typeof fetch, input: string, init?: RequestInit) {
  const response = await fetcher(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Polymarket HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function marketRuleText(market: Record<string, unknown>) {
  return `${text(market.question)} ${text(market.description)}`.replace(/\s+/g, " ").trim();
}

function candidateFor(
  event: Record<string, unknown>,
  market: Record<string, unknown>,
  rule: RegistryRule,
  now: number,
): Candidate | null {
  const ruleText = marketRuleText(market);
  if (!rule.include.test(ruleText) || rule.exclude?.test(ruleText)) return null;
  if (market.active !== true || market.closed === true || market.acceptingOrders !== true || market.enableOrderBook !== true) return null;

  const outcomes = parseArray(market.outcomes).map(text);
  const tokens = parseArray(market.clobTokenIds).map(text);
  if (outcomes.length !== 2 || tokens.length !== 2) return null;
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "no");
  if (yesIndex < 0 || noIndex < 0 || yesIndex === noIndex || !tokens[yesIndex]) return null;

  const liquidity = number(market.liquidityNum) ?? number(market.liquidity) ?? 0;
  const volume24h = number(market.volume24hr) ?? 0;
  if (liquidity < MIN_LIQUIDITY || volume24h < MIN_VOLUME_24H) return null;

  const endDate = text(market.endDate) || text(market.endDateIso);
  const endAt = Date.parse(endDate);
  if (!Number.isFinite(endAt) || endAt <= now) return null;

  const marketId = text(market.id);
  const eventId = text(event.id);
  const question = text(market.question);
  if (!marketId || !eventId || !question) return null;
  return {
    marketId,
    eventId,
    eventSlug: text(event.slug),
    topic: rule.topic,
    question,
    polarity: rule.polarity,
    yesTokenId: tokens[yesIndex],
    liquidity,
    volume24h,
    endDate,
    gammaUpdatedAt: timestamp(market.updatedAt),
  };
}

function priceLevels(value: unknown) {
  return records(value)
    .map((level) => number(level.price))
    .filter((price): price is number => price != null && price >= 0 && price <= 1);
}

function unavailable(
  priorCloseCutoffAt: number,
  checkedAt: number,
  reason: string,
  status: PolymarketFeedStatus,
  markets: PolymarketDisplayMarket[] = [],
): PolymarketEvidence {
  return {
    provider: "Polymarket Gamma + CLOB",
    selectorVersion: POLYMARKET_SELECTOR_VERSION,
    status,
    signalState: status === "offline" ? "unavailable" : "neutral",
    reason,
    checkedAt,
    providerObservedAt: null,
    priorCloseCutoffAt,
    signedRiskOffShock: 0,
    rangeSignal: 0,
    nvdaDirection: null,
    primaryMarketId: null,
    markets,
  };
}

function staleIfError(priorCloseCutoffAt: number, checkedAt: number, reason: string) {
  const prior = lastGoodByCutoff.get(priorCloseCutoffAt);
  if (!prior) return unavailable(priorCloseCutoffAt, checkedAt, reason, "offline");
  return {
    ...prior,
    status: "limited" as const,
    signalState: "neutral" as const,
    reason: `${reason} Last known-good evidence is display-only and contributes zero.`,
    checkedAt,
    signedRiskOffShock: 0,
    rangeSignal: 0,
    nvdaDirection: null,
    primaryMarketId: null,
  };
}

export async function pullPolymarketEvidence({
  priorCloseCutoffMs,
  fetcher = globalThis.fetch,
  now = Date.now(),
}: PullPolymarketEvidenceOptions): Promise<PolymarketEvidence> {
  const checkedAt = finite(now) ? now : Date.now();
  if (!finite(priorCloseCutoffMs) || priorCloseCutoffMs <= 0 || priorCloseCutoffMs > checkedAt) {
    return unavailable(priorCloseCutoffMs, checkedAt, "A valid prior-close cutoff is required.", "offline");
  }
  if (typeof fetcher !== "function") {
    return unavailable(priorCloseCutoffMs, checkedAt, "The public Polymarket fetcher is unavailable.", "offline");
  }

  const searches = await Promise.allSettled(
    registry.map(async (rule) => {
      const url = new URL(`${GAMMA}/public-search`);
      url.searchParams.set("q", rule.query);
      url.searchParams.set("events_status", "active");
      url.searchParams.set("limit_per_type", "20");
      url.searchParams.set("search_profiles", "false");
      url.searchParams.set("optimized", "true");
      const payload = (await jsonRequest(fetcher, url.toString())) as Record<string, unknown>;
      return {
        rule,
        eventIds: records(payload.events)
          .map((event) => text(event.id))
          .filter(Boolean)
          .slice(0, MAX_EVENTS_PER_QUERY),
      };
    }),
  );
  const successfulSearches = searches.filter((result) => result.status === "fulfilled");
  if (!successfulSearches.length) {
    return staleIfError(priorCloseCutoffMs, checkedAt, "Polymarket discovery is unavailable.");
  }

  const rulesByEvent = new Map<string, RegistryRule[]>();
  for (const result of successfulSearches) {
    for (const eventId of result.value.eventIds) {
      const related = rulesByEvent.get(eventId) ?? [];
      if (!related.some((rule) => rule.id === result.value.rule.id)) related.push(result.value.rule);
      rulesByEvent.set(eventId, related);
    }
  }
  if (!rulesByEvent.size) {
    return unavailable(priorCloseCutoffMs, checkedAt, "No registered geopolitical market was discovered.", "limited");
  }

  // Round-robin across registry queries so an earlier, noisy topic cannot
  // starve de-escalation or another polarity from the bounded detail budget.
  const boundedEventIds = roundRobinUnique(
    successfulSearches.map((result) => result.value.eventIds),
    MAX_EVENT_DETAILS,
  );
  const events = await Promise.allSettled(
    boundedEventIds.map(async (eventId) => {
      const event = (await jsonRequest(fetcher, `${GAMMA}/events/${encodeURIComponent(eventId)}`)) as Record<string, unknown>;
      return event;
    }),
  );
  const candidates: Candidate[] = [];
  for (const result of events) {
    if (result.status !== "fulfilled") continue;
    const event = result.value;
    if (event.active !== true || event.closed === true) continue;
    const eventRules = rulesByEvent.get(text(event.id)) ?? [];
    for (const market of records(event.markets)) {
      for (const rule of eventRules) {
        const candidate = candidateFor(event, market, rule, checkedAt);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  if (!candidates.length) {
    return unavailable(priorCloseCutoffMs, checkedAt, "No relevant market passed activity, liquidity, volume, and deadline checks.", "limited");
  }

  // Bound the public batch request and keep only one copy of each outcome token.
  const candidateByToken = new Map<string, Candidate>();
  for (const candidate of candidates.sort((a, b) => b.volume24h - a.volume24h || b.liquidity - a.liquidity)) {
    if (!candidateByToken.has(candidate.yesTokenId) && candidateByToken.size < 20) {
      candidateByToken.set(candidate.yesTokenId, candidate);
    }
  }
  let books: Book[];
  try {
    const payload = await jsonRequest(fetcher, `${CLOB}/books`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([...candidateByToken.keys()].map((tokenId) => ({ token_id: tokenId }))),
    });
    books = records(payload) as Book[];
  } catch {
    return staleIfError(priorCloseCutoffMs, checkedAt, "Polymarket order books are unavailable.");
  }

  const qualified: Array<Candidate & { bestBid: number; bestAsk: number; spread: number; currentProbability: number; bookSnapshotAt: number }> = [];
  let timestampRejected = 0;
  for (const book of books) {
    const candidate = candidateByToken.get(text(book.asset_id));
    if (!candidate) continue;
    const bookSnapshotAt = timestamp(book.timestamp);
    if (
      bookSnapshotAt == null ||
      checkedAt - bookSnapshotAt > MAX_BOOK_AGE_MS ||
      bookSnapshotAt > checkedAt + MAX_CLOCK_SKEW_MS
    ) {
      timestampRejected += 1;
      continue;
    }
    const bids = priceLevels(book.bids);
    const asks = priceLevels(book.asks);
    if (!bids.length || !asks.length) continue;
    // The live endpoint has returned arrays in an order that differs from its
    // documentation, so best levels are always derived, never positional.
    const bestBid = Math.max(...bids);
    const bestAsk = Math.min(...asks);
    const spread = bestAsk - bestBid;
    if (spread < 0 || spread > MAX_SPREAD) continue;
    const currentProbability = clamp((bestBid + bestAsk) / 2, 0, 1);
    qualified.push({
      ...candidate,
      bestBid,
      bestAsk,
      spread,
      currentProbability,
      bookSnapshotAt,
    });
  }
  if (!qualified.length) {
    return unavailable(
      priorCloseCutoffMs,
      checkedAt,
      timestampRejected
        ? "Relevant order books had missing, stale, or future timestamps; signal held neutral."
        : "Relevant markets had missing or wider-than-10-point order books; signal held neutral.",
      "limited",
    );
  }

  // One market per registered topic prevents nested deadlines and closely
  // related contracts from being counted as independent evidence.
  const selectedByTopic = new Map<string, (typeof qualified)[number]>();
  for (const market of qualified.sort((a, b) => b.volume24h - a.volume24h || b.liquidity - a.liquidity)) {
    if (!selectedByTopic.has(market.topic)) selectedByTopic.set(market.topic, market);
  }
  const selected = [...selectedByTopic.values()];
  const historyStart = Math.max(0, Math.floor(priorCloseCutoffMs / 1_000) - HISTORY_LOOKBACK_SECONDS);
  const historyEnd = Math.floor(priorCloseCutoffMs / 1_000);
  const historyResults = await Promise.allSettled(
    selected.map(async (market) => {
      const url = new URL(`${CLOB}/prices-history`);
      url.searchParams.set("market", market.yesTokenId);
      url.searchParams.set("startTs", String(historyStart));
      url.searchParams.set("endTs", String(historyEnd));
      url.searchParams.set("fidelity", "10");
      const payload = (await jsonRequest(fetcher, url.toString())) as Record<string, unknown>;
      const history = records(payload.history)
        .map((point) => ({ observedAt: timestamp(point.t), probability: number(point.p) }))
        .filter(
          (point): point is { observedAt: number; probability: number } =>
            point.observedAt != null &&
            point.observedAt >= priorCloseCutoffMs - POLYMARKET_MAX_BASELINE_AGE_MS &&
            point.observedAt <= priorCloseCutoffMs &&
            point.probability != null &&
            point.probability >= 0 &&
            point.probability <= 1,
        )
        .sort((a, b) => a.observedAt - b.observedAt);
      return { market, baseline: history.at(-1) ?? null };
    }),
  );

  const displayMarkets: PolymarketDisplayMarket[] = historyResults.map((result, index) => {
    const market = selected[index];
    const baseline = result.status === "fulfilled" ? result.value.baseline : null;
    const probabilityShock = baseline ? market.currentProbability - baseline.probability : null;
    const signedRiskOffShock = probabilityShock == null
      ? null
      : probabilityShock * (market.polarity === "YES_IS_RISK_OFF" ? 1 : -1);
    return {
      id: market.marketId,
      eventId: market.eventId,
      topic: market.topic,
      question: market.question,
      url: market.eventSlug ? `https://polymarket.com/event/${market.eventSlug}` : "https://polymarket.com",
      polarity: market.polarity,
      currentProbability: market.currentProbability,
      priorCloseProbability: baseline?.probability ?? null,
      probabilityShock,
      signedRiskOffShock,
      rangeSignal: Math.abs(signedRiskOffShock ?? 0),
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      spread: market.spread,
      liquidity: market.liquidity,
      volume24h: market.volume24h,
      endDate: market.endDate,
      gammaUpdatedAt: market.gammaUpdatedAt,
      bookSnapshotAt: market.bookSnapshotAt,
      baselineObservedAt: baseline?.observedAt ?? null,
      checkedAt,
    };
  });
  const shockReady = displayMarkets.filter(
    (market): market is PolymarketDisplayMarket & { signedRiskOffShock: number } => market.signedRiskOffShock != null,
  );
  if (!shockReady.length) {
    return unavailable(
      priorCloseCutoffMs,
      checkedAt,
      "Qualified markets had no point-in-time observation within two hours before the prior close; stale baseline is display-only and the signal is held neutral.",
      "limited",
      displayMarkets,
    );
  }

  // Use the largest independently qualified repricing rather than summing
  // correlated prediction contracts. This is event-risk metadata only and is
  // never translated into an NVDA long/short direction here.
  const primary = shockReady.reduce((winner, market) =>
    Math.abs(market.signedRiskOffShock) > Math.abs(winner.signedRiskOffShock) ? market : winner,
  );
  const signedRiskOffShock = clamp(primary.signedRiskOffShock, -1, 1);
  const rangeSignal = Math.abs(signedRiskOffShock);
  const active = rangeSignal >= ACTIVE_SHOCK_THRESHOLD;
  // Current-source freshness is represented by the book snapshot. The older
  // comparison observation remains separately available as baselineObservedAt.
  const providerTimes = displayMarkets
    .map((market) => market.bookSnapshotAt)
    .filter((value): value is number => value != null);
  const result: PolymarketEvidence = {
    provider: "Polymarket Gamma + CLOB",
    selectorVersion: POLYMARKET_SELECTOR_VERSION,
    status: "live",
    signalState: active ? "active" : "neutral",
    reason: active
      ? `Prediction-market event risk repriced ${(rangeSignal * 100).toFixed(1)} percentage points since the prior close.`
      : "Qualified prediction markets moved less than 2 percentage points since the prior close.",
    checkedAt,
    providerObservedAt: providerTimes.length ? Math.min(...providerTimes) : null,
    priorCloseCutoffAt: priorCloseCutoffMs,
    signedRiskOffShock,
    rangeSignal,
    nvdaDirection: null,
    primaryMarketId: primary.id,
    markets: displayMarkets,
  };
  lastGoodByCutoff.set(priorCloseCutoffMs, result);
  if (lastGoodByCutoff.size > 8) lastGoodByCutoff.delete(lastGoodByCutoff.keys().next().value!);
  return result;
}
