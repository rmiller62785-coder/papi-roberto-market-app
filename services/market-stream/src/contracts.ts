export const MARKET_STREAM_SCHEMA = "aperture-market-stream-v2" as const;
export type AlpacaFeed = "iex" | "sip";
export type MarketEventKind = "TRADE" | "QUOTE" | "BAR" | "BAR_UPDATE" | "CORRECTION" | "CANCEL";

export type MarketCoverage = {
  provider: "alpaca";
  feed: AlpacaFeed;
  scope: "SINGLE_EXCHANGE" | "CONSOLIDATED_SIP";
  researchOnly: boolean;
  executionEligible: boolean;
};

export type SourceTimestamp = {
  raw: string;
  epochMs: number;
  epochNanos: string;
  fractionalDigits: number;
};

export type MarketTrade = {
  providerTradeId: string;
  priceCents: number;
  size: number;
  exchange: string;
  tape: string;
  conditions: string[];
};

export type MarketQuote = {
  bidCents: number;
  askCents: number;
  bidSize: number;
  askSize: number;
  bidExchange: string;
  askExchange: string;
  tape: string;
  conditions: string[];
};

export type MarketBar = {
  barKey: string;
  minuteStart: number;
  minuteEnd: number;
  openCents: number;
  highCents: number;
  lowCents: number;
  closeCents: number;
  volume: number;
  tradeCount: number;
  vwapCents: number | null;
  update: boolean;
};

export type MarketCorrection = {
  originalTradeId: string;
  correctedTradeId: string;
  originalPriceCents: number;
  originalSize: number;
  originalConditions: string[];
  correctedPriceCents: number;
  correctedSize: number;
  correctedConditions: string[];
  exchange: string;
  tape: string;
};

export type MarketCancel = {
  providerTradeId: string;
  action: "C" | "E";
  priceCents: number;
  size: number;
  exchange: string;
  tape: string;
};

export type ProviderMarketEvent = {
  schemaVersion: typeof MARKET_STREAM_SCHEMA;
  eventKey: string;
  providerEventId: string | null;
  kind: MarketEventKind;
  symbol: "NVDA";
  source: "alpaca";
  transport: "WEBSOCKET" | "REST_RECOVERY";
  feed: AlpacaFeed;
  coverage: MarketCoverage;
  sourceTimestamp: SourceTimestamp;
  sourceObservedAt: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  providerSequence: number | null;
  trade: MarketTrade | null;
  quote: MarketQuote | null;
  bar: MarketBar | null;
  correction: MarketCorrection | null;
  cancel: MarketCancel | null;
};

export type AuthoritativeMinute = MarketBar & {
  sourceEventKey: string;
  sourceTransport: "WEBSOCKET" | "REST_RECOVERY";
  providerSequence: number | null;
  revision: number;
  status: "PENDING" | "FINAL" | "CORRECTED";
  sourceObservedAt: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  finalizedAt: number | null;
  correctedAt: number | null;
};

export type LatestTrade = MarketTrade & {
  eventKey: string;
  sourceTimestamp: SourceTimestamp;
  sourceObservedAt: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
};

export type LatestQuote = MarketQuote & {
  eventKey: string;
  sourceTimestamp: SourceTimestamp;
  sourceObservedAt: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
};

export type MarketStreamState = {
  schemaVersion: typeof MARKET_STREAM_SCHEMA;
  streamId: string;
  symbol: "NVDA";
  feed: AlpacaFeed;
  coverage: MarketCoverage;
  connectionEpoch: number;
  serviceSequence: number;
  providerState: "DISCONNECTED" | "CONNECTING" | "AUTHENTICATING" | "SUBSCRIBING" | "LIVE" | "SILENT" | "BACKOFF" | "DEGRADED";
  lastProviderAt: number | null;
  lastReceivedAt: number | null;
  lastProcessedAt: number | null;
  lastAvailableAt: number | null;
  lastEventKey: string | null;
  latestTrade: LatestTrade | null;
  latestQuote: LatestQuote | null;
  pendingMinutes: AuthoritativeMinute[];
  latestCompletedMinute: AuthoritativeMinute | null;
  recentEventKeys: string[];
  barIntegrity: {
    state: "CLEAR" | "DEGRADED";
    reason: "CORRECTION" | "CANCEL" | "UNKNOWN" | null;
    affectedMinuteStarts: number[];
    detectedAt: number | null;
  };
  reconnectAttempt: number;
  nextReconnectAt: number | null;
};

export type MarketStateDelta = {
  providerState?: MarketStreamState["providerState"];
  latestTrade?: LatestTrade | null;
  latestQuote?: LatestQuote | null;
  minute?: AuthoritativeMinute | null;
  lastProviderAt?: number | null;
  lastAvailableAt?: number | null;
  barIntegrity?: MarketStreamState["barIntegrity"];
};

export type MarketStreamEmission = {
  schemaVersion: typeof MARKET_STREAM_SCHEMA;
  emissionId: string;
  streamId: string;
  symbol: "NVDA";
  feed: AlpacaFeed;
  coverage: MarketCoverage;
  connectionEpoch: number;
  serviceSequence: number;
  processedAt: number;
  availableAt: number;
  type: "EVENT" | "MINUTE_COMPLETED" | "MINUTE_CORRECTED" | "CONNECTION";
  sourceEvent: ProviderMarketEvent | null;
  minute: AuthoritativeMinute | null;
  delta: MarketStateDelta;
};

export type ReductionDisposition =
  | "ACCEPTED"
  | "DUPLICATE"
  | "FUTURE_SKEW"
  | "SYMBOL_MISMATCH"
  | "FEED_MISMATCH"
  | "STALE_REVISION"
  | "INVALID";

export type ReductionResult = {
  state: MarketStreamState;
  disposition: ReductionDisposition;
  emissions: MarketStreamEmission[];
};

export type StreamCursor = {
  streamId: string;
  connectionEpoch: number;
  serviceSequence: number;
};

export type PublicMarketSnapshot = {
  cursor: StreamCursor;
  state: MarketStreamState;
  completedMinutes: AuthoritativeMinute[];
};

export type BrowserStreamMessage =
  | { type: "SNAPSHOT"; cursor: StreamCursor; snapshot: PublicMarketSnapshot }
  | { type: "UPDATE"; cursor: StreamCursor; emission: MarketStreamEmission }
  | { type: "RECOVERY_REQUIRED"; reason: "STREAM_CHANGED" | "EPOCH_CHANGED" | "SEQUENCE_GAP" | "HISTORY_EXPIRED"; expected: StreamCursor; received: StreamCursor };

export type IngestionBatch = {
  schemaVersion: typeof MARKET_STREAM_SCHEMA;
  streamId: string;
  fromSequence: number;
  toSequence: number;
  emissions: MarketStreamEmission[];
};

export type IngestionAck = {
  ok: true;
  streamId: string;
  highestContiguousSequence: number;
};

export type DurableObjectStubLike = { fetch(request: Request): Promise<Response> };
export type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
};

export type MarketStreamEnv = {
  MARKET_STREAM: DurableObjectNamespaceLike;
  APCA_API_KEY_ID: string;
  APCA_API_SECRET_KEY: string;
  ALPACA_FEED?: string;
  SIP_ENTITLED?: string;
  SITES_INGESTION_URL: string;
  SITES_INGESTION_SECRET: string;
  SITES_INGESTION_AUDIENCE: string;
  STREAM_CONTROL_SECRET: string;
  BROWSER_ACCESS_SECRET: string;
  BROWSER_ALLOWED_ORIGINS: string;
  MAX_BROWSER_CLIENTS?: string;
};

/**
 * A configured SIP URL is not evidence of entitlement. Callers may promote
 * SIP coverage only after Alpaca has acknowledged the requested SIP channels
 * (or returned a successful SIP-pinned REST response).
 */
export function coverageForFeed(feed: AlpacaFeed, providerConfirmed = false): MarketCoverage {
  return feed === "sip"
    ? { provider: "alpaca", feed, scope: "CONSOLIDATED_SIP", researchOnly: !providerConfirmed, executionEligible: providerConfirmed }
    : { provider: "alpaca", feed, scope: "SINGLE_EXCHANGE", researchOnly: true, executionEligible: false };
}

export function streamInstanceName(feed: AlpacaFeed, symbol = "NVDA") {
  if (symbol.toUpperCase() !== "NVDA") throw new Error("ONLY_NVDA_SUPPORTED");
  return `${feed}:NVDA`;
}
