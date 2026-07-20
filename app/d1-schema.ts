const snapshotOutcomeColumns = [
  ["first_minute_close", "REAL"],
  ["first_minute_error", "REAL"],
  ["outcome_captured_at", "INTEGER"],
] as const;

const MOO_SAFETY_SCHEMA_VERSION = 1;
const mooSafetyColumns = [
  ["library_plans", "strategy_kind", "TEXT NOT NULL DEFAULT 'LEGACY_931_CONFIRMATION'"],
  ["library_plans", "actual_open_source", "TEXT"],
  ["forecast_preopen_freezes", "actionable_cutoff_at", "INTEGER"],
] as const;

const createSessionQuarantineSql = `CREATE TABLE IF NOT EXISTS session_quarantine (
  record_id TEXT PRIMARY KEY NOT NULL,
  source_table TEXT NOT NULL,
  source_key TEXT NOT NULL,
  session_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  quarantined_at INTEGER NOT NULL,
  details_json TEXT NOT NULL
)`;

const createMooSafetySchemaStateSql = `CREATE TABLE IF NOT EXISTS moo_safety_schema_state (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  ready_at INTEGER NOT NULL
)`;

function duplicateColumn(error: unknown) {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}

/**
 * Sites has historically deployed SQL files that were not represented in the
 * Drizzle journal. Inspect the real D1 table before upgrading so both existing
 * and fresh databases converge without replaying an already-applied migration.
 */
export async function ensureForecastSnapshotOutcomeColumns(database: D1Database) {
  const result = await database
    .prepare("PRAGMA table_info(forecast_snapshots)")
    .all<{ name: string }>();
  const existing = new Set(result.results.map((column) => column.name));

  for (const [name, type] of snapshotOutcomeColumns) {
    if (existing.has(name)) continue;
    try {
      await database.prepare(`ALTER TABLE forecast_snapshots ADD COLUMN ${name} ${type}`).run();
      existing.add(name);
    } catch (error) {
      // Two cold starts can inspect the same old schema before either ALTER
      // completes. A duplicate-column response means the other upgrade won.
      if (!duplicateColumn(error)) throw error;
      existing.add(name);
    }
  }
}

const mooSafetySchemaReady = new WeakMap<object, Promise<void>>();

async function tableColumns(database: D1Database, table: string) {
  const result = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set(result.results.map((column) => column.name));
}

async function ensureMooSafetySchema(database: D1Database, readyAt = Date.now()) {
  const byTable = new Map<string, Set<string>>();
  for (const [table] of mooSafetyColumns) {
    if (!byTable.has(table)) byTable.set(table, await tableColumns(database, table));
  }
  for (const [table, name, type] of mooSafetyColumns) {
    const columns = byTable.get(table)!;
    if (columns.has(name)) continue;
    try {
      await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
      columns.add(name);
    } catch (error) {
      // Separate isolates can inspect the same old schema. Only a verified
      // duplicate-column race is safe to accept; all other failures stay fatal.
      if (!duplicateColumn(error)) throw error;
      const rechecked = await tableColumns(database, table);
      if (!rechecked.has(name)) throw error;
      byTable.set(table, rechecked);
    }
  }
  // Prepare only after each prerequisite exists. This remains compatible with
  // D1 while also making clean SQLite disaster-recovery rehearsal exact.
  await database.prepare(createSessionQuarantineSql).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS session_quarantine_date_idx ON session_quarantine (session_date)").run();
  // The checked-in 0008 migration owns this table. Keeping this idempotent
  // create in the controlled bootstrap also repairs a partially restored D1.
  await database.prepare(createMooSafetySchemaStateSql).run();
  await database.prepare(`INSERT INTO moo_safety_schema_state (id,schema_version,ready_at)
    VALUES (1,?,?)
    ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,ready_at=excluded.ready_at
    WHERE moo_safety_schema_state.schema_version < excluded.schema_version
      OR moo_safety_schema_state.ready_at = 0`)
    .bind(MOO_SAFETY_SCHEMA_VERSION, readyAt).run();
}

/**
 * Controlled, idempotent bridge for historical 0004 journal drift. Call only
 * from authenticated/internal writes or the Worker schedule, never public GET.
 */
export function ensureMooSafetySchemaOnce(database: D1Database, readyAt = Date.now()) {
  const key = database as unknown as object;
  const existing = mooSafetySchemaReady.get(key);
  if (existing) return existing;
  const pending = ensureMooSafetySchema(database, readyAt).catch((error) => {
    mooSafetySchemaReady.delete(key);
    throw error;
  });
  mooSafetySchemaReady.set(key, pending);
  return pending;
}

export class MooSafetySchemaUnavailableError extends Error {
  readonly code = "MOO_SAFETY_SCHEMA_UNAVAILABLE";
  readonly status = 503;
  constructor(cause?: unknown) {
    super("MOO_SAFETY_SCHEMA_UNAVAILABLE", cause === undefined ? undefined : { cause });
    this.name = "MooSafetySchemaUnavailableError";
  }
}

const mooSafetyReadiness = new WeakMap<object, Promise<void>>();

/** Read-only readiness gate used by public routes before selecting 0004 fields. */
export function requireMooSafetySchema(database: D1Database) {
  const key = database as unknown as object;
  const existing = mooSafetyReadiness.get(key);
  if (existing) return existing;
  const pending = Promise.resolve().then(() => database.prepare(`SELECT state.schema_version AS schema_version,
        (SELECT strategy_kind FROM library_plans LIMIT 0) AS strategy_kind,
        (SELECT actual_open_source FROM library_plans LIMIT 0) AS actual_open_source,
        (SELECT actionable_cutoff_at FROM forecast_preopen_freezes LIMIT 0) AS actionable_cutoff_at,
        (SELECT record_id FROM session_quarantine LIMIT 0) AS quarantine_record_id
      FROM moo_safety_schema_state AS state
      WHERE state.id=1 AND state.schema_version=?`)
      .bind(MOO_SAFETY_SCHEMA_VERSION)
      .first<{ schema_version: number }>())
    .then((row) => {
      if (row?.schema_version !== MOO_SAFETY_SCHEMA_VERSION) throw new Error("MOO_SAFETY_SCHEMA_NOT_READY");
    })
    .catch((error) => {
      mooSafetyReadiness.delete(key);
      throw new MooSafetySchemaUnavailableError(error);
    });
  mooSafetyReadiness.set(key, pending);
  return pending;
}

/**
 * Explicit runtime bridge for the append-only ingestion schema. The checked-in
 * migration is authoritative; this write-path-only bridge lets an already
 * deployed Sites database converge without making any public GET mutate D1.
 */
export const marketPersistenceSchemaSql = [
  `CREATE TABLE IF NOT EXISTS market_source_state_events (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('CURRENT','STALE','MARKET_CLOSED','RECOVERING','UNAVAILABLE','ERROR')),
    entitlement TEXT NOT NULL CHECK (entitlement IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')),
    coverage TEXT NOT NULL,
    observed_at INTEGER,
    checked_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    connection_epoch TEXT,
    service_sequence INTEGER,
    detail_code TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS market_source_state_lookup_idx
    ON market_source_state_events (provider,feed,symbol,checked_at DESC)`,
  `CREATE TABLE IF NOT EXISTS market_qualified_observations (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    session_date TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('TRADE','QUOTE','OPENING_CROSS','INDICATIVE')),
    qualification TEXT NOT NULL CHECK (qualification IN ('RESEARCH','STRICT_EXECUTION')),
    entitlement TEXT NOT NULL CHECK (entitlement IN ('ENTITLED','NOT_ENTITLED','UNKNOWN')),
    coverage TEXT NOT NULL,
    price REAL NOT NULL,
    size REAL,
    provider_event_id TEXT,
    provider_time INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    connection_epoch TEXT NOT NULL,
    service_sequence INTEGER NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_observation_sequence_idx
    ON market_qualified_observations (provider,feed,symbol,connection_epoch,service_sequence)`,
  `CREATE INDEX IF NOT EXISTS market_observation_time_idx
    ON market_qualified_observations (symbol,session_date,provider_time DESC)`,
  `CREATE TABLE IF NOT EXISTS market_observation_invalidations (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    provider_trade_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('CORRECTION','CANCEL')),
    replacement_provider_trade_id TEXT,
    provider_time INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    connection_epoch TEXT NOT NULL,
    service_sequence INTEGER NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_observation_invalidation_sequence_idx
    ON market_observation_invalidations (provider,feed,symbol,connection_epoch,service_sequence)`,
  `CREATE INDEX IF NOT EXISTS market_observation_invalidation_lookup_idx
    ON market_observation_invalidations (provider,feed,symbol,provider_trade_id,available_at)`,
  `CREATE TABLE IF NOT EXISTS market_completed_minute_bars (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    session_date TEXT NOT NULL,
    minute_start INTEGER NOT NULL,
    minute_end INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    trade_count INTEGER,
    provider_time INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    connection_epoch TEXT NOT NULL,
    service_sequence INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    recovered INTEGER NOT NULL DEFAULT 0,
    payload_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    CHECK (minute_end = minute_start + 60000),
    CHECK (high >= low),
    CHECK (open BETWEEN low AND high),
    CHECK (close BETWEEN low AND high),
    CHECK (volume >= 0),
    CHECK (revision >= 0),
    CHECK (recovered IN (0,1))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_minute_revision_idx
    ON market_completed_minute_bars (provider,feed,symbol,minute_start,revision)`,
  `CREATE INDEX IF NOT EXISTS market_minute_lookup_idx
    ON market_completed_minute_bars (symbol,session_date,minute_start DESC)`,
  `CREATE TABLE IF NOT EXISTS market_session_snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    target_date TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    source_watermark_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    processed_at INTEGER NOT NULL,
    available_at INTEGER NOT NULL,
    quality_state TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_session_snapshot_watermark_idx
    ON market_session_snapshots (target_date,checkpoint,provider,feed,symbol,source_watermark_at)`,
  `CREATE INDEX IF NOT EXISTS market_session_snapshot_lookup_idx
    ON market_session_snapshots (target_date,captured_at DESC)`,
  `CREATE TABLE IF NOT EXISTS scheduler_runs (
    run_id TEXT PRIMARY KEY NOT NULL,
    job_key TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER NOT NULL,
    phase TEXT NOT NULL,
    checkpoint TEXT NOT NULL,
    status TEXT NOT NULL,
    target_date TEXT,
    transport_succeeded INTEGER NOT NULL,
    snapshot_succeeded INTEGER NOT NULL,
    freeze_succeeded INTEGER NOT NULL,
    detail_code TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL,
    CHECK (transport_succeeded IN (0,1)),
    CHECK (snapshot_succeeded IN (0,1)),
    CHECK (freeze_succeeded IN (0,1))
  )`,
  `CREATE INDEX IF NOT EXISTS scheduler_runs_scheduled_idx
    ON scheduler_runs (scheduled_at DESC)`,
  `CREATE INDEX IF NOT EXISTS scheduler_runs_job_idx
    ON scheduler_runs (job_key,completed_at DESC)`,
  `CREATE TABLE IF NOT EXISTS market_ingest_nonces (
    nonce TEXT PRIMARY KEY NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS market_ingest_nonces_expiry_idx
    ON market_ingest_nonces (expires_at)`,
  `CREATE TABLE IF NOT EXISTS market_stream_ingest_streams (
    stream_id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    feed TEXT NOT NULL,
    symbol TEXT NOT NULL,
    coverage_scope TEXT NOT NULL,
    research_only_required INTEGER NOT NULL CHECK (research_only_required IN (0,1)),
    execution_eligible_allowed INTEGER NOT NULL CHECK (execution_eligible_allowed IN (0,1)),
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS market_stream_ingest_emissions (
    stream_id TEXT NOT NULL,
    service_sequence INTEGER NOT NULL CHECK (service_sequence > 0),
    emission_id TEXT NOT NULL,
    connection_epoch INTEGER NOT NULL CHECK (connection_epoch >= 0),
    available_at INTEGER NOT NULL,
    payload_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_stream_emission_sequence_idx
    ON market_stream_ingest_emissions (stream_id,service_sequence)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS market_stream_emission_id_idx
    ON market_stream_ingest_emissions (emission_id)`,
  `CREATE INDEX IF NOT EXISTS market_stream_emission_available_idx
    ON market_stream_ingest_emissions (available_at)`,
  `CREATE TABLE IF NOT EXISTS market_stream_ingest_cursors (
    stream_id TEXT PRIMARY KEY NOT NULL,
    highest_contiguous_sequence INTEGER NOT NULL CHECK (highest_contiguous_sequence >= 0),
    updated_at INTEGER NOT NULL
  )`,
] as const;

export async function ensureMarketPersistenceSchema(database: D1Database) {
  await database.batch(
    marketPersistenceSchemaSql.map((sql) => database.prepare(sql)),
  );
}

const marketPersistenceSchemaReady = new WeakMap<object, Promise<void>>();

/** Converge a D1 binding once per isolate instead of running DDL on every hot-path write. */
export function ensureMarketPersistenceSchemaOnce(database: D1Database) {
  const key = database as unknown as object;
  const existing = marketPersistenceSchemaReady.get(key);
  if (existing) return existing;
  const pending = ensureMarketPersistenceSchema(database).catch((error) => {
    marketPersistenceSchemaReady.delete(key);
    throw error;
  });
  marketPersistenceSchemaReady.set(key, pending);
  return pending;
}

export class MarketIngestionSchemaUnavailableError extends Error {
  readonly code = "INGESTION_SCHEMA_UNAVAILABLE";
  readonly status = 503;

  constructor(cause?: unknown) {
    super("INGESTION_SCHEMA_UNAVAILABLE", cause === undefined ? undefined : { cause });
    this.name = "MarketIngestionSchemaUnavailableError";
  }
}

const receiverSchemaReady = new WeakMap<object, Promise<void>>();

/**
 * Read-only receiver gate. Production migrations must create the complete
 * contract before traffic reaches the authenticated ingestion hot path.
 */
export function requireMarketIngestionSchema(database: D1Database) {
  const key = database as unknown as object;
  const existing = receiverSchemaReady.get(key);
  if (existing) return existing;
  const pending = database.prepare(`SELECT
      source.id,observation.id,invalidation.id,minute.id,nonce.nonce,
      stream.stream_id,emission.payload_json,cursor.highest_contiguous_sequence
    FROM market_source_state_events AS source
    CROSS JOIN market_qualified_observations AS observation
    CROSS JOIN market_observation_invalidations AS invalidation
    CROSS JOIN market_completed_minute_bars AS minute
    CROSS JOIN market_ingest_nonces AS nonce
    CROSS JOIN market_stream_ingest_streams AS stream
    CROSS JOIN market_stream_ingest_emissions AS emission
    CROSS JOIN market_stream_ingest_cursors AS cursor
    WHERE 0`).first().then(() => undefined).catch((error) => {
      receiverSchemaReady.delete(key);
      throw new MarketIngestionSchemaUnavailableError(error);
    });
  receiverSchemaReady.set(key, pending);
  return pending;
}
