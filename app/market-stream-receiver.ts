import { requireMarketIngestionSchema } from "./d1-schema.ts";
import type { MarketCompletedMinuteBar, MarketQualifiedObservation, MarketSourceStateEvent } from "./market-store.ts";
import { newYorkDateKey } from "./market-session.ts";
import {
  MARKET_STREAM_SCHEMA,
  type AuthoritativeMinute,
  type IngestionAck,
  type IngestionBatch,
  type MarketBar,
  type MarketCoverage,
  type MarketStreamEmission,
  type ProviderMarketEvent,
  type SourceTimestamp,
} from "../services/market-stream/src/contracts.ts";

const MAX_BATCH_EMISSIONS = 100;
const MAX_PROVIDER_FUTURE_SKEW_MS = 30_000;
const STREAM_ID = /^[A-Za-z0-9_-]{8,128}$/;

type JsonObject = Record<string, unknown>;

export class MarketStreamIngestionError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.name = "MarketStreamIngestionError";
    this.code = code;
    this.status = status;
  }
}

function reject(code: string, status = 400): never {
  throw new MarketStreamIngestionError(code, status);
}

function objectValue(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function exactCoverage(value: unknown, feed: "iex" | "sip"): value is MarketCoverage {
  if (!objectValue(value) || value.provider !== "alpaca" || value.feed !== feed) return false;
  return feed === "iex"
    ? value.scope === "SINGLE_EXCHANGE" && value.researchOnly === true && value.executionEligible === false
    : value.scope === "CONSOLIDATED_SIP" && (
      (value.researchOnly === true && value.executionEligible === false) ||
      (value.researchOnly === false && value.executionEligible === true)
    );
}

function validSourceTimestamp(value: unknown): value is SourceTimestamp {
  if (!objectValue(value) || !nonempty(value.raw) || !safeInteger(value.epochMs) ||
    typeof value.epochNanos !== "string" || !/^\d+$/.test(value.epochNanos) ||
    !safeInteger(value.fractionalDigits) || value.fractionalDigits > 9) return false;
  const matched = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value.raw);
  if (!matched) return false;
  const wholeSecond = Date.parse(`${matched[1]}Z`);
  if (!Number.isSafeInteger(wholeSecond) || wholeSecond < 0) return false;
  const fraction = matched[2] ?? "";
  const nanos = fraction.padEnd(9, "0");
  return value.fractionalDigits === fraction.length &&
    value.epochMs === wholeSecond + Number(nanos.slice(0, 3) || "0") &&
    value.epochNanos === (BigInt(wholeSecond) * BigInt(1_000_000) + BigInt(nanos || "0")).toString();
}

function validBar(value: unknown, update?: boolean): value is MarketBar {
  if (!objectValue(value) || !nonempty(value.barKey) || !safeInteger(value.minuteStart) ||
    value.minuteStart % 60_000 !== 0 || value.minuteEnd !== value.minuteStart + 60_000 ||
    !safeInteger(value.openCents, 1) || !safeInteger(value.highCents, 1) ||
    !safeInteger(value.lowCents, 1) || !safeInteger(value.closeCents, 1) ||
    value.highCents < value.lowCents || value.openCents < value.lowCents || value.openCents > value.highCents ||
    value.closeCents < value.lowCents || value.closeCents > value.highCents ||
    !safeInteger(value.volume) || !safeInteger(value.tradeCount) ||
    !(value.vwapCents == null || safeInteger(value.vwapCents, 1)) || typeof value.update !== "boolean") return false;
  return update === undefined || value.update === update;
}

function validTrade(value: unknown) {
  return objectValue(value) && nonempty(value.providerTradeId) && safeInteger(value.priceCents, 1) &&
    safeInteger(value.size, 1) && nonempty(value.exchange) && typeof value.tape === "string" && stringArray(value.conditions);
}

function validQuote(value: unknown) {
  return objectValue(value) && safeInteger(value.bidCents, 1) && safeInteger(value.askCents, 1) &&
    value.askCents >= value.bidCents && safeInteger(value.bidSize) && safeInteger(value.askSize) &&
    nonempty(value.bidExchange) && nonempty(value.askExchange) && typeof value.tape === "string" && stringArray(value.conditions);
}

function validCorrection(value: unknown) {
  return objectValue(value) && nonempty(value.originalTradeId) && nonempty(value.correctedTradeId) &&
    value.originalTradeId !== value.correctedTradeId &&
    safeInteger(value.originalPriceCents, 1) && safeInteger(value.originalSize, 1) && stringArray(value.originalConditions) &&
    safeInteger(value.correctedPriceCents, 1) && safeInteger(value.correctedSize, 1) && stringArray(value.correctedConditions) &&
    nonempty(value.exchange) && typeof value.tape === "string";
}

function validCancel(value: unknown) {
  return objectValue(value) && nonempty(value.providerTradeId) && ["C", "E"].includes(String(value.action)) &&
    safeInteger(value.priceCents, 1) && safeInteger(value.size, 1) && nonempty(value.exchange) && typeof value.tape === "string";
}

function validProviderEvent(value: unknown, feed: "iex" | "sip"): value is ProviderMarketEvent {
  if (!objectValue(value) || value.schemaVersion !== MARKET_STREAM_SCHEMA || !nonempty(value.eventKey) ||
    !(value.providerEventId == null || nonempty(value.providerEventId)) ||
    !["TRADE", "QUOTE", "BAR", "BAR_UPDATE", "CORRECTION", "CANCEL"].includes(String(value.kind)) ||
    value.symbol !== "NVDA" || value.source !== "alpaca" || !["WEBSOCKET", "REST_RECOVERY"].includes(String(value.transport)) ||
    value.feed !== feed || !exactCoverage(value.coverage, feed) || !validSourceTimestamp(value.sourceTimestamp) ||
    !safeInteger(value.sourceObservedAt) || value.sourceObservedAt !== value.sourceTimestamp.epochMs ||
    !safeInteger(value.receivedAt) || !safeInteger(value.processedAt) || !safeInteger(value.availableAt) ||
    value.sourceObservedAt > value.receivedAt + MAX_PROVIDER_FUTURE_SKEW_MS || value.receivedAt > value.processedAt ||
    value.processedAt > value.availableAt || !(value.providerSequence == null || safeInteger(value.providerSequence))) return false;
  if (value.transport === "REST_RECOVERY" && value.coverage.executionEligible) return false;
  const payloads = [value.trade, value.quote, value.bar, value.correction, value.cancel].filter((item) => item != null);
  if (payloads.length !== 1) return false;
  if (value.kind === "TRADE") return validTrade(value.trade) && objectValue(value.trade) &&
    value.providerEventId === value.trade.providerTradeId;
  if (value.kind === "QUOTE") return validQuote(value.quote) && value.providerEventId === null;
  if (value.kind === "BAR") return validBar(value.bar, false) && value.providerEventId === null;
  if (value.kind === "BAR_UPDATE") return validBar(value.bar, true) && value.providerEventId === null;
  if (value.kind === "CORRECTION") return validCorrection(value.correction) && objectValue(value.correction) &&
    value.providerEventId === value.correction.correctedTradeId;
  return validCancel(value.cancel) && objectValue(value.cancel) && value.providerEventId === value.cancel.providerTradeId;
}

function validMinute(value: unknown, feed: "iex" | "sip"): value is AuthoritativeMinute {
  if (!validBar(value) || !objectValue(value) || !nonempty(value.sourceEventKey) || !safeInteger(value.revision, 1) ||
    !["PENDING", "FINAL", "CORRECTED"].includes(String(value.status)) ||
    !safeInteger(value.sourceObservedAt) || !safeInteger(value.receivedAt) || !safeInteger(value.processedAt) ||
    !safeInteger(value.availableAt) || value.sourceObservedAt > value.receivedAt + MAX_PROVIDER_FUTURE_SKEW_MS ||
    value.receivedAt > value.processedAt || value.processedAt > value.availableAt || value.availableAt < value.minuteEnd ||
    !(value.finalizedAt == null || safeInteger(value.finalizedAt)) ||
    !(value.correctedAt == null || safeInteger(value.correctedAt))) return false;
  if (!["WEBSOCKET", "REST_RECOVERY"].includes(String(value.sourceTransport))) return false;
  if (value.status === "PENDING" && (value.finalizedAt != null || value.correctedAt != null)) return false;
  if (value.status === "FINAL" && (value.receivedAt < value.minuteEnd || !safeInteger(value.finalizedAt) || value.finalizedAt < value.minuteEnd ||
    value.finalizedAt > value.processedAt || value.correctedAt != null)) return false;
  if (value.status === "CORRECTED" && (value.receivedAt < value.minuteEnd || !safeInteger(value.finalizedAt) || !safeInteger(value.correctedAt) ||
    value.finalizedAt < value.minuteEnd || value.correctedAt < value.minuteEnd ||
    value.finalizedAt > value.processedAt || value.correctedAt > value.processedAt)) return false;
  return exactCoverage({
    provider: "alpaca", feed, scope: feed === "sip" ? "CONSOLIDATED_SIP" : "SINGLE_EXCHANGE",
    researchOnly: feed === "iex", executionEligible: feed === "sip",
  }, feed);
}

function sameCoverage(left: MarketCoverage, right: MarketCoverage) {
  return left.provider === right.provider && left.feed === right.feed && left.scope === right.scope &&
    left.researchOnly === right.researchOnly && left.executionEligible === right.executionEligible;
}

function minuteMatchesEvent(minute: AuthoritativeMinute, event: ProviderMarketEvent) {
  const bar = event.bar;
  return bar != null && minute.sourceEventKey === event.eventKey && minute.barKey === bar.barKey &&
    minute.minuteStart === bar.minuteStart && minute.minuteEnd === bar.minuteEnd &&
    minute.openCents === bar.openCents && minute.highCents === bar.highCents &&
    minute.lowCents === bar.lowCents && minute.closeCents === bar.closeCents &&
    minute.volume === bar.volume && minute.tradeCount === bar.tradeCount &&
    minute.vwapCents === bar.vwapCents && minute.update === bar.update &&
    minute.sourceObservedAt === event.sourceObservedAt && minute.receivedAt === event.receivedAt &&
    minute.processedAt === event.processedAt && minute.availableAt === event.availableAt &&
    minute.sourceTransport === event.transport && minute.providerSequence === event.providerSequence;
}

function validEmission(value: unknown, streamId: string, expectedSequence: number, feed?: "iex" | "sip"): value is MarketStreamEmission {
  if (!objectValue(value) || value.schemaVersion !== MARKET_STREAM_SCHEMA || value.streamId !== streamId ||
    value.emissionId !== `${streamId}:${expectedSequence}` || value.symbol !== "NVDA" ||
    !["iex", "sip"].includes(String(value.feed)) || (feed != null && value.feed !== feed) ||
    !exactCoverage(value.coverage, value.feed as "iex" | "sip") || !safeInteger(value.connectionEpoch) ||
    value.serviceSequence !== expectedSequence || !safeInteger(value.processedAt) || !safeInteger(value.availableAt) ||
    value.processedAt > value.availableAt || !["EVENT", "MINUTE_COMPLETED", "MINUTE_CORRECTED", "CONNECTION"].includes(String(value.type)) ||
    !objectValue(value.delta)) return false;
  if (value.delta.providerState !== undefined && !["DISCONNECTED", "CONNECTING", "AUTHENTICATING", "SUBSCRIBING", "LIVE", "SILENT", "BACKOFF", "DEGRADED"].includes(String(value.delta.providerState))) return false;
  if (value.delta.lastProviderAt !== undefined && value.delta.lastProviderAt !== null && !safeInteger(value.delta.lastProviderAt)) return false;
  if (value.delta.lastAvailableAt !== undefined && value.delta.lastAvailableAt !== null && !safeInteger(value.delta.lastAvailableAt)) return false;
  if (value.sourceEvent != null && !validProviderEvent(value.sourceEvent, value.feed as "iex" | "sip")) return false;
  if (value.minute != null && !validMinute(value.minute, value.feed as "iex" | "sip")) return false;
  if (value.sourceEvent != null && (!sameCoverage(value.coverage as MarketCoverage, value.sourceEvent.coverage) ||
    value.sourceEvent.processedAt !== value.processedAt || value.sourceEvent.availableAt !== value.availableAt)) return false;
  if (value.minute != null && (value.minute.processedAt !== value.processedAt || value.minute.availableAt !== value.availableAt)) return false;
  if (value.type === "EVENT") {
    if (value.sourceEvent == null) return false;
    const barEvent = value.sourceEvent.kind === "BAR" || value.sourceEvent.kind === "BAR_UPDATE";
    if (barEvent !== (value.minute != null) || (value.minute != null &&
      (value.minute.status !== "PENDING" || !minuteMatchesEvent(value.minute, value.sourceEvent)))) return false;
  }
  if (value.type === "MINUTE_COMPLETED" && (value.sourceEvent != null || value.minute == null || value.minute.status !== "FINAL")) return false;
  if (value.type === "MINUTE_CORRECTED" && (value.sourceEvent == null || value.minute == null || value.minute.status !== "CORRECTED" ||
    !["BAR", "BAR_UPDATE"].includes(value.sourceEvent.kind) || !minuteMatchesEvent(value.minute, value.sourceEvent))) return false;
  if (value.type === "CONNECTION" && (value.sourceEvent != null || value.minute != null || typeof value.delta.providerState !== "string")) return false;
  return true;
}

export function parseIngestionBatch(value: unknown): IngestionBatch {
  if (!objectValue(value) || value.schemaVersion !== MARKET_STREAM_SCHEMA || !nonempty(value.streamId) ||
    !STREAM_ID.test(value.streamId) || !safeInteger(value.fromSequence, 1) || !safeInteger(value.toSequence, 1) ||
    value.toSequence < value.fromSequence || !Array.isArray(value.emissions) || !value.emissions.length ||
    value.emissions.length > MAX_BATCH_EMISSIONS || value.emissions.length !== value.toSequence - value.fromSequence + 1) {
    return reject("INGESTION_BATCH_INVALID");
  }
  let feed: "iex" | "sip" | undefined;
  let connectionEpoch = -1;
  for (let index = 0; index < value.emissions.length; index += 1) {
    const sequence = value.fromSequence + index;
    if (!validEmission(value.emissions[index], value.streamId, sequence, feed)) reject("INGESTION_EMISSION_INVALID");
    const emission = value.emissions[index] as MarketStreamEmission;
    feed ??= emission.feed;
    if (emission.connectionEpoch < connectionEpoch) reject("INGESTION_EMISSION_INVALID");
    connectionEpoch = emission.connectionEpoch;
  }
  return value as unknown as IngestionBatch;
}

function assertReceiverTimeBounds(batch: IngestionBatch, now: number) {
  const ceiling = now + MAX_PROVIDER_FUTURE_SKEW_MS;
  for (const emission of batch.emissions) {
    const values = [emission.processedAt, emission.availableAt, emission.delta.lastProviderAt, emission.delta.lastAvailableAt];
    if (emission.sourceEvent) {
      values.push(emission.sourceEvent.sourceObservedAt, emission.sourceEvent.receivedAt,
        emission.sourceEvent.processedAt, emission.sourceEvent.availableAt);
    }
    if (emission.minute) {
      values.push(emission.minute.sourceObservedAt, emission.minute.receivedAt, emission.minute.processedAt,
        emission.minute.availableAt, emission.minute.finalizedAt, emission.minute.correctedAt);
    }
    if (values.some((value) => value != null && value > ceiling)) reject("INGESTION_TIME_AHEAD_OF_RECEIVER");
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as JsonObject)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function coverageLabel(coverage: MarketCoverage) {
  return coverage.scope === "CONSOLIDATED_SIP" ? "CONSOLIDATED_SIP" : "SINGLE_EXCHANGE_IEX";
}

type ProviderState = NonNullable<MarketStreamEmission["delta"]["providerState"]>;

function sourceState(emission: MarketStreamEmission, now: number, effectiveProviderState: ProviderState | null): MarketSourceStateEvent {
  const liveConnectionConfirmed = effectiveProviderState === "LIVE";
  const providerConfirmed = liveConnectionConfirmed ||
    (emission.feed === "iex" && effectiveProviderState == null && emission.sourceEvent != null);
  const entitlementConfirmed = emission.feed === "iex"
    ? providerConfirmed
    : liveConnectionConfirmed;
  const state = effectiveProviderState === "DISCONNECTED"
    ? "UNAVAILABLE"
    : providerConfirmed ? "CURRENT" : "RECOVERING";
  const observedAt = emission.sourceEvent?.sourceObservedAt ?? emission.delta.lastProviderAt ?? null;
  return {
    id: `stream-source:${emission.streamId}:${emission.serviceSequence}`,
    provider: "alpaca",
    feed: emission.feed,
    symbol: "NVDA",
    state,
    entitlement: entitlementConfirmed ? "ENTITLED" : "UNKNOWN",
    coverage: coverageLabel(emission.coverage),
    observedAt,
    checkedAt: emission.processedAt,
    receivedAt: emission.sourceEvent?.receivedAt ?? emission.processedAt,
    processedAt: emission.processedAt,
    availableAt: emission.availableAt,
    connectionEpoch: `${emission.streamId}:${emission.connectionEpoch}`,
    serviceSequence: emission.serviceSequence,
    detailCode: effectiveProviderState ? `STREAM_${effectiveProviderState}` : `STREAM_${emission.type}`,
    createdAt: now,
  };
}

async function observation(
  emission: MarketStreamEmission,
  now: number,
  effectiveProviderState: ProviderState | null,
): Promise<MarketQualifiedObservation | null> {
  const event = emission.sourceEvent;
  if (!event || !["TRADE", "QUOTE", "CORRECTION"].includes(event.kind)) return null;
  const kind = event.kind === "QUOTE" ? "QUOTE" : "TRADE";
  const priceCents = event.kind === "QUOTE"
    ? Math.round((event.quote!.bidCents + event.quote!.askCents) / 2)
    : event.kind === "CORRECTION" ? event.correction!.correctedPriceCents : event.trade!.priceCents;
  const size = event.kind === "QUOTE"
    ? event.quote!.bidSize + event.quote!.askSize
    : event.kind === "CORRECTION" ? event.correction!.correctedSize : event.trade!.size;
  const core = {
    provider: "alpaca",
    feed: event.feed,
    symbol: "NVDA",
    sessionDate: newYorkDateKey(event.sourceObservedAt),
    kind,
    qualification: (effectiveProviderState === "LIVE" && event.transport === "WEBSOCKET" && event.coverage.executionEligible &&
      event.coverage.scope === "CONSOLIDATED_SIP" ? "STRICT_EXECUTION" : "RESEARCH") as MarketQualifiedObservation["qualification"],
    entitlement: "ENTITLED" as const,
    coverage: coverageLabel(event.coverage),
    price: priceCents / 100,
    size,
    providerEventId: event.providerEventId,
    providerTime: event.sourceObservedAt,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
    availableAt: event.availableAt,
    connectionEpoch: `${emission.streamId}:${emission.connectionEpoch}`,
    serviceSequence: emission.serviceSequence,
  };
  const payloadHash = await sha256(core);
  return { ...core, id: `stream-observation:${payloadHash}`, payloadHash, createdAt: now };
}

type MarketObservationInvalidation = {
  id: string;
  provider: "alpaca";
  feed: "iex" | "sip";
  symbol: "NVDA";
  providerTradeId: string;
  kind: "CORRECTION" | "CANCEL";
  replacementProviderTradeId: string | null;
  providerTime: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  connectionEpoch: string;
  serviceSequence: number;
  payloadHash: string;
  createdAt: number;
};

async function invalidation(emission: MarketStreamEmission, now: number): Promise<MarketObservationInvalidation | null> {
  const event = emission.sourceEvent;
  if (!event || (event.kind !== "CORRECTION" && event.kind !== "CANCEL")) return null;
  const core = {
    provider: "alpaca" as const,
    feed: event.feed,
    symbol: "NVDA" as const,
    providerTradeId: event.kind === "CORRECTION" ? event.correction!.originalTradeId : event.cancel!.providerTradeId,
    kind: event.kind,
    replacementProviderTradeId: event.kind === "CORRECTION" ? event.correction!.correctedTradeId : null,
    providerTime: event.sourceObservedAt,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
    availableAt: event.availableAt,
    connectionEpoch: `${emission.streamId}:${emission.connectionEpoch}`,
    serviceSequence: emission.serviceSequence,
  };
  const payloadHash = await sha256(core);
  return { ...core, id: `stream-invalidation:${payloadHash}`, payloadHash, createdAt: now };
}

async function completedMinute(emission: MarketStreamEmission, now: number): Promise<Omit<MarketCompletedMinuteBar, "id" | "revision"> | null> {
  const minute = emission.minute;
  if (!minute || !["MINUTE_COMPLETED", "MINUTE_CORRECTED"].includes(emission.type)) return null;
  const core = {
    provider: "alpaca",
    feed: emission.feed,
    symbol: "NVDA",
    sessionDate: newYorkDateKey(minute.minuteStart),
    minuteStart: minute.minuteStart,
    minuteEnd: minute.minuteEnd,
    open: minute.openCents / 100,
    high: minute.highCents / 100,
    low: minute.lowCents / 100,
    close: minute.closeCents / 100,
    volume: minute.volume,
    tradeCount: minute.tradeCount,
    providerTime: minute.sourceObservedAt,
    receivedAt: minute.receivedAt,
    processedAt: minute.processedAt,
    availableAt: minute.availableAt,
    connectionEpoch: `${emission.streamId}:${emission.connectionEpoch}`,
    serviceSequence: emission.serviceSequence,
    recovered: minute.sourceTransport === "REST_RECOVERY",
  };
  return { ...core, payloadHash: await sha256(core), createdAt: now };
}

async function cursor(database: D1Database, streamId: string) {
  const row = await database.prepare("SELECT highest_contiguous_sequence AS value FROM market_stream_ingest_cursors WHERE stream_id=?")
    .bind(streamId).first<{ value: number }>();
  return row?.value ?? 0;
}

type StreamBinding = {
  streamId: string;
  provider: "alpaca";
  feed: "iex" | "sip";
  symbol: "NVDA";
  coverageScope: "SINGLE_EXCHANGE" | "CONSOLIDATED_SIP";
  researchOnlyRequired: number;
  executionEligibleAllowed: number;
};

type PersistedStreamBinding = {
  stream_id: string;
  provider: string;
  feed: string;
  symbol: string;
  coverage_scope: string;
  research_only_required: number;
  execution_eligible_allowed: number;
};

function streamBinding(emission: MarketStreamEmission): StreamBinding {
  return {
    streamId: emission.streamId,
    provider: "alpaca",
    feed: emission.feed,
    symbol: "NVDA",
    coverageScope: emission.feed === "sip" ? "CONSOLIDATED_SIP" : "SINGLE_EXCHANGE",
    researchOnlyRequired: emission.feed === "iex" ? 1 : 0,
    executionEligibleAllowed: emission.feed === "sip" ? 1 : 0,
  };
}

function bindingMatches(row: PersistedStreamBinding | null, binding: StreamBinding) {
  return row != null && row.stream_id === binding.streamId && row.provider === binding.provider &&
    row.feed === binding.feed && row.symbol === binding.symbol && row.coverage_scope === binding.coverageScope &&
    row.research_only_required === binding.researchOnlyRequired &&
    row.execution_eligible_allowed === binding.executionEligibleAllowed;
}

async function registeredStream(database: D1Database, streamId: string) {
  return database.prepare(`SELECT stream_id,provider,feed,symbol,coverage_scope,research_only_required,execution_eligible_allowed
    FROM market_stream_ingest_streams WHERE stream_id=?`).bind(streamId).first<PersistedStreamBinding>();
}

async function firstLedgerBinding(database: D1Database, streamId: string) {
  const row = await database.prepare(`SELECT service_sequence,payload_json FROM market_stream_ingest_emissions
    WHERE stream_id=? ORDER BY service_sequence ASC LIMIT 1`).bind(streamId)
    .first<{ service_sequence: number; payload_json: string }>();
  if (!row) return null;
  let value: unknown;
  try { value = JSON.parse(row.payload_json); } catch { reject("INGESTION_LEDGER_CONFLICT", 409); }
  if (!validEmission(value, streamId, row.service_sequence)) reject("INGESTION_LEDGER_CONFLICT", 409);
  return streamBinding(value);
}

type ProviderStateEvidence = { state: ProviderState; connectionEpoch: number };

async function latestProviderState(
  database: D1Database,
  streamId: string,
  throughSequence: number,
): Promise<ProviderStateEvidence | null> {
  if (throughSequence === 0) return null;
  const row = await database.prepare(`SELECT service_sequence,payload_json FROM market_stream_ingest_emissions
    WHERE stream_id=? AND service_sequence<=? AND json_type(payload_json,'$.delta.providerState')='text'
    ORDER BY service_sequence DESC LIMIT 1`).bind(streamId, throughSequence)
    .first<{ service_sequence: number; payload_json: string }>();
  if (!row) return null;
  let value: unknown;
  try { value = JSON.parse(row.payload_json); } catch { reject("INGESTION_LEDGER_CONFLICT", 409); }
  if (!validEmission(value, streamId, row.service_sequence)) reject("INGESTION_LEDGER_CONFLICT", 409);
  return value.delta.providerState == null
    ? null
    : { state: value.delta.providerState, connectionEpoch: value.connectionEpoch };
}

function sameMinuteIdentity(left: AuthoritativeMinute, right: AuthoritativeMinute) {
  return left.barKey === right.barKey && left.minuteStart === right.minuteStart && left.minuteEnd === right.minuteEnd;
}

function sameFinalizedBarLineage(left: AuthoritativeMinute, right: AuthoritativeMinute) {
  return sameMinuteIdentity(left, right) && left.openCents === right.openCents && left.highCents === right.highCents &&
    left.lowCents === right.lowCents && left.closeCents === right.closeCents && left.volume === right.volume &&
    left.tradeCount === right.tradeCount && left.vwapCents === right.vwapCents && left.update === right.update &&
    left.sourceEventKey === right.sourceEventKey && left.sourceTransport === right.sourceTransport &&
    left.providerSequence === right.providerSequence && left.sourceObservedAt === right.sourceObservedAt &&
    left.receivedAt === right.receivedAt;
}

async function validateMinuteLineage(database: D1Database, streamId: string, throughSequence: number,
  emissions: MarketStreamEmission[]) {
  const minutes = emissions.flatMap((emission) => emission.minute ? [emission.minute] : []);
  if (!minutes.length) return;
  const barKeys = [...new Set(minutes.map((minute) => minute.barKey))];
  const latest = new Map<string, AuthoritativeMinute>();
  if (throughSequence > 0) {
    const placeholders = barKeys.map(() => "?").join(",");
    const result = await database.prepare(`SELECT service_sequence,payload_json FROM market_stream_ingest_emissions
      WHERE stream_id=? AND service_sequence<=? AND json_extract(payload_json,'$.minute.barKey') IN (${placeholders})
      ORDER BY service_sequence`).bind(streamId, throughSequence, ...barKeys)
      .all<{ service_sequence: number; payload_json: string }>();
    for (const row of result.results ?? []) {
      let value: unknown;
      try { value = JSON.parse(row.payload_json); } catch { reject("INGESTION_LEDGER_CONFLICT", 409); }
      if (!validEmission(value, streamId, row.service_sequence) || !value.minute) reject("INGESTION_LEDGER_CONFLICT", 409);
      latest.set(value.minute.barKey, value.minute);
    }
  }
  for (const emission of emissions) {
    const minute = emission.minute;
    if (!minute) continue;
    const previous = latest.get(minute.barKey) ?? null;
    const revisionIsNext = previous == null ? minute.revision === 1 : minute.revision === previous.revision + 1;
    let valid = revisionIsNext;
    if (minute.status === "PENDING") {
      valid = valid && (previous == null || (previous.status === "PENDING" && sameMinuteIdentity(previous, minute)));
    } else if (minute.status === "FINAL") {
      valid = valid && previous != null && previous.status === "PENDING" && sameFinalizedBarLineage(previous, minute) &&
        minute.processedAt >= previous.processedAt && minute.availableAt >= previous.availableAt;
    } else {
      valid = valid && previous != null && ["FINAL", "CORRECTED"].includes(previous.status) &&
        sameMinuteIdentity(previous, minute) && minute.processedAt >= previous.processedAt &&
        minute.availableAt >= previous.availableAt;
    }
    if (!valid) reject("INGESTION_MINUTE_LINEAGE_INVALID", 409);
    latest.set(minute.barKey, minute);
  }
}

const publicationGuardSql = `EXISTS (SELECT 1 FROM market_stream_ingest_streams
  WHERE stream_id=? AND provider=? AND feed=? AND symbol=? AND coverage_scope=?
    AND research_only_required=? AND execution_eligible_allowed=?)
  AND COALESCE((SELECT highest_contiguous_sequence FROM market_stream_ingest_cursors WHERE stream_id=?),0)=?`;

function guardValues(binding: StreamBinding, expectedCursor: number) {
  return [binding.streamId, binding.provider, binding.feed, binding.symbol, binding.coverageScope,
    binding.researchOnlyRequired, binding.executionEligibleAllowed, binding.streamId, expectedCursor];
}

function sourceStateStatement(database: D1Database, rows: MarketSourceStateEvent[], binding: StreamBinding, expectedCursor: number) {
  return database.prepare(`INSERT INTO market_source_state_events (
    id,provider,feed,symbol,state,entitlement,coverage,observed_at,checked_at,
    received_at,processed_at,available_at,connection_epoch,service_sequence,detail_code,created_at
  ) SELECT json_extract(value,'$.id'),json_extract(value,'$.provider'),json_extract(value,'$.feed'),
    json_extract(value,'$.symbol'),json_extract(value,'$.state'),json_extract(value,'$.entitlement'),
    json_extract(value,'$.coverage'),json_extract(value,'$.observedAt'),json_extract(value,'$.checkedAt'),
    json_extract(value,'$.receivedAt'),json_extract(value,'$.processedAt'),json_extract(value,'$.availableAt'),
    json_extract(value,'$.connectionEpoch'),json_extract(value,'$.serviceSequence'),json_extract(value,'$.detailCode'),
    json_extract(value,'$.createdAt') FROM json_each(?) WHERE ${publicationGuardSql} ON CONFLICT(id) DO NOTHING`)
    .bind(JSON.stringify(rows), ...guardValues(binding, expectedCursor));
}

function observationStatement(database: D1Database, rows: MarketQualifiedObservation[], binding: StreamBinding, expectedCursor: number) {
  return database.prepare(`INSERT INTO market_qualified_observations (
    id,provider,feed,symbol,session_date,kind,qualification,entitlement,coverage,price,size,
    provider_event_id,provider_time,received_at,processed_at,available_at,connection_epoch,
    service_sequence,payload_hash,created_at
  ) SELECT json_extract(value,'$.id'),json_extract(value,'$.provider'),json_extract(value,'$.feed'),
    json_extract(value,'$.symbol'),json_extract(value,'$.sessionDate'),json_extract(value,'$.kind'),
    json_extract(value,'$.qualification'),json_extract(value,'$.entitlement'),json_extract(value,'$.coverage'),
    json_extract(value,'$.price'),json_extract(value,'$.size'),json_extract(value,'$.providerEventId'),
    json_extract(value,'$.providerTime'),json_extract(value,'$.receivedAt'),json_extract(value,'$.processedAt'),
    json_extract(value,'$.availableAt'),json_extract(value,'$.connectionEpoch'),json_extract(value,'$.serviceSequence'),
    json_extract(value,'$.payloadHash'),json_extract(value,'$.createdAt')
  FROM json_each(?) WHERE ${publicationGuardSql} ON CONFLICT(id) DO NOTHING`)
    .bind(JSON.stringify(rows), ...guardValues(binding, expectedCursor));
}

function invalidationStatement(database: D1Database, rows: MarketObservationInvalidation[], binding: StreamBinding,
  expectedCursor: number) {
  return database.prepare(`INSERT INTO market_observation_invalidations (
    id,provider,feed,symbol,provider_trade_id,kind,replacement_provider_trade_id,provider_time,
    received_at,processed_at,available_at,connection_epoch,service_sequence,payload_hash,created_at
  ) SELECT json_extract(value,'$.id'),json_extract(value,'$.provider'),json_extract(value,'$.feed'),
    json_extract(value,'$.symbol'),json_extract(value,'$.providerTradeId'),json_extract(value,'$.kind'),
    json_extract(value,'$.replacementProviderTradeId'),json_extract(value,'$.providerTime'),
    json_extract(value,'$.receivedAt'),json_extract(value,'$.processedAt'),json_extract(value,'$.availableAt'),
    json_extract(value,'$.connectionEpoch'),json_extract(value,'$.serviceSequence'),json_extract(value,'$.payloadHash'),
    json_extract(value,'$.createdAt') FROM json_each(?) WHERE ${publicationGuardSql} ON CONFLICT(id) DO NOTHING`)
    .bind(JSON.stringify(rows), ...guardValues(binding, expectedCursor));
}

function minuteStatement(database: D1Database, rows: Array<Omit<MarketCompletedMinuteBar, "id" | "revision">>,
  binding: StreamBinding, expectedCursor: number) {
  const values = rows.map((row) => ({ ...row, id: `minute:${row.payloadHash}`, recovered: row.recovered ? 1 : 0 }));
  return database.prepare(`WITH raw AS (
    SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.provider') AS provider,
      json_extract(value,'$.feed') AS feed,json_extract(value,'$.symbol') AS symbol,
      json_extract(value,'$.sessionDate') AS session_date,json_extract(value,'$.minuteStart') AS minute_start,
      json_extract(value,'$.minuteEnd') AS minute_end,json_extract(value,'$.open') AS open,
      json_extract(value,'$.high') AS high,json_extract(value,'$.low') AS low,json_extract(value,'$.close') AS close,
      json_extract(value,'$.volume') AS volume,json_extract(value,'$.tradeCount') AS trade_count,
      json_extract(value,'$.providerTime') AS provider_time,json_extract(value,'$.receivedAt') AS received_at,
      json_extract(value,'$.processedAt') AS processed_at,json_extract(value,'$.availableAt') AS available_at,
      json_extract(value,'$.connectionEpoch') AS connection_epoch,json_extract(value,'$.serviceSequence') AS service_sequence,
      json_extract(value,'$.recovered') AS recovered,json_extract(value,'$.payloadHash') AS payload_hash,
      json_extract(value,'$.createdAt') AS created_at FROM json_each(?)
  ), deduped AS (
    SELECT * FROM (SELECT raw.*,ROW_NUMBER() OVER (PARTITION BY payload_hash ORDER BY service_sequence) AS duplicate_rank FROM raw)
    WHERE duplicate_rank=1
  ), novel AS (
    SELECT deduped.*,ROW_NUMBER() OVER (
      PARTITION BY provider,feed,symbol,session_date,minute_start ORDER BY available_at,service_sequence,payload_hash
    )-1 AS batch_revision FROM deduped WHERE NOT EXISTS (
      SELECT 1 FROM market_completed_minute_bars existing WHERE existing.provider=deduped.provider AND
        existing.feed=deduped.feed AND existing.symbol=deduped.symbol AND existing.session_date=deduped.session_date AND
        existing.minute_start=deduped.minute_start AND existing.payload_hash=deduped.payload_hash
    )
  ), ranked AS (
    SELECT novel.*,COALESCE((SELECT MAX(revision)+1 FROM market_completed_minute_bars existing
      WHERE existing.provider=novel.provider AND existing.feed=novel.feed AND existing.symbol=novel.symbol AND
        existing.session_date=novel.session_date AND existing.minute_start=novel.minute_start),0)+batch_revision AS revision
    FROM novel
  ) INSERT INTO market_completed_minute_bars (
    id,provider,feed,symbol,session_date,minute_start,minute_end,open,high,low,close,volume,
    trade_count,provider_time,received_at,processed_at,available_at,connection_epoch,
    service_sequence,revision,recovered,payload_hash,created_at
  ) SELECT id,provider,feed,symbol,session_date,minute_start,minute_end,open,high,low,close,volume,
    trade_count,provider_time,received_at,processed_at,available_at,connection_epoch,
    service_sequence,revision,recovered,payload_hash,created_at FROM ranked
  WHERE ${publicationGuardSql} ON CONFLICT(id) DO NOTHING`)
    .bind(JSON.stringify(values), ...guardValues(binding, expectedCursor));
}

function ledgerStatement(database: D1Database, emissions: MarketStreamEmission[], hashes: string[], now: number,
  binding: StreamBinding, expectedCursor: number) {
  const values = emissions.map((emission, index) => ({
    streamId: emission.streamId, serviceSequence: emission.serviceSequence, emissionId: emission.emissionId,
    connectionEpoch: emission.connectionEpoch, availableAt: emission.availableAt, payloadHash: hashes[index],
    payloadJson: JSON.stringify(emission), createdAt: now,
  }));
  return database.prepare(`INSERT INTO market_stream_ingest_emissions (
    stream_id,service_sequence,emission_id,connection_epoch,available_at,payload_hash,payload_json,created_at
  ) SELECT json_extract(value,'$.streamId'),json_extract(value,'$.serviceSequence'),json_extract(value,'$.emissionId'),
    json_extract(value,'$.connectionEpoch'),json_extract(value,'$.availableAt'),json_extract(value,'$.payloadHash'),
    json_extract(value,'$.payloadJson'),json_extract(value,'$.createdAt') FROM json_each(?) WHERE ${publicationGuardSql}
  ON CONFLICT(stream_id,service_sequence) DO NOTHING`)
    .bind(JSON.stringify(values), ...guardValues(binding, expectedCursor));
}

async function ledgerHashes(database: D1Database, emissions: MarketStreamEmission[]) {
  const first = emissions[0];
  const last = emissions.at(-1)!;
  const result = await database.prepare(`SELECT service_sequence,payload_hash FROM market_stream_ingest_emissions
    WHERE stream_id=? AND service_sequence BETWEEN ? AND ?`).bind(first.streamId,first.serviceSequence,last.serviceSequence)
    .all<{ service_sequence: number; payload_hash: string }>();
  return new Map((result.results ?? []).map((row) => [row.service_sequence, row.payload_hash]));
}

async function verifyLedger(database: D1Database, emissions: MarketStreamEmission[], hashes: string[]) {
  const persisted = await ledgerHashes(database, emissions);
  for (let index = 0; index < emissions.length; index += 1) {
    if (persisted.get(emissions[index].serviceSequence) !== hashes[index]) reject("INGESTION_LEDGER_CONFLICT", 409);
  }
}

async function rejectLedgerConflictsBeforeWrites(database: D1Database, emissions: MarketStreamEmission[], hashes: string[]) {
  const persisted = await ledgerHashes(database, emissions);
  for (let index = 0; index < emissions.length; index += 1) {
    const hash = persisted.get(emissions[index].serviceSequence);
    if (hash && hash !== hashes[index]) reject("INGESTION_LEDGER_CONFLICT", 409);
  }
}

/** Persist an authenticated batch and advance only an immutable contiguous prefix. */
export async function ingestMarketStreamBatch(database: D1Database, batchValue: unknown, now = Date.now()): Promise<IngestionAck> {
  const batch = parseIngestionBatch(batchValue);
  if (!safeInteger(now)) reject("INGESTION_CLOCK_INVALID", 500);
  assertReceiverTimeBounds(batch, now);
  await requireMarketIngestionSchema(database);
  const initialCursor = await cursor(database, batch.streamId);
  if (batch.fromSequence > initialCursor + 1) reject("INGESTION_SEQUENCE_GAP", 409);

  const incomingBinding = streamBinding(batch.emissions[0]);
  const registration = await registeredStream(database, batch.streamId);
  const legacyBinding = registration ? null : await firstLedgerBinding(database, batch.streamId);
  if ((registration && !bindingMatches(registration, incomingBinding)) ||
    (legacyBinding && JSON.stringify(legacyBinding) !== JSON.stringify(incomingBinding))) {
    reject("INGESTION_STREAM_BINDING_CONFLICT", 409);
  }
  const binding = legacyBinding ?? incomingBinding;

  const hashes = await Promise.all(batch.emissions.map(sha256));
  await rejectLedgerConflictsBeforeWrites(database, batch.emissions, hashes);
  const newEmissions = batch.emissions.filter((emission) => emission.serviceSequence > initialCursor);
  if (newEmissions.length && newEmissions[0].serviceSequence !== initialCursor + 1) reject("INGESTION_SEQUENCE_GAP", 409);
  if (newEmissions.length && initialCursor > 0) {
    const previous = await database.prepare(`SELECT connection_epoch AS value FROM market_stream_ingest_emissions
      WHERE stream_id=? AND service_sequence=?`).bind(batch.streamId, initialCursor).first<{ value: number }>();
    if (!previous || newEmissions[0].connectionEpoch < previous.value) reject("INGESTION_EPOCH_REGRESSION", 409);
  }
  await validateMinuteLineage(database, batch.streamId, initialCursor, newEmissions);

  const sourceRows: MarketSourceStateEvent[] = [];
  const observationRows: MarketQualifiedObservation[] = [];
  const invalidationRows: MarketObservationInvalidation[] = [];
  const minuteRows: Array<Omit<MarketCompletedMinuteBar, "id" | "revision">> = [];
  let providerStateEvidence = await latestProviderState(database, batch.streamId, initialCursor);
  for (const emission of newEmissions) {
    // Observation qualification uses only state proven before this emission.
    // An event cannot authorize itself as LIVE, and a prior epoch's LIVE state
    // cannot cross the connection-epoch boundary.
    const providerStateBeforeEmission = providerStateEvidence?.connectionEpoch === emission.connectionEpoch
      ? providerStateEvidence.state
      : null;
    const admitted = await observation(emission, now, providerStateBeforeEmission);
    if (admitted) observationRows.push(admitted);
    if (emission.delta.providerState) {
      providerStateEvidence = { state: emission.delta.providerState, connectionEpoch: emission.connectionEpoch };
    }
    const effectiveProviderState = providerStateEvidence?.connectionEpoch === emission.connectionEpoch
      ? providerStateEvidence.state
      : null;
    sourceRows.push(sourceState(emission, now, effectiveProviderState));
    const reconciled = await invalidation(emission, now);
    if (reconciled) invalidationRows.push(reconciled);
    const minute = await completedMinute(emission, now);
    if (minute) minuteRows.push(minute);
  }

  const target = Math.max(initialCursor, batch.toSequence);
  const statements = [database.prepare(`INSERT INTO market_stream_ingest_streams (
    stream_id,provider,feed,symbol,coverage_scope,research_only_required,execution_eligible_allowed,created_at
  ) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(stream_id) DO NOTHING`).bind(binding.streamId,binding.provider,binding.feed,binding.symbol,
    binding.coverageScope,binding.researchOnlyRequired,binding.executionEligibleAllowed,now)];
  if (sourceRows.length) statements.push(sourceStateStatement(database, sourceRows, binding, initialCursor));
  if (observationRows.length) statements.push(observationStatement(database, observationRows, binding, initialCursor));
  if (invalidationRows.length) statements.push(invalidationStatement(database, invalidationRows, binding, initialCursor));
  if (minuteRows.length) statements.push(minuteStatement(database, minuteRows, binding, initialCursor));
  statements.push(ledgerStatement(database, batch.emissions, hashes, now, binding, initialCursor));
  statements.push(database.prepare(`INSERT INTO market_stream_ingest_cursors (stream_id,highest_contiguous_sequence,updated_at)
    SELECT ?,?,? WHERE ${publicationGuardSql}
      AND (SELECT COUNT(*) FROM market_stream_ingest_emissions WHERE stream_id=? AND service_sequence BETWEEN 1 AND ?)=?
    ON CONFLICT(stream_id) DO UPDATE SET highest_contiguous_sequence=excluded.highest_contiguous_sequence,updated_at=excluded.updated_at
    WHERE market_stream_ingest_cursors.highest_contiguous_sequence=?`)
    .bind(batch.streamId,target,now,...guardValues(binding, initialCursor),batch.streamId,target,target,initialCursor));
  await database.batch(statements);

  if (!bindingMatches(await registeredStream(database, batch.streamId), binding)) reject("INGESTION_STREAM_BINDING_CONFLICT", 409);
  await verifyLedger(database, batch.emissions, hashes);
  const finalCursor = await cursor(database, batch.streamId);
  if (finalCursor < batch.toSequence) reject("INGESTION_CURSOR_CONFLICT", 409);
  return { ok: true, streamId: batch.streamId, highestContiguousSequence: batch.toSequence };
}
