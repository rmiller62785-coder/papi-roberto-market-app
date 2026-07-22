import { computeOpeningAnalysis } from "./opening-analysis.ts";
import { nasdaqSessionSchedule, previousNasdaqSession } from "./market-session.ts";
import type { MarketProvenance, MarketValue, TargetMarketEnvelope, TargetMarketView } from "./market-contract.ts";

export type SelectedMarketPayload = {
  symbol: "NVDA";
  targetDate: string;
  marketContract: TargetMarketEnvelope;
  session: string;
  source: string;
  checkedAt: string;
  realtime: boolean;
  displaySession?: {
    date: string | null;
    relation: "target_session" | "latest_available" | "unavailable";
    provider: string | null;
    barCount: number;
    latestObservedAt: string | null;
  };
  freshness?: {
    quote?: {
      provider?: string;
      observedAt?: string | null;
      fetchedAt?: string | null;
      ageMs?: number | null;
      stale?: boolean;
      marketClosed?: boolean;
      state?: "current" | "stale" | "market_closed" | "unavailable";
      currentForSession?: boolean;
      futureSkew?: boolean;
    };
    history?: {
      provider?: string;
      dailyProvider?: string;
      dailyFetchedAt?: string;
      minuteProvider?: string;
      minuteFetchedAt?: string;
      latestMinuteObservedAt?: string | null;
      latestDailyObservedAt?: string | null;
      fetchedAt?: string;
      dailyStatus?: string;
      minuteStatus?: string;
      dailyError?: string | null;
      minuteError?: string | null;
    };
  };
  daily?: Array<{ date: string; dateKey?: string; open?: number; high: number; low: number; close: number }>;
  bars?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  analysisBars?: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  firstMinuteHistory?: Array<{ range: number; volume: number }>;
};

export type UnavailableDecisionFreezeResponse = {
  error: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE";
  targetDate: string;
  marketContract: TargetMarketEnvelope;
};

type JsonObject = Record<string, unknown>;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const AVAILABILITY = ["AVAILABLE", "NOT_STARTED", "MISSING", "NOT_ENTITLED", "SOURCE_ERROR"] as const;
const FRESHNESS = ["LIVE", "FROZEN", "FINAL", "STALE", "MARKET_CLOSED"] as const;

function objectValue(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function member(value: unknown, values: readonly string[]) {
  return typeof value === "string" && values.includes(value);
}

function safeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableTimestamp(value: unknown) {
  return value == null || safeTimestamp(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown) {
  return value == null || typeof value === "string";
}

function dateTimeString(value: unknown): value is string {
  return nonemptyString(value) && Number.isFinite(Date.parse(value));
}

function nullableDateTimeString(value: unknown) {
  return value == null || dateTimeString(value);
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalNullableString(value: unknown) {
  return value === undefined || nullableString(value);
}

function optionalNullableDateTimeString(value: unknown) {
  return value === undefined || nullableDateTimeString(value);
}

function optionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

function displaySessionPayload(value: unknown) {
  return objectValue(value) &&
    (value.date == null || (typeof value.date === "string" && DATE_KEY.test(value.date))) &&
    member(value.relation, ["target_session", "latest_available", "unavailable"]) &&
    (value.provider == null || nonemptyString(value.provider)) &&
    safeTimestamp(value.barCount) && nullableDateTimeString(value.latestObservedAt);
}

function freshnessPayload(value: unknown) {
  if (!objectValue(value)) return false;
  if (value.quote !== undefined) {
    if (!objectValue(value.quote) || !optionalString(value.quote.provider) ||
      !optionalNullableDateTimeString(value.quote.observedAt) || !optionalNullableDateTimeString(value.quote.fetchedAt) ||
      !(value.quote.ageMs === undefined || value.quote.ageMs == null || (finite(value.quote.ageMs) && value.quote.ageMs >= 0)) ||
      !optionalBoolean(value.quote.stale) || !optionalBoolean(value.quote.marketClosed) ||
      !optionalBoolean(value.quote.currentForSession) || !optionalBoolean(value.quote.futureSkew) ||
      !(value.quote.state === undefined || member(value.quote.state, ["current", "stale", "market_closed", "unavailable"]))) return false;
  }
  if (value.history !== undefined) {
    if (!objectValue(value.history) ||
      !["provider", "dailyProvider", "dailyFetchedAt", "minuteProvider", "minuteFetchedAt", "fetchedAt", "dailyStatus", "minuteStatus"]
        .every((key) => optionalString(value.history![key])) ||
      !["latestMinuteObservedAt", "latestDailyObservedAt"]
        .every((key) => optionalNullableDateTimeString(value.history![key])) ||
      !["dailyError", "minuteError"].every((key) => optionalNullableString(value.history![key]))) return false;
  }
  return true;
}

function provenancePayload(value: unknown, effectiveAsOf: number): value is MarketProvenance {
  if (!objectValue(value) || typeof value.sourceId !== "string" || !value.sourceId.trim() ||
    typeof value.provider !== "string" || !value.provider.trim() || typeof value.coverage !== "string" || !value.coverage.trim() ||
    !nullableTimestamp(value.sourceObservedAt) || !nullableTimestamp(value.receivedAt) ||
    !safeTimestamp(value.processedAt) || !nullableTimestamp(value.availableAt) || !safeTimestamp(value.checkedAt) ||
    !nullableTimestamp(value.persistedAt) || !(value.ageMs == null || safeTimestamp(value.ageMs))) return false;
  if (value.availableAt == null || value.availableAt > effectiveAsOf || value.processedAt > value.availableAt) return false;
  if (value.sourceObservedAt != null && value.sourceObservedAt > (value.receivedAt ?? value.processedAt)) return false;
  if (value.receivedAt != null && value.receivedAt > value.processedAt) return false;
  if (value.persistedAt != null && (value.persistedAt < value.availableAt || value.persistedAt > effectiveAsOf)) return false;
  const derivedAge = value.sourceObservedAt == null ? null : Math.max(0, value.processedAt - value.sourceObservedAt);
  return derivedAge == null ? value.ageMs == null : value.ageMs != null && value.ageMs >= derivedAge;
}

function marketValuePayload(value: unknown, effectiveAsOf: number, view: TargetMarketView): value is MarketValue<number> {
  if (!objectValue(value) || !member(value.availability, AVAILABILITY) ||
    !(value.freshness == null || member(value.freshness, FRESHNESS)) ||
    !(value.reasonCode == null || typeof value.reasonCode === "string") ||
    !(value.provenance == null || provenancePayload(value.provenance, effectiveAsOf))) return false;
  if (value.availability === "AVAILABLE") {
    return finite(value.value) && value.value >= 0 && value.freshness != null && value.provenance != null &&
      value.reasonCode == null && (view !== "DECISION_FREEZE" || value.freshness === "FROZEN");
  }
  return value.value === null && typeof value.reasonCode === "string" && value.reasonCode.length > 0;
}

function marketBarPayload(value: unknown, contract: TargetMarketEnvelope) {
  if (!objectValue(value) || !safeTimestamp(value.time) || value.time < contract.schedule.premarketOpenAt ||
    value.time + 60_000 > contract.effectiveAsOf || ![value.open, value.high, value.low, value.close, value.volume].every(finite)) return false;
  return value.open >= 0 && value.high >= value.open && value.high >= value.close &&
    value.low <= value.open && value.low <= value.close && value.low >= 0 && value.volume >= 0;
}

function dailyPayload(value: unknown, targetDate: string) {
  if (!objectValue(value)) return false;
  const date = typeof value.dateKey === "string" ? value.dateKey : value.date;
  return typeof date === "string" && DATE_KEY.test(date) && date < targetDate &&
    (value.open == null || finite(value.open)) && [value.high, value.low, value.close].every(finite) &&
    value.high >= value.low && (value.open == null || (value.high >= value.open && value.low <= value.open)) &&
    value.high >= value.close && value.low <= value.close;
}

function marketEnvelopePayload(value: unknown, targetDate: string): value is TargetMarketEnvelope {
  if (!objectValue(value) || value.schemaVersion !== "target-market-v1" || value.symbol !== "NVDA" || value.targetDate !== targetDate ||
    !member(value.relation, ["PAST", "CURRENT", "NEXT", "FUTURE"]) || !safeTimestamp(value.requestedAt) ||
    !safeTimestamp(value.effectiveAsOf) || !member(value.view, ["LATEST", "DECISION_FREEZE"]) ||
    !objectValue(value.schedule) || !objectValue(value.archive) || !objectValue(value.previousSession) || !objectValue(value.targetSession)) return false;
  const expectedSchedule = nasdaqSessionSchedule(targetDate);
  if (value.schedule.premarketOpenAt !== expectedSchedule.premarketOpenAt || value.schedule.regularOpenAt !== expectedSchedule.regularOpenAt ||
    value.schedule.regularCloseAt !== expectedSchedule.regularCloseAt || value.schedule.earlyClose !== expectedSchedule.earlyClose ||
    value.previousSession.date !== previousNasdaqSession(targetDate, { inclusive: false }) ||
    !member(value.archive.status, ["CURRENT", "STALE", "EMPTY", "UNAVAILABLE"]) ||
    !nullableTimestamp(value.archive.latestPersistedAt) || !nullableTimestamp(value.archive.latestCompletedBarAt) ||
    (value.archive.latestPersistedAt != null && value.archive.latestPersistedAt > value.effectiveAsOf) ||
    (value.archive.latestCompletedBarAt != null && value.archive.latestCompletedBarAt > value.effectiveAsOf)) return false;
  const contract = value as unknown as TargetMarketEnvelope;
  const target = value.targetSession;
  if (!objectValue(target.premarket) || !objectValue(target.regular) || !objectValue(target.firstMinute) ||
    typeof target.firstMinute.complete !== "boolean") return false;
  const marketValues = [
    value.quote,
    value.previousSession.open, value.previousSession.high, value.previousSession.low, value.previousSession.close, value.previousSession.volume,
    target.premarket.high, target.premarket.low, target.premarket.current, target.premarket.volume,
    target.regular.open, target.regular.high, target.regular.low, target.regular.close, target.regular.volume,
    target.firstMinute.high, target.firstMinute.low, target.firstMinute.close, target.firstMinute.volume,
  ];
  if (!marketValues.every((item) => marketValuePayload(item, contract.effectiveAsOf, contract.view))) return false;
  const firstMinuteAvailable = [target.firstMinute.high, target.firstMinute.low, target.firstMinute.close, target.firstMinute.volume]
    .every((item) => objectValue(item) && item.availability === "AVAILABLE");
  return target.firstMinute.complete === firstMinuteAvailable &&
    (!target.firstMinute.complete || contract.effectiveAsOf >= contract.schedule.regularOpenAt + 60_000);
}

/** Complete runtime boundary for the selected-session market response. */
export function isSelectedMarketPayload(value: unknown, targetDate: string): value is SelectedMarketPayload & { marketContract: TargetMarketEnvelope } {
  if (!objectValue(value) || value.symbol !== "NVDA" || value.targetDate !== targetDate ||
    !marketEnvelopePayload(value.marketContract, targetDate) || !nonemptyString(value.session) ||
    !nonemptyString(value.source) || !dateTimeString(value.checkedAt) || typeof value.realtime !== "boolean" ||
    (value.displaySession !== undefined && !displaySessionPayload(value.displaySession)) ||
    (value.freshness !== undefined && !freshnessPayload(value.freshness))) return false;
  const contract = value.marketContract;
  for (const key of ["bars", "analysisBars"] as const) {
    if (value[key] !== undefined && (!Array.isArray(value[key]) || !value[key].every((bar) => marketBarPayload(bar, contract)))) return false;
  }
  if (value.daily !== undefined && (!Array.isArray(value.daily) || !value.daily.every((row) => dailyPayload(row, targetDate)))) return false;
  if (value.firstMinuteHistory !== undefined && (!Array.isArray(value.firstMinuteHistory) || !value.firstMinuteHistory.every((row) =>
    objectValue(row) && typeof row.date === "string" && DATE_KEY.test(row.date) && row.date < targetDate &&
    finite(row.range) && row.range >= 0 && finite(row.volume) && row.volume >= 0 && finite(row.close) && row.close >= 0))) return false;
  return true;
}

/** Recognizes the intentional fail-closed response for a cutoff that was never archived. */
export function isUnavailableDecisionFreezeResponse(
  value: unknown,
  targetDate: string,
): value is UnavailableDecisionFreezeResponse {
  if (!objectValue(value) || value.error !== "DECISION_FREEZE_ARCHIVE_UNAVAILABLE" || value.targetDate !== targetDate ||
    !marketEnvelopePayload(value.marketContract, targetDate)) return false;
  const contract = value.marketContract;
  const unavailableValues = [
    contract.quote,
    contract.previousSession.open, contract.previousSession.high, contract.previousSession.low,
    contract.previousSession.close, contract.previousSession.volume,
    contract.targetSession.premarket.high, contract.targetSession.premarket.low,
    contract.targetSession.premarket.current, contract.targetSession.premarket.volume,
    contract.targetSession.regular.open, contract.targetSession.regular.high,
    contract.targetSession.regular.low, contract.targetSession.regular.close,
    contract.targetSession.regular.volume,
    contract.targetSession.firstMinute.high, contract.targetSession.firstMinute.low,
    contract.targetSession.firstMinute.close, contract.targetSession.firstMinute.volume,
  ];
  return contract.view === "DECISION_FREEZE" &&
    contract.archive.status === "UNAVAILABLE" &&
    contract.archive.latestPersistedAt == null &&
    contract.archive.latestCompletedBarAt == null &&
    contract.effectiveAsOf === nasdaqSessionSchedule(targetDate).decisionFreezeAt &&
    unavailableValues.every((item) => item.value == null && item.availability === "MISSING" &&
      item.freshness === "FROZEN" && item.reasonCode === "DECISION_FREEZE_ARCHIVE_UNAVAILABLE" && item.provenance == null);
}

function ema(values: number[], period: number) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  }
  return output;
}

/** Builds a research-only opening range exclusively from one target-keyed payload. */
export function selectedSessionOpeningEstimate(payload: SelectedMarketPayload | null, contract: TargetMarketEnvelope | null) {
  if (!payload || !contract || contract.targetDate !== payload.targetDate) return null;
  const validPrice = (value: MarketValue<number>) => value.availability === "AVAILABLE" && value.provenance != null &&
    value.provenance.availableAt != null && value.provenance.availableAt <= contract.effectiveAsOf &&
    typeof value.value === "number" && Number.isFinite(value.value) ? value.value : null;
  const prior = contract.previousSession;
  const priorRow = prior.date < contract.targetDate &&
    validPrice(prior.high) != null && validPrice(prior.low) != null && validPrice(prior.close) != null
    ? { date: prior.date, open: validPrice(prior.open) ?? undefined, high: validPrice(prior.high)!, low: validPrice(prior.low)!, close: validPrice(prior.close)! }
    : null;
  const suppliedDaily = Array.isArray(payload.daily)
    ? payload.daily.filter((row) => {
        if (!row || typeof row !== "object") return false;
        const date = row.dateKey ?? row.date;
        return typeof date === "string" && date < contract.targetDate && [row.high, row.low, row.close].every(Number.isFinite);
      })
    : [];
  const daily = priorRow && !suppliedDaily.some((row) => (row.dateKey ?? row.date) === priorRow.date)
    ? [...suppliedDaily, priorRow]
    : suppliedDaily;
  if (!daily.length) return null;
  const recent = daily.slice(-10);
  const rangeHigh = Math.max(...recent.map((row) => row.high));
  const rangeLow = Math.min(...recent.map((row) => row.low));
  if (!Number.isFinite(rangeHigh) || !Number.isFinite(rangeLow) || rangeHigh < rangeLow) return null;
  const lastClose = recent.at(-1)!.close;
  const blockPivot = (rangeHigh + rangeLow + lastClose) / 3;
  const weights = recent.map((_, index) => index + 1);
  const weightedPivot = recent.reduce((sum, row, index) => sum + ((row.high + row.low + row.close) / 3) * weights[index], 0) /
    weights.reduce((sum, value) => sum + value, 0);
  const bars = (Array.isArray(payload.analysisBars) ? payload.analysisBars : Array.isArray(payload.bars) ? payload.bars : [])
    .filter((bar) => bar && typeof bar === "object" && bar.time >= contract.schedule.premarketOpenAt &&
      bar.time + 60_000 <= contract.effectiveAsOf && [bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite));
  const closes = bars.map((bar) => bar.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const current = validPrice(contract.targetSession.premarket.current);
  const quote = validPrice(contract.quote);
  const previousClose = validPrice(prior.close);
  const reference = current ?? quote ?? previousClose;
  const fast = ema9.at(-1) ?? reference;
  const slow = ema21.at(-1) ?? reference;
  return computeOpeningAnalysis({
    daily,
    targetDate: contract.targetDate,
    previousClose,
    referencePrice: reference,
    openingReferencePrice: current ?? previousClose,
    premarketHigh: validPrice(contract.targetSession.premarket.high),
    premarketLow: validPrice(contract.targetSession.premarket.low),
    premarketCurrent: current,
    rangeLow,
    lowerThird: rangeLow + (rangeHigh - rangeLow) / 3,
    upperThird: rangeLow + (2 * (rangeHigh - rangeLow)) / 3,
    rangeHigh,
    pivotLow: Math.min(blockPivot, weightedPivot),
    pivotHigh: Math.max(blockPivot, weightedPivot),
    ema9: fast,
    ema21: slow,
    ema9Slope: fast == null ? null : fast - (ema9.at(-4) ?? fast),
    historicalFirstMinuteRanges: Array.isArray(payload.firstMinuteHistory) ? payload.firstMinuteHistory.map((item) => item.range).filter(Number.isFinite) : [],
    historicalFirstMinuteVolumes: Array.isArray(payload.firstMinuteHistory) ? payload.firstMinuteHistory.map((item) => item.volume).filter(Number.isFinite) : [],
    firstMinuteClose: contract.targetSession.firstMinute.complete ? validPrice(contract.targetSession.firstMinute.close) : null,
    firstMinuteVolume: contract.targetSession.firstMinute.complete ? validPrice(contract.targetSession.firstMinute.volume) : null,
    firstMinuteComplete: contract.targetSession.firstMinute.complete,
    targetSessionEvidence: contract.targetSession.firstMinute.complete,
  }).opening;
}
