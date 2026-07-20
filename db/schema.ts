import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const libraryPlans = sqliteTable("library_plans", {
  date: text("date").primaryKey(),
  strategyKind: text("strategy_kind", {
    enum: ["LEGACY_931_CONFIRMATION", "MOO_PLANNER"],
  }).notNull().default("LEGACY_931_CONFIRMATION"),
  signal: text("signal", { enum: ["LONG", "SHORT", "WAIT"] }).notNull(),
  openRangeLow: real("open_range_low").notNull(),
  openRangeHigh: real("open_range_high").notNull(),
  entry: real("entry"),
  stop: real("stop"),
  target: real("target"),
  expectedMove: real("expected_move").notNull(),
  confidence: real("confidence").notNull(),
  rationale: text("rationale").notNull(),
  actualOpen: real("actual_open"),
  actualOpenSource: text("actual_open_source", {
    enum: ["NASDAQ_OFFICIAL_CROSS"],
  }),
  firstMinuteClose: real("first_minute_close"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const forecastWeights = sqliteTable("forecast_weights", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  directionWeight: real("direction_weight").notNull().default(0),
  rangeWeight: real("range_weight").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const marketEvents = sqliteTable("market_events", {
  id: text("id").primaryKey(), source: text("source").notNull(), category: text("category").notNull(),
  headline: text("headline").notNull(), summary: text("summary").notNull(), url: text("url").notNull(),
  eventTime: integer("event_time").notNull(), severity: real("severity").notNull(), createdAt: integer("created_at").notNull(),
});

export const forecastSnapshots = sqliteTable("forecast_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }), targetDate: text("target_date").notNull(),
  capturedAt: integer("captured_at").notNull(), intervalLabel: text("interval_label").notNull(),
  baseMedian: real("base_median").notNull(), adjustedMedian: real("adjusted_median").notNull(),
  adjustedLow: real("adjusted_low").notNull(), adjustedHigh: real("adjusted_high").notNull(),
  factorsJson: text("factors_json").notNull(), actualOpen: real("actual_open"), medianError: real("median_error"),
  firstMinuteClose: real("first_minute_close"), firstMinuteError: real("first_minute_error"),
  outcomeCapturedAt: integer("outcome_captured_at"),
});

export const forecastPreopenFreezes = sqliteTable("forecast_preopen_freezes", {
  targetDate: text("target_date").primaryKey(),
  frozenAt: integer("frozen_at").notNull(),
  actionableCutoffAt: integer("actionable_cutoff_at"),
  payloadJson: text("payload_json").notNull(),
});

export const sessionQuarantine = sqliteTable("session_quarantine", {
  recordId: text("record_id").primaryKey(),
  sourceTable: text("source_table").notNull(),
  sourceKey: text("source_key").notNull(),
  sessionDate: text("session_date").notNull(),
  reason: text("reason").notNull(),
  quarantinedAt: integer("quarantined_at").notNull(),
  detailsJson: text("details_json").notNull(),
});

export const automationCaptureHealth = sqliteTable("automation_capture_health", {
  id: integer("id").primaryKey(),
  lastAttemptAt: integer("last_attempt_at").notNull(),
  lastSuccessAt: integer("last_success_at"),
  lastPreopenAt: integer("last_preopen_at"),
  lastOutcomeAt: integer("last_outcome_at"),
  scheduledAt: integer("scheduled_at").notNull(),
  phase: text("phase").notNull(),
  status: text("status").notNull(),
  targetDate: text("target_date"),
  detail: text("detail"),
});

/**
 * Append-only provider checks. A check may reference the last provider
 * observation, but it never pretends that checking the API created a new
 * market observation.
 */
export const marketSourceStateEvents = sqliteTable("market_source_state_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  state: text("state", {
    enum: ["CURRENT", "STALE", "MARKET_CLOSED", "RECOVERING", "UNAVAILABLE", "ERROR"],
  }).notNull(),
  entitlement: text("entitlement", {
    enum: ["ENTITLED", "NOT_ENTITLED", "UNKNOWN"],
  }).notNull(),
  coverage: text("coverage").notNull(),
  observedAt: integer("observed_at"),
  checkedAt: integer("checked_at").notNull(),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at").notNull(),
  availableAt: integer("available_at").notNull(),
  connectionEpoch: text("connection_epoch"),
  serviceSequence: integer("service_sequence"),
  detailCode: text("detail_code"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("market_source_state_lookup_idx").on(table.provider, table.feed, table.symbol, sql`${table.checkedAt} desc`),
  check("market_source_state_value_check", sql`${table.state} IN ('CURRENT','STALE','MARKET_CLOSED','RECOVERING','UNAVAILABLE','ERROR')`),
  check("market_source_entitlement_check", sql`${table.entitlement} IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')`),
]);

/** Point-in-time observations admitted by the ingestion qualification policy. */
export const marketQualifiedObservations = sqliteTable("market_qualified_observations", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  sessionDate: text("session_date").notNull(),
  kind: text("kind", {
    enum: ["TRADE", "QUOTE", "OPENING_CROSS", "INDICATIVE"],
  }).notNull(),
  qualification: text("qualification", {
    enum: ["RESEARCH", "STRICT_EXECUTION"],
  }).notNull(),
  entitlement: text("entitlement", {
    enum: ["ENTITLED", "NOT_ENTITLED", "UNKNOWN"],
  }).notNull(),
  coverage: text("coverage").notNull(),
  price: real("price").notNull(),
  size: real("size"),
  providerEventId: text("provider_event_id"),
  providerTime: integer("provider_time").notNull(),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at").notNull(),
  availableAt: integer("available_at").notNull(),
  connectionEpoch: text("connection_epoch").notNull(),
  serviceSequence: integer("service_sequence").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("market_observation_sequence_idx").on(table.provider, table.feed, table.symbol, table.connectionEpoch, table.serviceSequence),
  index("market_observation_time_idx").on(table.symbol, table.sessionDate, sql`${table.providerTime} desc`),
  check("market_observation_kind_check", sql`${table.kind} IN ('TRADE','QUOTE','OPENING_CROSS','INDICATIVE')`),
  check("market_observation_qualification_check", sql`${table.qualification} IN ('RESEARCH','STRICT_EXECUTION')`),
  check("market_observation_entitlement_check", sql`${table.entitlement} IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')`),
]);

/** Immutable correction/cancel tombstones applied to as-of observation reads. */
export const marketObservationInvalidations = sqliteTable("market_observation_invalidations", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  providerTradeId: text("provider_trade_id").notNull(),
  kind: text("kind", { enum: ["CORRECTION", "CANCEL"] }).notNull(),
  replacementProviderTradeId: text("replacement_provider_trade_id"),
  providerTime: integer("provider_time").notNull(),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at").notNull(),
  availableAt: integer("available_at").notNull(),
  connectionEpoch: text("connection_epoch").notNull(),
  serviceSequence: integer("service_sequence").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("market_observation_invalidation_sequence_idx").on(table.provider, table.feed, table.symbol, table.connectionEpoch, table.serviceSequence),
  index("market_observation_invalidation_lookup_idx").on(table.provider, table.feed, table.symbol, table.providerTradeId, table.availableAt),
  check("market_observation_invalidation_kind_check", sql`${table.kind} IN ('CORRECTION','CANCEL')`),
]);

/** Finalized minute bars. Corrections append a higher revision; rows are not rewritten. */
export const marketCompletedMinuteBars = sqliteTable("market_completed_minute_bars", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  sessionDate: text("session_date").notNull(),
  minuteStart: integer("minute_start").notNull(),
  minuteEnd: integer("minute_end").notNull(),
  open: real("open").notNull(),
  high: real("high").notNull(),
  low: real("low").notNull(),
  close: real("close").notNull(),
  volume: real("volume").notNull(),
  tradeCount: integer("trade_count"),
  providerTime: integer("provider_time").notNull(),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at").notNull(),
  availableAt: integer("available_at").notNull(),
  connectionEpoch: text("connection_epoch").notNull(),
  serviceSequence: integer("service_sequence").notNull(),
  revision: integer("revision").notNull().default(0),
  recovered: integer("recovered", { mode: "boolean" }).notNull().default(false),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("market_minute_revision_idx").on(table.provider, table.feed, table.symbol, table.minuteStart, table.revision),
  index("market_minute_lookup_idx").on(table.symbol, table.sessionDate, sql`${table.minuteStart} desc`),
  check("market_minute_duration_check", sql`${table.minuteEnd} = ${table.minuteStart} + 60000`),
  check("market_minute_range_check", sql`${table.high} >= ${table.low}`),
  check("market_minute_open_check", sql`${table.open} BETWEEN ${table.low} AND ${table.high}`),
  check("market_minute_close_check", sql`${table.close} BETWEEN ${table.low} AND ${table.high}`),
  check("market_minute_volume_check", sql`${table.volume} >= 0`),
  check("market_minute_revision_check", sql`${table.revision} >= 0`),
  check("market_minute_recovered_check", sql`${table.recovered} IN (0,1)`),
]);

/** Immutable session/checkpoint payloads built from a known source watermark. */
export const marketSessionSnapshots = sqliteTable("market_session_snapshots", {
  id: text("id").primaryKey(),
  targetDate: text("target_date").notNull(),
  checkpoint: text("checkpoint").notNull(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  capturedAt: integer("captured_at").notNull(),
  sourceWatermarkAt: integer("source_watermark_at").notNull(),
  receivedAt: integer("received_at").notNull(),
  processedAt: integer("processed_at").notNull(),
  availableAt: integer("available_at").notNull(),
  qualityState: text("quality_state").notNull(),
  payloadJson: text("payload_json").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("market_session_snapshot_watermark_idx").on(table.targetDate, table.checkpoint, table.provider, table.feed, table.symbol, table.sourceWatermarkAt),
  index("market_session_snapshot_lookup_idx").on(table.targetDate, sql`${table.capturedAt} desc`),
]);

/** Append-only final scheduler outcomes, idempotent by deterministic run id. */
export const schedulerRuns = sqliteTable("scheduler_runs", {
  runId: text("run_id").primaryKey(),
  jobKey: text("job_key").notNull(),
  scheduledAt: integer("scheduled_at").notNull(),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at").notNull(),
  phase: text("phase").notNull(),
  checkpoint: text("checkpoint").notNull(),
  status: text("status").notNull(),
  targetDate: text("target_date"),
  transportSucceeded: integer("transport_succeeded", { mode: "boolean" }).notNull(),
  snapshotSucceeded: integer("snapshot_succeeded", { mode: "boolean" }).notNull(),
  freezeSucceeded: integer("freeze_succeeded", { mode: "boolean" }).notNull(),
  detailCode: text("detail_code"),
  detail: text("detail"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("scheduler_runs_scheduled_idx").on(sql`${table.scheduledAt} desc`),
  index("scheduler_runs_job_idx").on(table.jobKey, sql`${table.completedAt} desc`),
  check("scheduler_transport_succeeded_check", sql`${table.transportSucceeded} IN (0,1)`),
  check("scheduler_snapshot_succeeded_check", sql`${table.snapshotSucceeded} IN (0,1)`),
  check("scheduler_freeze_succeeded_check", sql`${table.freezeSucceeded} IN (0,1)`),
]);

/** Short-lived replay ledger for authenticated ingestion messages. */
export const marketIngestNonces = sqliteTable("market_ingest_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("market_ingest_nonces_expiry_idx").on(table.expiresAt),
]);

/** Immutable feed and entitlement-policy binding for a durable stream identity. */
export const marketStreamIngestStreams = sqliteTable("market_stream_ingest_streams", {
  streamId: text("stream_id").primaryKey(),
  provider: text("provider").notNull(),
  feed: text("feed").notNull(),
  symbol: text("symbol").notNull(),
  coverageScope: text("coverage_scope").notNull(),
  researchOnlyRequired: integer("research_only_required").notNull(),
  executionEligibleAllowed: integer("execution_eligible_allowed").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  check("market_stream_research_only_check", sql`${table.researchOnlyRequired} IN (0,1)`),
  check("market_stream_execution_eligible_check", sql`${table.executionEligibleAllowed} IN (0,1)`),
]);

/** Immutable receiver ledger for durable-stream emissions. */
export const marketStreamIngestEmissions = sqliteTable("market_stream_ingest_emissions", {
  streamId: text("stream_id").notNull(),
  serviceSequence: integer("service_sequence").notNull(),
  emissionId: text("emission_id").notNull(),
  connectionEpoch: integer("connection_epoch").notNull(),
  availableAt: integer("available_at").notNull(),
  payloadHash: text("payload_hash").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("market_stream_emission_sequence_idx").on(table.streamId, table.serviceSequence),
  uniqueIndex("market_stream_emission_id_idx").on(table.emissionId),
  index("market_stream_emission_available_idx").on(table.availableAt),
  check("market_stream_emission_sequence_check", sql`${table.serviceSequence} > 0`),
  check("market_stream_emission_epoch_check", sql`${table.connectionEpoch} >= 0`),
]);

/** Highest sequence whose complete immutable prefix has been accepted. */
export const marketStreamIngestCursors = sqliteTable("market_stream_ingest_cursors", {
  streamId: text("stream_id").primaryKey(),
  highestContiguousSequence: integer("highest_contiguous_sequence").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("market_stream_cursor_sequence_check", sql`${table.highestContiguousSequence} >= 0`),
]);

/**
 * Readiness marker for the controlled 0004 drift bridge. The marker is written
 * only after the legacy columns and quarantine table have been verified, so
 * public reads can fail closed without attempting DDL.
 */
export const mooSafetySchemaState = sqliteTable("moo_safety_schema_state", {
  id: integer("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  readyAt: integer("ready_at").notNull(),
}, (table) => [
  check("moo_safety_schema_singleton_check", sql`${table.id} = 1`),
  check("moo_safety_schema_version_check", sql`${table.schemaVersion} >= 1`),
]);
