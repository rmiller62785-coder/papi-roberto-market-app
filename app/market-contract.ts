export const TARGET_MARKET_SCHEMA_VERSION = "target-market-v1" as const;

export type MarketAvailability =
  | "AVAILABLE"
  | "NOT_STARTED"
  | "MISSING"
  | "NOT_ENTITLED"
  | "SOURCE_ERROR";

export type MarketFreshness =
  | "LIVE"
  | "FROZEN"
  | "FINAL"
  | "STALE"
  | "MARKET_CLOSED"
  | null;

export type MarketProvenance = {
  sourceId: string;
  provider: string;
  coverage: string;
  sourceObservedAt: number | null;
  receivedAt: number | null;
  processedAt: number;
  availableAt: number | null;
  checkedAt: number;
  persistedAt: number | null;
  ageMs: number | null;
};

export type MarketValue<T> = {
  value: T | null;
  availability: MarketAvailability;
  freshness: MarketFreshness;
  reasonCode: string | null;
  provenance: MarketProvenance | null;
};

export type TargetMarketView = "LATEST" | "DECISION_FREEZE";
export type TargetMarketRelation = "PAST" | "CURRENT" | "NEXT" | "FUTURE";

export type TargetMarketEnvelope = {
  schemaVersion: typeof TARGET_MARKET_SCHEMA_VERSION;
  symbol: "NVDA";
  targetDate: string;
  relation: TargetMarketRelation;
  requestedAt: number;
  effectiveAsOf: number;
  view: TargetMarketView;
  schedule: {
    premarketOpenAt: number;
    regularOpenAt: number;
    regularCloseAt: number;
    earlyClose: boolean;
  };
  archive: {
    status: "CURRENT" | "STALE" | "EMPTY" | "UNAVAILABLE";
    latestPersistedAt: number | null;
    latestCompletedBarAt: number | null;
  };
  quote: MarketValue<number>;
  previousSession: {
    date: string;
    open: MarketValue<number>;
    high: MarketValue<number>;
    low: MarketValue<number>;
    close: MarketValue<number>;
    volume: MarketValue<number>;
  };
  targetSession: {
    premarket: {
      high: MarketValue<number>;
      low: MarketValue<number>;
      current: MarketValue<number>;
      volume: MarketValue<number>;
    };
    regular: {
      open: MarketValue<number>;
      high: MarketValue<number>;
      low: MarketValue<number>;
      close: MarketValue<number>;
      volume: MarketValue<number>;
    };
    firstMinute: {
      high: MarketValue<number>;
      low: MarketValue<number>;
      close: MarketValue<number>;
      volume: MarketValue<number>;
      complete: boolean;
    };
  };
};

export function marketValue<T>(input: {
  value: T;
  freshness: Exclude<MarketFreshness, null>;
  provenance: MarketProvenance;
}): MarketValue<T> {
  return {
    value: input.value,
    availability: "AVAILABLE",
    freshness: input.freshness,
    reasonCode: null,
    provenance: input.provenance,
  };
}

export function unavailableMarketValue<T>(input: {
  availability: Exclude<MarketAvailability, "AVAILABLE">;
  reasonCode: string;
  freshness?: MarketFreshness;
  provenance?: MarketProvenance | null;
}): MarketValue<T> {
  return {
    value: null,
    availability: input.availability,
    freshness: input.freshness ?? null,
    reasonCode: input.reasonCode,
    provenance: input.provenance ?? null,
  };
}
