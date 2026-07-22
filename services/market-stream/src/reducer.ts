import {
  MARKET_STREAM_SCHEMA,
  coverageForFeed,
  type AlpacaFeed,
  type AuthoritativeMinute,
  type MarketStateDelta,
  type MarketStreamEmission,
  type MarketStreamState,
  type ProviderMarketEvent,
  type ReductionResult,
} from "./contracts.ts";

export type MarketReducerPolicy = {
  maximumFutureSkewMs: number;
  authoritativeBarLatenessMs: number;
  recentDedupeRetention: number;
};

export const DEFAULT_REDUCER_POLICY: MarketReducerPolicy = {
  maximumFutureSkewMs: 2_000,
  // Alpaca updated bars arrive after the half-minute mark.
  authoritativeBarLatenessMs: 35_000,
  recentDedupeRetention: 512,
};

function safeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validEvent(event: ProviderMarketEvent) {
  if (!event || event.schemaVersion !== MARKET_STREAM_SCHEMA || !event.eventKey.trim()) return false;
  if (!safeInteger(event.sourceObservedAt) || !safeInteger(event.receivedAt) || !safeInteger(event.processedAt) || !safeInteger(event.availableAt)) return false;
  if (event.processedAt < event.receivedAt || event.availableAt < event.processedAt || event.sourceTimestamp.epochMs !== event.sourceObservedAt) return false;
  if (!event.sourceTimestamp.raw || !/^\d+$/.test(event.sourceTimestamp.epochNanos)) return false;
  const coverage = event.coverage;
  if (!coverage || coverage.provider !== "alpaca" || coverage.feed !== event.feed) return false;
  if (event.feed === "iex" && (coverage.scope !== "SINGLE_EXCHANGE" || !coverage.researchOnly || coverage.executionEligible)) return false;
  if (event.feed === "sip" && (coverage.scope !== "CONSOLIDATED_SIP" || coverage.researchOnly === coverage.executionEligible)) return false;
  if (event.kind === "TRADE" && (!event.trade || event.quote || event.bar || event.correction || event.cancel)) return false;
  if (event.kind === "QUOTE" && (!event.quote || event.trade || event.bar || event.correction || event.cancel)) return false;
  if ((event.kind === "BAR" || event.kind === "BAR_UPDATE") && (!event.bar || event.trade || event.quote || event.correction || event.cancel)) return false;
  if (event.kind === "CORRECTION" && (!event.correction || event.trade || event.quote || event.bar || event.cancel)) return false;
  if (event.kind === "CANCEL" && (!event.cancel || event.trade || event.quote || event.bar || event.correction)) return false;
  return true;
}

export function initialMarketStreamState(feed: AlpacaFeed, streamId = `test-${feed}-NVDA`): MarketStreamState {
  return {
    schemaVersion: MARKET_STREAM_SCHEMA,
    streamId,
    symbol: "NVDA",
    feed,
    coverage: coverageForFeed(feed),
    connectionEpoch: 0,
    serviceSequence: 0,
    providerState: "DISCONNECTED",
    lastProviderAt: null,
    lastReceivedAt: null,
    lastProcessedAt: null,
    lastAvailableAt: null,
    lastEventKey: null,
    latestTrade: null,
    latestQuote: null,
    pendingMinutes: [],
    latestCompletedMinute: null,
    recentEventKeys: [],
    barIntegrity: { state: "CLEAR", reason: null, affectedMinuteStarts: [], detectedAt: null },
    reconnectAttempt: 0,
    nextReconnectAt: null,
  };
}

function emit(
  state: MarketStreamState,
  input: {
    type: MarketStreamEmission["type"];
    processedAt: number;
    availableAt: number;
    sourceEvent: ProviderMarketEvent | null;
    minute: AuthoritativeMinute | null;
    delta: MarketStateDelta;
  },
) {
  const next = { ...state, serviceSequence: state.serviceSequence + 1 };
  const emission: MarketStreamEmission = {
    schemaVersion: MARKET_STREAM_SCHEMA,
    emissionId: `${next.streamId}:${next.serviceSequence}`,
    streamId: next.streamId,
    symbol: "NVDA",
    feed: next.feed,
    // State may remain live-SIP eligible while REST reconciliation runs. The
    // immutable emission must retain the source event's own (research-only)
    // coverage so receiver validation and qualification cannot over-promote it.
    coverage: input.sourceEvent?.coverage ?? next.coverage,
    connectionEpoch: next.connectionEpoch,
    serviceSequence: next.serviceSequence,
    processedAt: input.processedAt,
    availableAt: Math.max(input.availableAt, input.processedAt),
    type: input.type,
    sourceEvent: input.sourceEvent,
    minute: input.minute,
    delta: input.delta,
  };
  return { state: next, emission };
}

export function beginConnectionEpoch(state: MarketStreamState, at: number) {
  const connecting = { ...state, coverage: coverageForFeed(state.feed, false), connectionEpoch: state.connectionEpoch + 1, providerState: "CONNECTING" as const, reconnectAttempt: state.reconnectAttempt + 1, nextReconnectAt: null };
  const value = emit(connecting, { type: "CONNECTION", processedAt: at, availableAt: at, sourceEvent: null, minute: null, delta: { providerState: "CONNECTING" } });
  return { state: value.state, emissions: [value.emission] };
}

export function setProviderConnectionState(
  state: MarketStreamState,
  providerState: MarketStreamState["providerState"],
  at: number,
  nextReconnectAt: number | null = null,
) {
  if (state.providerState === providerState && state.nextReconnectAt === nextReconnectAt) return { state, emissions: [] as MarketStreamEmission[] };
  const transitioned = {
    ...state,
    coverage: providerState === "LIVE" ? coverageForFeed(state.feed, true) : state.coverage,
    providerState: state.barIntegrity.state === "DEGRADED" && providerState === "LIVE" ? "DEGRADED" as const : providerState,
    nextReconnectAt,
    reconnectAttempt: providerState === "LIVE" ? 0 : state.reconnectAttempt,
  };
  const value = emit(transitioned, { type: "CONNECTION", processedAt: at, availableAt: at, sourceEvent: null, minute: null, delta: { providerState: transitioned.providerState } });
  return { state: value.state, emissions: [value.emission] };
}

function isNewer(source: ProviderMarketEvent, current: { sourceTimestamp: { epochNanos: string }; availableAt: number; eventKey: string } | null) {
  if (!current) return true;
  const sourceNanos = BigInt(source.sourceTimestamp.epochNanos);
  const currentNanos = BigInt(current.sourceTimestamp.epochNanos);
  return sourceNanos > currentNanos || (sourceNanos === currentNanos &&
    (source.availableAt > current.availableAt || (source.availableAt === current.availableAt && source.eventKey > current.eventKey)));
}

function authoritativeMinute(event: ProviderMarketEvent, revision: number, status: AuthoritativeMinute["status"]): AuthoritativeMinute {
  const bar = event.bar!;
  return {
    ...bar,
    sourceEventKey: event.eventKey,
    sourceTransport: event.transport,
    providerSequence: event.providerSequence,
    revision,
    status,
    sourceObservedAt: event.sourceObservedAt,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
    availableAt: event.availableAt,
    finalizedAt: status === "PENDING" ? null : event.processedAt,
    correctedAt: status === "CORRECTED" ? event.processedAt : null,
  };
}

export function identicalAuthoritativeBar(left: AuthoritativeMinute, right: ProviderMarketEvent["bar"]) {
  return right != null && left.openCents === right.openCents && left.highCents === right.highCents &&
    left.lowCents === right.lowCents && left.closeCents === right.closeCents && left.volume === right.volume &&
    left.tradeCount === right.tradeCount && left.vwapCents === right.vwapCents && left.update === right.update;
}

/** Only cumulative/equal provider bars may advance a minute revision. */
function monotonicBarRevision(event: ProviderMarketEvent, previous: AuthoritativeMinute | null) {
  if (!previous || !event.bar) return true;
  if (previous.sourceEventKey === event.eventKey || identicalAuthoritativeBar(previous, event.bar)) return false;
  if (previous.providerSequence != null && event.providerSequence != null && event.providerSequence <= previous.providerSequence) return false;
  if (previous.update && !event.bar.update) return false;
  if (event.bar.openCents !== previous.openCents || event.bar.highCents < previous.highCents ||
    event.bar.lowCents > previous.lowCents || event.bar.volume < previous.volume ||
    event.bar.tradeCount < previous.tradeCount) return false;
  if (event.bar.volume === previous.volume && event.bar.tradeCount === previous.tradeCount) return false;
  return true;
}

export function reconcileRecoveredMinuteIntegrity(state: MarketStreamState, minuteStart: number, at: number) {
  if (state.barIntegrity.state !== "DEGRADED" || !state.barIntegrity.affectedMinuteStarts.includes(minuteStart)) {
    return { state, emissions: [] as MarketStreamEmission[] };
  }
  const affectedMinuteStarts = state.barIntegrity.affectedMinuteStarts.filter((value) => value !== minuteStart);
  const barIntegrity = affectedMinuteStarts.length
    ? { ...state.barIntegrity, affectedMinuteStarts }
    : { state: "CLEAR" as const, reason: null, affectedMinuteStarts: [], detectedAt: null };
  // REST reconciliation proves the bar payload, not the WebSocket lifecycle.
  // Keep a degraded transport degraded until the supervisor proves LIVE again.
  const providerState = state.providerState;
  const next = { ...state, barIntegrity, providerState };
  const value = emit(next, { type: "CONNECTION", processedAt: at, availableAt: at, sourceEvent: null, minute: null, delta: { providerState, barIntegrity } });
  return { state: value.state, emissions: [value.emission] };
}

/**
 * Clear an integrity incident only after the caller has durably proved a full
 * provider session was exhaustively replayed. This is the safe terminal path
 * for corrections/cancels whose original trade was absent from the local
 * trade index, so no single affected minute could be named up front.
 */
export function reconcileRecoveredSessionIntegrity(state: MarketStreamState, at: number) {
  if (state.barIntegrity.state !== "DEGRADED") return { state, emissions: [] as MarketStreamEmission[] };
  const barIntegrity = { state: "CLEAR" as const, reason: null, affectedMinuteStarts: [], detectedAt: null };
  const providerState = state.providerState;
  const next = { ...state, barIntegrity, providerState };
  const value = emit(next, { type: "CONNECTION", processedAt: at, availableAt: at, sourceEvent: null, minute: null, delta: { providerState, barIntegrity } });
  return { state: value.state, emissions: [value.emission] };
}

function degradedIntegrity(
  state: MarketStreamState,
  event: ProviderMarketEvent,
  affectedMinuteStart: number | null | undefined,
) {
  const starts = affectedMinuteStart == null
    ? state.barIntegrity.affectedMinuteStarts
    : [...new Set([...state.barIntegrity.affectedMinuteStarts, affectedMinuteStart])].sort((left, right) => left - right).slice(-240);
  return {
    state: "DEGRADED" as const,
    reason: event.kind === "CORRECTION" ? "CORRECTION" as const : event.kind === "CANCEL" ? "CANCEL" as const : "UNKNOWN" as const,
    affectedMinuteStarts: starts,
    detectedAt: Math.max(state.barIntegrity.detectedAt ?? 0, event.availableAt),
  };
}

export function reduceProviderEvent(
  state: MarketStreamState,
  event: ProviderMarketEvent,
  input: { existingMinute?: AuthoritativeMinute | null; affectedMinuteStart?: number | null; policy?: Partial<MarketReducerPolicy> } = {},
): ReductionResult {
  const policy = { ...DEFAULT_REDUCER_POLICY, ...input.policy };
  if (!validEvent(event)) return { state, disposition: "INVALID", emissions: [] };
  if (event.symbol !== state.symbol) return { state, disposition: "SYMBOL_MISMATCH", emissions: [] };
  if (event.feed !== state.feed) return { state, disposition: "FEED_MISMATCH", emissions: [] };
  if (state.recentEventKeys.includes(event.eventKey)) return { state, disposition: "DUPLICATE", emissions: [] };
  if (event.sourceObservedAt > event.receivedAt + policy.maximumFutureSkewMs) return { state, disposition: "FUTURE_SKEW", emissions: [] };

  const next: MarketStreamState = {
    ...state,
    coverage: event.coverage.executionEligible ? coverageForFeed(state.feed, true) : state.coverage,
    providerState: event.transport === "WEBSOCKET"
      ? state.barIntegrity.state === "DEGRADED" ? "DEGRADED" : "LIVE"
      : state.providerState,
    reconnectAttempt: 0,
    nextReconnectAt: null,
    lastProviderAt: Math.max(state.lastProviderAt ?? 0, event.sourceObservedAt),
    lastReceivedAt: Math.max(state.lastReceivedAt ?? 0, event.receivedAt),
    lastProcessedAt: Math.max(state.lastProcessedAt ?? 0, event.processedAt),
    lastAvailableAt: Math.max(state.lastAvailableAt ?? 0, event.availableAt),
    lastEventKey: event.eventKey,
    recentEventKeys: [...state.recentEventKeys, event.eventKey].slice(-policy.recentDedupeRetention),
  };
  let minute: AuthoritativeMinute | null = null;
  let type: MarketStreamEmission["type"] = "EVENT";
  const delta: MarketStateDelta = { lastProviderAt: next.lastProviderAt, lastAvailableAt: next.lastAvailableAt };
  if (next.providerState !== state.providerState) delta.providerState = next.providerState;

  if (event.kind === "TRADE" && event.trade && isNewer(event, state.latestTrade)) {
    next.latestTrade = { ...event.trade, eventKey: event.eventKey, sourceTimestamp: event.sourceTimestamp, sourceObservedAt: event.sourceObservedAt,
      receivedAt: event.receivedAt, processedAt: event.processedAt, availableAt: event.availableAt };
    delta.latestTrade = next.latestTrade;
  } else if (event.kind === "QUOTE" && event.quote && isNewer(event, state.latestQuote)) {
    next.latestQuote = { ...event.quote, eventKey: event.eventKey, sourceTimestamp: event.sourceTimestamp, sourceObservedAt: event.sourceObservedAt,
      receivedAt: event.receivedAt, processedAt: event.processedAt, availableAt: event.availableAt };
    delta.latestQuote = next.latestQuote;
  } else if (event.bar) {
    const pending = state.pendingMinutes.find((candidate) => candidate.barKey === event.bar!.barKey) ?? null;
    const previous = pending ?? input.existingMinute ?? null;
    const correctionRecovery = event.transport === "REST_RECOVERY" && state.barIntegrity.state === "DEGRADED" &&
      state.barIntegrity.affectedMinuteStarts.includes(event.bar.minuteStart);
    if (!monotonicBarRevision(event, previous) && !correctionRecovery) return { state, disposition: "STALE_REVISION", emissions: [] };
    const revision = (previous?.revision ?? 0) + 1;
    if (previous && previous.status !== "PENDING") {
      minute = authoritativeMinute(event, revision, "CORRECTED");
      type = "MINUTE_CORRECTED";
      if (!state.latestCompletedMinute || minute.minuteStart >= state.latestCompletedMinute.minuteStart) next.latestCompletedMinute = minute;
    } else {
      minute = authoritativeMinute(event, revision, "PENDING");
      next.pendingMinutes = [...state.pendingMinutes.filter((candidate) => candidate.barKey !== minute!.barKey), minute]
        .sort((left, right) => left.minuteStart - right.minuteStart)
        .slice(-4);
    }
    if (next.barIntegrity.state === "DEGRADED" && next.barIntegrity.affectedMinuteStarts.includes(event.bar.minuteStart) && event.transport === "REST_RECOVERY") {
      const affectedMinuteStarts = next.barIntegrity.affectedMinuteStarts.filter((minuteStart) => minuteStart !== event.bar!.minuteStart);
      next.barIntegrity = affectedMinuteStarts.length
        ? { ...next.barIntegrity, affectedMinuteStarts }
        : { state: "CLEAR", reason: null, affectedMinuteStarts: [], detectedAt: null };
      next.providerState = state.providerState;
      delta.providerState = next.providerState;
      delta.barIntegrity = next.barIntegrity;
    }
    delta.minute = minute;
  } else if (event.kind === "CORRECTION" || event.kind === "CANCEL") {
    next.barIntegrity = degradedIntegrity(state, event, input.affectedMinuteStart);
    next.providerState = "DEGRADED";
    delta.providerState = "DEGRADED";
    delta.barIntegrity = next.barIntegrity;
    const affectedTradeId = event.correction?.originalTradeId ?? event.cancel?.providerTradeId;
    if (next.latestTrade?.providerTradeId === affectedTradeId) {
      next.latestTrade = null;
      delta.latestTrade = null;
    }
  }

  const accepted = emit(next, { type, processedAt: event.processedAt, availableAt: event.availableAt, sourceEvent: event, minute, delta });
  return { state: accepted.state, disposition: "ACCEPTED", emissions: [accepted.emission] };
}

export function advanceMarketWatermark(
  state: MarketStreamState,
  processedAt: number,
  overrides: Partial<MarketReducerPolicy> = {},
) {
  const policy = { ...DEFAULT_REDUCER_POLICY, ...overrides };
  let next = state;
  const emissions: MarketStreamEmission[] = [];
  const due = state.pendingMinutes.filter((minute) => minute.receivedAt >= minute.minuteEnd &&
    processedAt >= minute.minuteEnd + policy.authoritativeBarLatenessMs &&
    (state.barIntegrity.state === "CLEAR" || (state.barIntegrity.affectedMinuteStarts.length > 0 && !state.barIntegrity.affectedMinuteStarts.includes(minute.minuteStart))));
  for (const pending of due) {
    const minute: AuthoritativeMinute = {
      ...pending,
      revision: pending.revision + 1,
      status: "FINAL",
      finalizedAt: processedAt,
      processedAt: Math.max(pending.processedAt, processedAt),
      availableAt: Math.max(pending.availableAt, processedAt),
    };
    next = {
      ...next,
      pendingMinutes: next.pendingMinutes.filter((candidate) => candidate.barKey !== minute.barKey),
      latestCompletedMinute: !next.latestCompletedMinute || minute.minuteStart >= next.latestCompletedMinute.minuteStart ? minute : next.latestCompletedMinute,
      lastProcessedAt: Math.max(next.lastProcessedAt ?? 0, processedAt),
      lastAvailableAt: Math.max(next.lastAvailableAt ?? 0, processedAt),
    };
    const completed = emit(next, { type: "MINUTE_COMPLETED", processedAt, availableAt: processedAt, sourceEvent: null, minute, delta: { minute, lastAvailableAt: next.lastAvailableAt } });
    next = completed.state; emissions.push(completed.emission);
  }
  return { state: next, emissions };
}
