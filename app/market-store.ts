import { ensureMarketPersistenceSchemaOnce } from "./d1-schema.ts";
import type { MarketProvenance, MarketValue, TargetMarketEnvelope } from "./market-contract.ts";
import { newYorkDateKey } from "./market-session.ts";

export type MarketEntitlement = "ENTITLED" | "NOT_ENTITLED" | "UNKNOWN";
export type MarketSourceState = "CURRENT" | "STALE" | "MARKET_CLOSED" | "RECOVERING" | "UNAVAILABLE" | "ERROR";

type Provenance = {
  provider: string;
  feed: string;
  symbol: string;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  createdAt: number;
};

export type MarketSourceStateEvent = Provenance & {
  id: string;
  state: MarketSourceState;
  entitlement: MarketEntitlement;
  coverage: string;
  observedAt: number | null;
  checkedAt: number;
  connectionEpoch: string | null;
  serviceSequence: number | null;
  detailCode: string | null;
};

export type MarketQualifiedObservation = Provenance & {
  id: string;
  sessionDate: string;
  kind: "TRADE" | "QUOTE" | "OPENING_CROSS" | "INDICATIVE";
  qualification: "RESEARCH" | "STRICT_EXECUTION";
  entitlement: MarketEntitlement;
  coverage: string;
  price: number;
  size: number | null;
  providerEventId: string | null;
  providerTime: number;
  connectionEpoch: string;
  serviceSequence: number;
  payloadHash: string;
};

export type MarketCompletedMinuteBar = Provenance & {
  id: string;
  sessionDate: string;
  minuteStart: number;
  minuteEnd: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number | null;
  providerTime: number;
  connectionEpoch: string;
  serviceSequence: number;
  revision: number;
  recovered: boolean;
  payloadHash: string;
};

export type MarketSessionSnapshot = Provenance & {
  id: string;
  targetDate: string;
  checkpoint: string;
  capturedAt: number;
  sourceWatermarkAt: number;
  qualityState: string;
  payload: unknown;
  payloadHash: string;
};

export type MarketAppendBatch = {
  sourceStates?: MarketSourceStateEvent[];
  observations?: MarketQualifiedObservation[];
  completedMinuteBars?: MarketCompletedMinuteBar[];
  sessionSnapshots?: MarketSessionSnapshot[];
};

export type MarketAppendCounts = {
  sourceStates: number;
  observations: number;
  completedMinuteBars: number;
  sessionSnapshots: number;
};

export class MarketSchemaUnavailableError extends Error {
  readonly code = "MARKET_PERSISTENCE_SCHEMA_UNAVAILABLE";
  constructor(cause?: unknown) {
    super("Market persistence schema is unavailable on this read path", { cause });
    this.name = "MarketSchemaUnavailableError";
  }
}

export class MarketSnapshotConflictError extends Error {
  readonly code = "MARKET_SNAPSHOT_WATERMARK_CONFLICT";
  readonly targetDate: string;
  readonly checkpoint: string;
  readonly sourceWatermarkAt: number;
  constructor(targetDate: string, checkpoint: string, sourceWatermarkAt: number) {
    super(`A different session snapshot already exists for ${targetDate}/${checkpoint}/${sourceWatermarkAt}`);
    this.name = "MarketSnapshotConflictError";
    this.targetDate = targetDate;
    this.checkpoint = checkpoint;
    this.sourceWatermarkAt = sourceWatermarkAt;
  }
}

export type AnalysisMinuteBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ScheduledMarketCheckpointInput = {
  envelope: TargetMarketEnvelope;
  analysisBars: AnalysisMinuteBar[];
  checkpoint: string;
  capturedAt: number;
};

const MAX_PROVIDER_FUTURE_SKEW_MS = 30_000;
const MAX_NONCE_TTL_MS = 24 * 60 * 60_000;
const MAX_BAR_QUERY_LIMIT = 2_000;
const MAX_OBSERVATION_QUERY_LIMIT = 500;
const identifierPattern = /^[A-Za-z0-9._:@/+\-=]{1,256}$/;
const sessionPattern = /^\d{4}-\d{2}-\d{2}$/;
const sourceStates = new Set<MarketSourceState>(["CURRENT", "STALE", "MARKET_CLOSED", "RECOVERING", "UNAVAILABLE", "ERROR"]);
const entitlements = new Set<MarketEntitlement>(["ENTITLED", "NOT_ENTITLED", "UNKNOWN"]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function identifier(value: string, label: string) {
  invariant(typeof value === "string" && identifierPattern.test(value), `${label} is invalid`);
}

function sessionDate(value: string, label = "sessionDate") {
  invariant(typeof value === "string" && sessionPattern.test(value), `${label} must use YYYY-MM-DD`);
}

function finite(value: number, label: string) {
  invariant(typeof value === "number" && Number.isFinite(value), `${label} must be finite`);
}

function timestamp(value: number, label: string) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative integer timestamp`);
}

function sequence(value: number, label: string) {
  invariant(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative integer`);
}

function provenance(value: Provenance) {
  identifier(value.provider, "provider");
  identifier(value.feed, "feed");
  identifier(value.symbol, "symbol");
  timestamp(value.receivedAt, "receivedAt");
  timestamp(value.processedAt, "processedAt");
  timestamp(value.availableAt, "availableAt");
  timestamp(value.createdAt, "createdAt");
  invariant(value.receivedAt <= value.processedAt, "processedAt cannot precede receivedAt");
  invariant(value.processedAt <= value.availableAt, "availableAt cannot precede processedAt");
}

function providerTime(value: number, receivedAt: number, label: string) {
  timestamp(value, label);
  invariant(value <= receivedAt + MAX_PROVIDER_FUTURE_SKEW_MS, `${label} is too far ahead of receivedAt`);
}

function validateSourceState(value: MarketSourceStateEvent) {
  provenance(value);
  identifier(value.id, "source state id");
  invariant(sourceStates.has(value.state), "source state is invalid");
  invariant(entitlements.has(value.entitlement), "source entitlement is invalid");
  identifier(value.coverage, "coverage");
  timestamp(value.checkedAt, "checkedAt");
  invariant(value.checkedAt <= value.availableAt, "checkedAt cannot follow availableAt");
  if (value.observedAt != null) providerTime(value.observedAt, value.receivedAt, "observedAt");
  if (value.connectionEpoch != null) identifier(value.connectionEpoch, "connectionEpoch");
  if (value.serviceSequence != null) sequence(value.serviceSequence, "serviceSequence");
  if (value.detailCode != null) identifier(value.detailCode, "detailCode");
}

function validateObservation(value: MarketQualifiedObservation) {
  provenance(value);
  identifier(value.id, "observation id");
  sessionDate(value.sessionDate);
  invariant(["TRADE", "QUOTE", "OPENING_CROSS", "INDICATIVE"].includes(value.kind), "observation kind is invalid");
  invariant(["RESEARCH", "STRICT_EXECUTION"].includes(value.qualification), "observation qualification is invalid");
  invariant(entitlements.has(value.entitlement), "observation entitlement is invalid");
  identifier(value.coverage, "coverage");
  finite(value.price, "price");
  invariant(value.price > 0, "price must be positive");
  if (value.size != null) {
    finite(value.size, "size");
    invariant(value.size >= 0, "size cannot be negative");
  }
  if (value.providerEventId != null) identifier(value.providerEventId, "providerEventId");
  providerTime(value.providerTime, value.receivedAt, "providerTime");
  identifier(value.connectionEpoch, "connectionEpoch");
  sequence(value.serviceSequence, "serviceSequence");
  identifier(value.payloadHash, "payloadHash");
  if (value.qualification === "STRICT_EXECUTION") {
    invariant(value.entitlement === "ENTITLED", "strict observations require an entitled source");
    const validCoverage = value.kind === "OPENING_CROSS"
      ? value.coverage === "NASDAQ_OFFICIAL_CROSS"
      : value.coverage === "CONSOLIDATED_SIP";
    invariant(validCoverage, "strict observations require execution-grade coverage");
    invariant(newYorkDateKey(value.providerTime) === value.sessionDate, "strict observation belongs to a different session");
  }
}

function validateCompletedMinuteBar(value: MarketCompletedMinuteBar) {
  provenance(value);
  identifier(value.id, "completed minute id");
  sessionDate(value.sessionDate);
  timestamp(value.minuteStart, "minuteStart");
  timestamp(value.minuteEnd, "minuteEnd");
  invariant(value.minuteStart % 60_000 === 0, "minuteStart must be UTC minute-aligned");
  invariant(value.minuteEnd === value.minuteStart + 60_000, "minuteEnd must close exactly one minute");
  invariant(value.availableAt >= value.minuteEnd, "an unfinished minute cannot be persisted as complete");
  invariant(newYorkDateKey(value.minuteStart) === value.sessionDate, "minute bar belongs to a different session");
  for (const [label, price] of [["open", value.open], ["high", value.high], ["low", value.low], ["close", value.close], ["volume", value.volume]] as const) finite(price, label);
  invariant(value.high >= value.low, "high cannot be below low");
  invariant(value.open >= value.low && value.open <= value.high, "open must be inside the bar range");
  invariant(value.close >= value.low && value.close <= value.high, "close must be inside the bar range");
  invariant(value.volume >= 0, "volume cannot be negative");
  if (value.tradeCount != null) sequence(value.tradeCount, "tradeCount");
  providerTime(value.providerTime, value.receivedAt, "providerTime");
  identifier(value.connectionEpoch, "connectionEpoch");
  sequence(value.serviceSequence, "serviceSequence");
  sequence(value.revision, "revision");
  invariant(typeof value.recovered === "boolean", "recovered must be boolean");
  identifier(value.payloadHash, "payloadHash");
}

function validateSessionSnapshot(value: MarketSessionSnapshot) {
  provenance(value);
  identifier(value.id, "session snapshot id");
  sessionDate(value.targetDate, "targetDate");
  identifier(value.checkpoint, "checkpoint");
  timestamp(value.capturedAt, "capturedAt");
  timestamp(value.sourceWatermarkAt, "sourceWatermarkAt");
  invariant(value.sourceWatermarkAt <= value.capturedAt + MAX_PROVIDER_FUTURE_SKEW_MS, "sourceWatermarkAt is too far ahead of capturedAt");
  invariant(value.capturedAt <= value.availableAt, "capturedAt cannot follow availableAt");
  identifier(value.qualityState, "qualityState");
  identifier(value.payloadHash, "payloadHash");
  invariant(typeof JSON.stringify(value.payload) === "string", "snapshot payload must be JSON serializable");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function observationHashPayload(value: Omit<MarketQualifiedObservation, "id" | "payloadHash" | "createdAt"> | MarketQualifiedObservation) {
  return {
    provider:value.provider,feed:value.feed,symbol:value.symbol,sessionDate:value.sessionDate,kind:value.kind,
    qualification:value.qualification,entitlement:value.entitlement,coverage:value.coverage,price:value.price,size:value.size,
    providerEventId:value.providerEventId,providerTime:value.providerTime,receivedAt:value.receivedAt,processedAt:value.processedAt,
    availableAt:value.availableAt,connectionEpoch:value.connectionEpoch,serviceSequence:value.serviceSequence,
  };
}

function minuteHashPayload(value: Omit<MarketCompletedMinuteBar, "id" | "revision" | "payloadHash" | "createdAt"> | MarketCompletedMinuteBar) {
  return {
    provider:value.provider,feed:value.feed,symbol:value.symbol,sessionDate:value.sessionDate,minuteStart:value.minuteStart,
    minuteEnd:value.minuteEnd,open:value.open,high:value.high,low:value.low,close:value.close,volume:value.volume,
    tradeCount:value.tradeCount,providerTime:value.providerTime,receivedAt:value.receivedAt,processedAt:value.processedAt,
    availableAt:value.availableAt,connectionEpoch:value.connectionEpoch,serviceSequence:value.serviceSequence,recovered:value.recovered,
  };
}

async function readWithoutSchemaMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such (?:table|column)|has no column|unknown column|(?:table|column).+does not exist/i.test(message)) {
      throw new MarketSchemaUnavailableError(error);
    }
    throw error;
  }
}

function ensure(database: D1Database) {
  return ensureMarketPersistenceSchemaOnce(database);
}

const insertSourceStateSql = `INSERT INTO market_source_state_events (
  id,provider,feed,symbol,state,entitlement,coverage,observed_at,checked_at,
  received_at,processed_at,available_at,connection_epoch,service_sequence,detail_code,created_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`;
const insertObservationSql = `INSERT INTO market_qualified_observations (
  id,provider,feed,symbol,session_date,kind,qualification,entitlement,coverage,price,size,
  provider_event_id,provider_time,received_at,processed_at,available_at,connection_epoch,
  service_sequence,payload_hash,created_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`;
const insertCompletedMinuteSql = `INSERT INTO market_completed_minute_bars (
  id,provider,feed,symbol,session_date,minute_start,minute_end,open,high,low,close,volume,
  trade_count,provider_time,received_at,processed_at,available_at,connection_epoch,
  service_sequence,revision,recovered,payload_hash,created_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`;
const insertSessionSnapshotSql = `INSERT INTO market_session_snapshots (
  id,target_date,checkpoint,provider,feed,symbol,captured_at,source_watermark_at,
  received_at,processed_at,available_at,quality_state,payload_json,payload_hash,created_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`;
const insertCorrectedMinuteSql = `INSERT INTO market_completed_minute_bars (
  id,provider,feed,symbol,session_date,minute_start,minute_end,open,high,low,close,volume,
  trade_count,provider_time,received_at,processed_at,available_at,connection_epoch,
  service_sequence,revision,recovered,payload_hash,created_at
) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
  COALESCE((SELECT MAX(revision)+1 FROM market_completed_minute_bars
    WHERE provider=? AND feed=? AND symbol=? AND session_date=? AND minute_start=?),0),?,?,?
WHERE NOT EXISTS (SELECT 1 FROM market_completed_minute_bars
  WHERE provider=? AND feed=? AND symbol=? AND session_date=? AND minute_start=? AND payload_hash=?)`;

function resultChanges(result: { meta?: { changes?: number } } | undefined) {
  return Number(result?.meta?.changes ?? 0);
}

type SourcePolicy = { provider: string; feed: string; coverage: string; entitlement: MarketEntitlement };
function sourcePolicy(provenanceValue: MarketProvenance): SourcePolicy {
  const source = provenanceValue.sourceId.toLowerCase();
  const provider = provenanceValue.provider.toLowerCase().replace(/[^a-z0-9._-]/g, "_") || "unknown";
  if (source.includes("alpaca") && source.includes("iex")) return { provider: "alpaca", feed: "iex", coverage: "SINGLE_EXCHANGE_IEX", entitlement: "ENTITLED" };
  if (source.includes("alpaca") && source.includes("sip")) return { provider: "alpaca", feed: "sip_history", coverage: "COMPLETED_SIP_DAILY_HISTORY", entitlement: "ENTITLED" };
  if (source.includes("yahoo")) return { provider: "yahoo", feed: "minute", coverage: "PUBLIC_DELAYED_UNCONSOLIDATED", entitlement: "UNKNOWN" };
  if (source.includes("finnhub")) return { provider: "finnhub", feed: "quote", coverage: "PLAN_DEPENDENT_UNCONSOLIDATED", entitlement: "UNKNOWN" };
  return { provider, feed: "research", coverage: "UNKNOWN_RESEARCH_COVERAGE", entitlement: "UNKNOWN" };
}

function validContractProvenance(value: MarketProvenance | null): value is MarketProvenance & { receivedAt: number; availableAt: number } {
  return Boolean(value && Number.isSafeInteger(value.receivedAt) && Number.isSafeInteger(value.processedAt) &&
    Number.isSafeInteger(value.availableAt) && value.receivedAt! <= value.processedAt && value.processedAt <= value.availableAt!);
}

function contractValues(envelope: TargetMarketEnvelope) {
  const values: MarketValue<number>[] = [
    envelope.quote,
    ...Object.values(envelope.previousSession).filter((item): item is MarketValue<number> => typeof item === "object"),
    ...Object.values(envelope.targetSession.premarket),
    ...Object.values(envelope.targetSession.regular),
    envelope.targetSession.firstMinute.high,
    envelope.targetSession.firstMinute.low,
    envelope.targetSession.firstMinute.close,
    envelope.targetSession.firstMinute.volume,
  ];
  return values;
}

function sourceStateFor(value: MarketValue<number>): MarketSourceState {
  if (value.availability === "SOURCE_ERROR") return "ERROR";
  if (value.availability === "NOT_ENTITLED") return "UNAVAILABLE";
  if (value.availability !== "AVAILABLE") return "UNAVAILABLE";
  if (value.freshness === "STALE") return "STALE";
  if (value.freshness === "MARKET_CLOSED" || value.freshness === "FINAL") return "MARKET_CLOSED";
  return "CURRENT";
}

function boundedLimit(value: number | undefined, maximum: number, fallback: number) {
  const chosen = value ?? fallback;
  invariant(Number.isSafeInteger(chosen) && chosen > 0 && chosen <= maximum, `limit must be between 1 and ${maximum}`);
  return chosen;
}

function numberColumn(row: Record<string, unknown>, key: string) {
  const value = row[key];
  invariant(typeof value === "number" && Number.isFinite(value), `${key} is invalid in persisted market data`);
  return value;
}

function textColumn(row: Record<string, unknown>, key: string) {
  const value = row[key];
  invariant(typeof value === "string", `${key} is invalid in persisted market data`);
  return value;
}

export function createMarketStore(database: D1Database) {
  const store = {
    async appendBatch(input: MarketAppendBatch): Promise<MarketAppendCounts> {
      const sourceStateRows = input.sourceStates ?? [];
      const observationRows = input.observations ?? [];
      const minuteRows = input.completedMinuteBars ?? [];
      const snapshotRows = input.sessionSnapshots ?? [];
      sourceStateRows.forEach(validateSourceState);
      observationRows.forEach(validateObservation);
      minuteRows.forEach(validateCompletedMinuteBar);
      snapshotRows.forEach(validateSessionSnapshot);
      const counts: MarketAppendCounts = { sourceStates: 0, observations: 0, completedMinuteBars: 0, sessionSnapshots: 0 };
      if (sourceStateRows.length + observationRows.length + minuteRows.length + snapshotRows.length === 0) return counts;
      await ensure(database);
      const statements = [
        ...sourceStateRows.map((row) => database.prepare(insertSourceStateSql).bind(row.id,row.provider,row.feed,row.symbol,row.state,row.entitlement,row.coverage,row.observedAt,row.checkedAt,row.receivedAt,row.processedAt,row.availableAt,row.connectionEpoch,row.serviceSequence,row.detailCode,row.createdAt)),
        ...observationRows.map((row) => database.prepare(insertObservationSql).bind(row.id,row.provider,row.feed,row.symbol,row.sessionDate,row.kind,row.qualification,row.entitlement,row.coverage,row.price,row.size,row.providerEventId,row.providerTime,row.receivedAt,row.processedAt,row.availableAt,row.connectionEpoch,row.serviceSequence,row.payloadHash,row.createdAt)),
        ...minuteRows.map((row) => database.prepare(insertCompletedMinuteSql).bind(row.id,row.provider,row.feed,row.symbol,row.sessionDate,row.minuteStart,row.minuteEnd,row.open,row.high,row.low,row.close,row.volume,row.tradeCount,row.providerTime,row.receivedAt,row.processedAt,row.availableAt,row.connectionEpoch,row.serviceSequence,row.revision,row.recovered ? 1 : 0,row.payloadHash,row.createdAt)),
        ...snapshotRows.map((row) => database.prepare(insertSessionSnapshotSql).bind(row.id,row.targetDate,row.checkpoint,row.provider,row.feed,row.symbol,row.capturedAt,row.sourceWatermarkAt,row.receivedAt,row.processedAt,row.availableAt,row.qualityState,JSON.stringify(row.payload),row.payloadHash,row.createdAt)),
      ];
      const results = await database.batch(statements);
      let offset = 0;
      const sum = (length: number) => {
        const count = results.slice(offset, offset + length).reduce((total, result) => total + resultChanges(result), 0);
        offset += length;
        return count;
      };
      counts.sourceStates = sum(sourceStateRows.length);
      counts.observations = sum(observationRows.length);
      counts.completedMinuteBars = sum(minuteRows.length);
      counts.sessionSnapshots = sum(snapshotRows.length);
      const snapshotResultOffset = sourceStateRows.length + observationRows.length + minuteRows.length;
      for (let index = 0; index < snapshotRows.length; index += 1) {
        if (resultChanges(results[snapshotResultOffset + index]) !== 0) continue;
        const row = snapshotRows[index];
        const existing = await database.prepare(`SELECT id,payload_hash FROM market_session_snapshots
          WHERE target_date=? AND checkpoint=? AND provider=? AND feed=? AND symbol=? AND source_watermark_at=? LIMIT 1`)
          .bind(row.targetDate,row.checkpoint,row.provider,row.feed,row.symbol,row.sourceWatermarkAt)
          .first<{ id: string; payload_hash: string }>();
        if (!existing || existing.payload_hash !== row.payloadHash) {
          throw new MarketSnapshotConflictError(row.targetDate, row.checkpoint, row.sourceWatermarkAt);
        }
      }
      return counts;
    },

    async appendSourceState(row: MarketSourceStateEvent) { return (await store.appendBatch({ sourceStates: [row] })).sourceStates === 1; },
    async appendObservation(row: MarketQualifiedObservation) { return (await store.appendBatch({ observations: [row] })).observations === 1; },
    async appendCompletedMinuteBar(row: MarketCompletedMinuteBar) { return (await store.appendBatch({ completedMinuteBars: [row] })).completedMinuteBars === 1; },
    async appendSessionSnapshot(row: MarketSessionSnapshot) { return (await store.appendBatch({ sessionSnapshots: [row] })).sessionSnapshots === 1; },

    async appendCompletedMinuteRevision(row: Omit<MarketCompletedMinuteBar, "id" | "revision">) {
      const candidate: MarketCompletedMinuteBar = { ...row, id: `minute:${row.payloadHash}`, revision: 0 };
      validateCompletedMinuteBar(candidate);
      await ensure(database);
      const values = [
        candidate.id,candidate.provider,candidate.feed,candidate.symbol,candidate.sessionDate,candidate.minuteStart,candidate.minuteEnd,
        candidate.open,candidate.high,candidate.low,candidate.close,candidate.volume,candidate.tradeCount,candidate.providerTime,
        candidate.receivedAt,candidate.processedAt,candidate.availableAt,candidate.connectionEpoch,candidate.serviceSequence,
        candidate.provider,candidate.feed,candidate.symbol,candidate.sessionDate,candidate.minuteStart,
        candidate.recovered ? 1 : 0,candidate.payloadHash,candidate.createdAt,
        candidate.provider,candidate.feed,candidate.symbol,candidate.sessionDate,candidate.minuteStart,candidate.payloadHash,
      ];
      const result = await database.prepare(insertCorrectedMinuteSql).bind(...values).run();
      return resultChanges(result) === 1;
    },

    async rememberOnce(nonce: string, expiresAt: number, nowMs = Date.now()) {
      identifier(nonce, "nonce");
      timestamp(nowMs, "nowMs");
      timestamp(expiresAt, "expiresAt");
      if (expiresAt <= nowMs) return false;
      invariant(expiresAt - nowMs <= MAX_NONCE_TTL_MS, "nonce expiry exceeds the maximum TTL");
      const results = await readWithoutSchemaMutation(() => database.batch([
        database.prepare("DELETE FROM market_ingest_nonces WHERE expires_at <= ?").bind(nowMs),
        database.prepare("INSERT INTO market_ingest_nonces (nonce,expires_at,created_at) VALUES (?,?,?) ON CONFLICT(nonce) DO NOTHING").bind(nonce, expiresAt, nowMs),
      ]));
      return resultChanges(results[1]) === 1;
    },

    async readSessionSnapshotAsOf(input: { symbol: string; targetDate: string; cutoff: number; checkpoint?: string }) {
      identifier(input.symbol, "symbol");
      sessionDate(input.targetDate, "targetDate");
      timestamp(input.cutoff, "cutoff");
      if (input.checkpoint != null) identifier(input.checkpoint, "checkpoint");
      const checkpointSql = input.checkpoint == null ? "" : " AND checkpoint=?";
      const statement = database.prepare(`SELECT * FROM market_session_snapshots WHERE symbol=? AND target_date=? AND available_at<=?${checkpointSql} ORDER BY available_at DESC,captured_at DESC LIMIT 1`)
        .bind(...(input.checkpoint == null ? [input.symbol,input.targetDate,input.cutoff] : [input.symbol,input.targetDate,input.cutoff,input.checkpoint]));
      const row = await readWithoutSchemaMutation(() => statement.first<Record<string, unknown>>());
      if (!row) return null;
      const payloadJson = textColumn(row, "payload_json");
      let payload: unknown;
      try { payload = JSON.parse(payloadJson); } catch { throw new TypeError("persisted snapshot payload is invalid JSON"); }
      const snapshot: MarketSessionSnapshot = {
        id: textColumn(row,"id"),targetDate:textColumn(row,"target_date"),checkpoint:textColumn(row,"checkpoint"),
        provider:textColumn(row,"provider"),feed:textColumn(row,"feed"),symbol:textColumn(row,"symbol"),
        capturedAt:numberColumn(row,"captured_at"),sourceWatermarkAt:numberColumn(row,"source_watermark_at"),
        receivedAt:numberColumn(row,"received_at"),processedAt:numberColumn(row,"processed_at"),availableAt:numberColumn(row,"available_at"),
        qualityState:textColumn(row,"quality_state"),payload,payloadHash:textColumn(row,"payload_hash"),createdAt:numberColumn(row,"created_at"),
      };
      validateSessionSnapshot(snapshot);
      invariant(snapshot.availableAt <= input.cutoff && snapshot.targetDate === input.targetDate, "persisted snapshot violates the as-of query");
      invariant(await sha256(payload) === snapshot.payloadHash, "persisted snapshot payload hash mismatch");
      return snapshot;
    },

    async readCompletedBarsAsOf(input: { symbol: string; targetDate: string; cutoff: number; provider?: string; feed?: string; limit?: number }) {
      identifier(input.symbol,"symbol"); sessionDate(input.targetDate,"targetDate"); timestamp(input.cutoff,"cutoff");
      if (input.provider != null) identifier(input.provider,"provider");
      if (input.feed != null) identifier(input.feed,"feed");
      const limit = boundedLimit(input.limit, MAX_BAR_QUERY_LIMIT, 500);
      const filters = ["symbol=?","session_date=?","available_at<=?"];
      const bindings: unknown[] = [input.symbol,input.targetDate,input.cutoff];
      if (input.provider != null) { filters.push("provider=?"); bindings.push(input.provider); }
      if (input.feed != null) { filters.push("feed=?"); bindings.push(input.feed); }
      bindings.push(limit);
      const statement = database.prepare(`SELECT * FROM (SELECT *,ROW_NUMBER() OVER (PARTITION BY provider,feed,symbol,session_date,minute_start ORDER BY revision DESC,available_at DESC) AS row_rank FROM market_completed_minute_bars WHERE ${filters.join(" AND ")}) WHERE row_rank=1 ORDER BY minute_start ASC LIMIT ?`).bind(...bindings);
      const result = await readWithoutSchemaMutation(() => statement.all<Record<string, unknown>>());
      return Promise.all((result.results ?? []).map(async (row) => {
        const bar: MarketCompletedMinuteBar = {
          id:textColumn(row,"id"),provider:textColumn(row,"provider"),feed:textColumn(row,"feed"),symbol:textColumn(row,"symbol"),sessionDate:textColumn(row,"session_date"),
          minuteStart:numberColumn(row,"minute_start"),minuteEnd:numberColumn(row,"minute_end"),open:numberColumn(row,"open"),high:numberColumn(row,"high"),low:numberColumn(row,"low"),close:numberColumn(row,"close"),volume:numberColumn(row,"volume"),tradeCount:row.trade_count == null ? null : numberColumn(row,"trade_count"),providerTime:numberColumn(row,"provider_time"),receivedAt:numberColumn(row,"received_at"),processedAt:numberColumn(row,"processed_at"),availableAt:numberColumn(row,"available_at"),connectionEpoch:textColumn(row,"connection_epoch"),serviceSequence:numberColumn(row,"service_sequence"),revision:numberColumn(row,"revision"),recovered:numberColumn(row,"recovered") === 1,payloadHash:textColumn(row,"payload_hash"),createdAt:numberColumn(row,"created_at"),
        };
        validateCompletedMinuteBar(bar);
        invariant(bar.availableAt <= input.cutoff && bar.sessionDate === input.targetDate, "persisted minute violates the as-of query");
        invariant(await sha256(minuteHashPayload(bar)) === bar.payloadHash, "persisted minute payload hash mismatch");
        return bar;
      }));
    },

    async readObservationsAsOf(input: { symbol: string; targetDate: string; cutoff: number; qualification?: MarketQualifiedObservation["qualification"]; limit?: number }) {
      identifier(input.symbol,"symbol"); sessionDate(input.targetDate,"targetDate"); timestamp(input.cutoff,"cutoff");
      if (input.qualification != null) invariant(["RESEARCH","STRICT_EXECUTION"].includes(input.qualification), "qualification is invalid");
      const limit = boundedLimit(input.limit, MAX_OBSERVATION_QUERY_LIMIT, 100);
      const filter = input.qualification == null ? "" : " AND observation.qualification=?";
      const bindings = input.qualification == null
        ? [input.symbol,input.targetDate,input.cutoff,input.cutoff,limit]
        : [input.symbol,input.targetDate,input.cutoff,input.qualification,input.cutoff,limit];
      const statement = database.prepare(`SELECT observation.* FROM market_qualified_observations AS observation
        WHERE observation.symbol=? AND observation.session_date=? AND observation.available_at<=?${filter}
          AND NOT EXISTS (SELECT 1 FROM market_observation_invalidations AS invalidation
            WHERE observation.provider_event_id IS NOT NULL
              AND invalidation.provider=observation.provider AND invalidation.feed=observation.feed
              AND invalidation.symbol=observation.symbol AND invalidation.provider_trade_id=observation.provider_event_id
              AND invalidation.available_at<=?)
        ORDER BY observation.provider_time DESC,observation.available_at DESC LIMIT ?`).bind(...bindings);
      const result = await readWithoutSchemaMutation(() => statement.all<Record<string, unknown>>());
      return Promise.all((result.results ?? []).map(async (row) => {
        const observation: MarketQualifiedObservation = {
          id:textColumn(row,"id"),provider:textColumn(row,"provider"),feed:textColumn(row,"feed"),symbol:textColumn(row,"symbol"),sessionDate:textColumn(row,"session_date"),kind:textColumn(row,"kind") as MarketQualifiedObservation["kind"],qualification:textColumn(row,"qualification") as MarketQualifiedObservation["qualification"],entitlement:textColumn(row,"entitlement") as MarketEntitlement,coverage:textColumn(row,"coverage"),price:numberColumn(row,"price"),size:row.size == null ? null : numberColumn(row,"size"),providerEventId:row.provider_event_id == null ? null : textColumn(row,"provider_event_id"),providerTime:numberColumn(row,"provider_time"),receivedAt:numberColumn(row,"received_at"),processedAt:numberColumn(row,"processed_at"),availableAt:numberColumn(row,"available_at"),connectionEpoch:textColumn(row,"connection_epoch"),serviceSequence:numberColumn(row,"service_sequence"),payloadHash:textColumn(row,"payload_hash"),createdAt:numberColumn(row,"created_at"),
        };
        validateObservation(observation);
        invariant(observation.availableAt <= input.cutoff && observation.sessionDate === input.targetDate, "persisted observation violates the as-of query");
        invariant(await sha256(observationHashPayload(observation)) === observation.payloadHash, "persisted observation payload hash mismatch");
        return observation;
      }));
    },

    async saveScheduledCheckpoint(input: ScheduledMarketCheckpointInput): Promise<MarketAppendCounts> {
      sessionDate(input.envelope.targetDate, "targetDate");
      timestamp(input.capturedAt, "capturedAt");
      identifier(input.checkpoint, "checkpoint");
      invariant(input.envelope.symbol === "NVDA", "only the declared envelope symbol can be persisted");
      invariant(input.envelope.effectiveAsOf <= input.capturedAt + MAX_PROVIDER_FUTURE_SKEW_MS, "effectiveAsOf is too far ahead of capture");
      const cutoff = Math.min(input.envelope.effectiveAsOf, input.capturedAt);
      const values = contractValues(input.envelope);
      invariant(
        values.every((value) => value.provenance?.availableAt == null || value.provenance.availableAt <= cutoff),
        "source availability exceeds the scheduled checkpoint cutoff",
      );
      if (input.checkpoint === "T-5M") {
        const actionableCutoff = input.envelope.schedule.regularOpenAt - 5.5 * 60_000;
        invariant(input.envelope.view === "DECISION_FREEZE", "T-5M persistence requires the decision-freeze view");
        invariant(input.capturedAt <= actionableCutoff, "T-5M capture is after the actionable freeze cutoff");
        invariant(input.envelope.requestedAt <= actionableCutoff, "T-5M request is after the actionable freeze cutoff");
        invariant(input.envelope.effectiveAsOf <= actionableCutoff, "T-5M effective time is after the actionable freeze cutoff");
        invariant(
          contractValues(input.envelope).every((value) => value.provenance?.availableAt == null || value.provenance.availableAt <= actionableCutoff),
          "T-5M source availability is after the actionable freeze cutoff",
        );
      }
      const validValues = values.filter((value) => validContractProvenance(value.provenance));
      const uniqueSources = new Map<string, MarketValue<number>>();
      for (const value of validValues) uniqueSources.set(value.provenance!.sourceId, value);
      const sourceRows: MarketSourceStateEvent[] = [];
      for (const [sourceId, value] of uniqueSources) {
        const source = value.provenance! as MarketProvenance & { receivedAt: number; availableAt: number };
        const policy = sourcePolicy(source);
        const hash = await sha256({ sourceId, checkedAt: source.checkedAt, state: sourceStateFor(value), observedAt: source.sourceObservedAt });
        const observedAt = source.sourceObservedAt != null && source.sourceObservedAt <= source.receivedAt + MAX_PROVIDER_FUTURE_SKEW_MS ? source.sourceObservedAt : null;
        sourceRows.push({ id:`source:${hash}`,provider:policy.provider,feed:policy.feed,symbol:input.envelope.symbol,state:sourceStateFor(value),entitlement:policy.entitlement,coverage:policy.coverage,observedAt,checkedAt:Math.min(source.checkedAt,source.availableAt),receivedAt:source.receivedAt,processedAt:source.processedAt,availableAt:source.availableAt,connectionEpoch:`checkpoint:${input.envelope.targetDate}`,serviceSequence:source.checkedAt,detailCode:value.reasonCode && identifierPattern.test(value.reasonCode) ? value.reasonCode : null,createdAt:input.capturedAt });
      }

      const observations: MarketQualifiedObservation[] = [];
      const quote = input.envelope.quote;
      if (quote.availability === "AVAILABLE" && typeof quote.value === "number" && quote.value > 0 && validContractProvenance(quote.provenance) && quote.provenance.sourceObservedAt != null && quote.provenance.sourceObservedAt <= cutoff) {
        const policy = sourcePolicy(quote.provenance);
        const observationCore: Omit<MarketQualifiedObservation, "id" | "payloadHash" | "createdAt"> = { provider:policy.provider,feed:policy.feed,symbol:input.envelope.symbol,sessionDate:input.envelope.targetDate,kind:"QUOTE",qualification:"RESEARCH",entitlement:policy.entitlement,coverage:policy.coverage,price:quote.value,size:null,providerEventId:null,providerTime:quote.provenance.sourceObservedAt,receivedAt:quote.provenance.receivedAt,processedAt:quote.provenance.processedAt,availableAt:quote.provenance.availableAt,connectionEpoch:`checkpoint:${input.envelope.targetDate}`,serviceSequence:quote.provenance.sourceObservedAt };
        const payloadHash = await sha256(observationHashPayload(observationCore));
        observations.push({ ...observationCore,id:`observation:${payloadHash}`,payloadHash,createdAt:input.capturedAt });
      }

      const barSourceValue = [input.envelope.targetSession.firstMinute.close,input.envelope.targetSession.regular.close,input.envelope.targetSession.premarket.current]
        .find((value) => validContractProvenance(value.provenance));
      const barSource = barSourceValue?.provenance && validContractProvenance(barSourceValue.provenance) ? barSourceValue.provenance : null;
      let persistedMinutes = 0;
      if (barSource) {
        const policy = sourcePolicy(barSource);
        for (const bar of input.analysisBars) {
          const minuteEnd = bar.time + 60_000;
          if (newYorkDateKey(bar.time) !== input.envelope.targetDate || minuteEnd > cutoff || minuteEnd > barSource.receivedAt + MAX_PROVIDER_FUTURE_SKEW_MS) continue;
          const minuteCore: Omit<MarketCompletedMinuteBar, "id" | "revision" | "payloadHash" | "createdAt"> = { provider:policy.provider,feed:policy.feed,symbol:input.envelope.symbol,sessionDate:input.envelope.targetDate,minuteStart:bar.time,minuteEnd,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume,tradeCount:null,providerTime:minuteEnd,receivedAt:barSource.receivedAt,processedAt:barSource.processedAt,availableAt:Math.max(barSource.availableAt,minuteEnd),connectionEpoch:`checkpoint:${input.envelope.targetDate}`,serviceSequence:bar.time,recovered:input.envelope.archive.status !== "CURRENT" };
          const payloadHash = await sha256(minuteHashPayload(minuteCore));
          const inserted = await store.appendCompletedMinuteRevision({ ...minuteCore,payloadHash,createdAt:input.capturedAt });
          if (inserted) persistedMinutes += 1;
        }
      }

      const sourceWatermarkAt = Math.max(0,...input.analysisBars.filter((bar) => newYorkDateKey(bar.time) === input.envelope.targetDate && bar.time + 60_000 <= cutoff).map((bar) => bar.time + 60_000),...validValues.map((value) => value.provenance?.sourceObservedAt ?? 0).filter((value) => value <= cutoff));
      const snapshotPayload = { envelope: input.envelope, completedAnalysisBars: input.analysisBars.filter((bar) => newYorkDateKey(bar.time) === input.envelope.targetDate && bar.time + 60_000 <= cutoff) };
      const snapshotHash = await sha256(snapshotPayload);
      const snapshotReceivedAt = Math.min(input.capturedAt, Math.max(0,...validValues.map((value) => value.provenance?.receivedAt ?? 0),input.envelope.requestedAt));
      const snapshotProcessedAt = Math.max(snapshotReceivedAt, input.capturedAt);
      const snapshot: MarketSessionSnapshot = { id:`snapshot:${input.envelope.targetDate}:${input.checkpoint}:aperture:normalized:${sourceWatermarkAt}`,targetDate:input.envelope.targetDate,checkpoint:input.checkpoint,provider:"aperture",feed:"normalized",symbol:input.envelope.symbol,capturedAt:input.capturedAt,sourceWatermarkAt,receivedAt:snapshotReceivedAt,processedAt:snapshotProcessedAt,availableAt:snapshotProcessedAt,qualityState:input.envelope.archive.status === "CURRENT" ? "CURRENT" : "RESEARCH_ONLY",payload:snapshotPayload,payloadHash:snapshotHash,createdAt:input.capturedAt };
      const counts = await store.appendBatch({ sourceStates:sourceRows, observations, sessionSnapshots:[snapshot] });
      counts.completedMinuteBars = persistedMinutes;
      return counts;
    },
  };
  return store;
}

export type MarketStore = ReturnType<typeof createMarketStore>;
