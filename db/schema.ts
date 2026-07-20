import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
