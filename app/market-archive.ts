import type { MarketSessionSnapshot } from "./market-store.ts";
import {
  TARGET_MARKET_SCHEMA_VERSION,
  type MarketAvailability,
  type MarketProvenance,
  type MarketValue,
  type TargetMarketEnvelope,
} from "./market-contract.ts";
import { classifyTargetSession } from "./target-session.ts";

type ArchivedPayload = {
  envelope: unknown;
  completedAnalysisBars?: unknown;
};

const availability = new Set<MarketAvailability>([
  "AVAILABLE",
  "NOT_STARTED",
  "MISSING",
  "NOT_ENTITLED",
  "SOURCE_ERROR",
]);

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function archivedProvenance(
  value: unknown,
  cutoff: number,
  persistedAt: number,
): MarketProvenance | null {
  if (!record(value)) return null;
  const sourceObservedAt = value.sourceObservedAt;
  const receivedAt = value.receivedAt;
  const processedAt = value.processedAt;
  const availableAt = value.availableAt;
  const checkedAt = value.checkedAt;
  if (
    typeof value.sourceId !== "string" ||
    typeof value.provider !== "string" ||
    typeof value.coverage !== "string" ||
    (sourceObservedAt != null && !timestamp(sourceObservedAt)) ||
    !timestamp(receivedAt) ||
    !timestamp(processedAt) ||
    !timestamp(availableAt) ||
    !timestamp(checkedAt) ||
    receivedAt > processedAt ||
    processedAt > availableAt ||
    availableAt > cutoff ||
    (sourceObservedAt != null && sourceObservedAt > receivedAt + 30_000)
  ) return null;
  return {
    sourceId: value.sourceId,
    provider: value.provider,
    coverage: value.coverage,
    sourceObservedAt,
    receivedAt,
    processedAt,
    availableAt,
    checkedAt,
    persistedAt,
    ageMs: sourceObservedAt == null ? null : Math.max(0, cutoff - sourceObservedAt),
  };
}

function frozenValue(value: unknown, cutoff: number, persistedAt: number): MarketValue<number> | null {
  if (!record(value) || !availability.has(value.availability as MarketAvailability)) return null;
  const state = value.availability as MarketAvailability;
  const reasonCode = value.reasonCode == null ? null : typeof value.reasonCode === "string" ? value.reasonCode : undefined;
  if (reasonCode === undefined) return null;
  if (state === "AVAILABLE") {
    const provenance = archivedProvenance(value.provenance, cutoff, persistedAt);
    if (!finite(value.value) || !provenance) return null;
    return { value: value.value, availability: state, freshness: "FROZEN", reasonCode, provenance };
  }
  if (value.value != null) return null;
  return {
    value: null,
    availability: state,
    freshness: "FROZEN",
    reasonCode,
    provenance: value.provenance == null ? null : archivedProvenance(value.provenance, cutoff, persistedAt),
  };
}

function frozenGroup(
  value: unknown,
  keys: readonly string[],
  cutoff: number,
  persistedAt: number,
) {
  if (!record(value)) return null;
  const result: Record<string, MarketValue<number>> = {};
  for (const key of keys) {
    const item = frozenValue(value[key], cutoff, persistedAt);
    if (!item) return null;
    result[key] = item;
  }
  return result;
}

function latestCompletedBarAt(payload: ArchivedPayload, cutoff: number) {
  if (!Array.isArray(payload.completedAnalysisBars)) return null;
  let latest: number | null = null;
  for (const candidate of payload.completedAnalysisBars) {
    if (!record(candidate) || !timestamp(candidate.time)) return null;
    const end = candidate.time + 60_000;
    if (end <= cutoff) latest = Math.max(latest ?? 0, end);
  }
  return latest;
}

/**
 * Rehydrates only values that were available by the freeze cutoff. The stored
 * envelope may have been a LATEST checkpoint, but every returned value is
 * explicitly relabeled FROZEN and bound to the immutable D1 snapshot time.
 */
export function frozenEnvelopeFromArchive(input: {
  snapshot: MarketSessionSnapshot;
  targetDate: string;
  requestedAt: number;
  cutoff: number;
}): TargetMarketEnvelope | null {
  if (
    input.snapshot.targetDate !== input.targetDate ||
    input.snapshot.symbol !== "NVDA" ||
    input.snapshot.availableAt > input.cutoff ||
    !record(input.snapshot.payload)
  ) return null;
  const payload = input.snapshot.payload as ArchivedPayload;
  if (!record(payload.envelope)) return null;
  const envelope = payload.envelope;
  if (
    envelope.schemaVersion !== TARGET_MARKET_SCHEMA_VERSION ||
    envelope.symbol !== "NVDA" ||
    envelope.targetDate !== input.targetDate ||
    !record(envelope.schedule) ||
    !timestamp(envelope.schedule.premarketOpenAt) ||
    !timestamp(envelope.schedule.regularOpenAt) ||
    !timestamp(envelope.schedule.regularCloseAt) ||
    typeof envelope.schedule.earlyClose !== "boolean" ||
    !record(envelope.previousSession) ||
    typeof envelope.previousSession.date !== "string" ||
    !record(envelope.targetSession) ||
    !record(envelope.targetSession.premarket) ||
    !record(envelope.targetSession.regular) ||
    !record(envelope.targetSession.firstMinute)
  ) return null;

  const quote = frozenValue(envelope.quote, input.cutoff, input.snapshot.availableAt);
  const previous = frozenGroup(envelope.previousSession, ["open", "high", "low", "close", "volume"], input.cutoff, input.snapshot.availableAt);
  const premarket = frozenGroup(envelope.targetSession.premarket, ["high", "low", "current", "volume"], input.cutoff, input.snapshot.availableAt);
  const regular = frozenGroup(envelope.targetSession.regular, ["open", "high", "low", "close", "volume"], input.cutoff, input.snapshot.availableAt);
  const firstMinute = frozenGroup(envelope.targetSession.firstMinute, ["high", "low", "close", "volume"], input.cutoff, input.snapshot.availableAt);
  if (!quote || !previous || !premarket || !regular || !firstMinute || typeof envelope.targetSession.firstMinute.complete !== "boolean") return null;

  return {
    schemaVersion: TARGET_MARKET_SCHEMA_VERSION,
    symbol: "NVDA",
    targetDate: input.targetDate,
    relation: classifyTargetSession(input.targetDate, input.requestedAt),
    requestedAt: input.requestedAt,
    effectiveAsOf: input.cutoff,
    view: "DECISION_FREEZE",
    schedule: envelope.schedule as TargetMarketEnvelope["schedule"],
    archive: {
      status: input.snapshot.checkpoint === "T-5M" ? "CURRENT" : "STALE",
      latestPersistedAt: input.snapshot.availableAt,
      latestCompletedBarAt: latestCompletedBarAt(payload, input.cutoff),
    },
    quote,
    previousSession: {
      date: envelope.previousSession.date,
      open: previous.open,
      high: previous.high,
      low: previous.low,
      close: previous.close,
      volume: previous.volume,
    },
    targetSession: {
      premarket: {
        high: premarket.high,
        low: premarket.low,
        current: premarket.current,
        volume: premarket.volume,
      },
      regular: {
        open: regular.open,
        high: regular.high,
        low: regular.low,
        close: regular.close,
        volume: regular.volume,
      },
      firstMinute: {
        high: firstMinute.high,
        low: firstMinute.low,
        close: firstMinute.close,
        volume: firstMinute.volume,
        complete: envelope.targetSession.firstMinute.complete,
      },
    },
  };
}
