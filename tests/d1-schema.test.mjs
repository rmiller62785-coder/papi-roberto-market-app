import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ensureForecastSnapshotOutcomeColumns,
  ensureMarketPersistenceSchema,
  ensureMarketPersistenceSchemaOnce,
  ensureMooSafetySchemaOnce,
  marketPersistenceSchemaSql,
  requireMarketIngestionSchema,
  requireMooSafetySchema,
} from "../app/d1-schema.ts";

function sqliteD1(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async all() { return { results: statement.all(...bindings) }; },
        async first() { return statement.get(...bindings) ?? null; },
        async run() {
          const result = statement.run(...bindings);
          return { meta: { changes: Number(result.changes ?? 0) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

async function applyMigration(sqlite, tag) {
  const source = await readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8");
  for (const statement of source.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    sqlite.exec(statement);
  }
}

async function applyJournal(sqlite, options = {}) {
  const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    if (options.before0006 && entry.tag === "0006_live_market_state") await options.before0006();
    await applyMigration(sqlite, entry.tag);
  }
}

test("runtime D1 upgrade conditionally adds each missing research outcome column once", async () => {
  const columns = new Set(["id", "target_date", "adjusted_median"]);
  const alters = [];
  const database = {
    prepare(sql) {
      return {
        async all() {
          assert.match(sql, /PRAGMA table_info\(forecast_snapshots\)/i);
          return { results: [...columns].map((name) => ({ name })) };
        },
        async run() {
          const name = sql.match(/ADD COLUMN (\w+)/i)?.[1];
          assert.ok(name);
          assert.equal(columns.has(name), false, `${name} must be missing before ALTER`);
          columns.add(name);
          alters.push(sql);
          return { meta: { changes: 0 } };
        },
      };
    },
  };

  await ensureForecastSnapshotOutcomeColumns(database);
  await ensureForecastSnapshotOutcomeColumns(database);
  assert.deepEqual(
    [...columns].filter((name) => name.includes("minute") || name.includes("outcome")),
    ["first_minute_close", "first_minute_error", "outcome_captured_at"],
  );
  assert.equal(alters.length, 3, "a warm retry performs no duplicate ALTER");
});

test("both forecast and unattended scheduler paths invoke the runtime upgrade", async () => {
  const [forecastRoute, scheduledCapture] = await Promise.all([
    readFile(new URL("../app/api/forecast/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/scheduled-capture.ts", import.meta.url), "utf8"),
  ]);
  assert.match(forecastRoute, /await ensureForecastSnapshotOutcomeColumns\(d\)/);
  assert.match(scheduledCapture, /await ensureForecastSnapshotOutcomeColumns\(database\)/);
  assert.match(scheduledCapture, /await ensureMarketPersistenceSchema\(database\)/);
});

test("append-only market and scheduler tables converge through idempotent creates", async () => {
  const batches = [];
  const database = {
    prepare(sql) { return { sql }; },
    async batch(statements) {
      batches.push(statements.map((statement) => statement.sql));
      return statements.map(() => ({ meta: { changes: 0 } }));
    },
  };
  await ensureMarketPersistenceSchema(database);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, marketPersistenceSchemaSql.length);
  const schema = batches[0].join("\n");
  for (const table of [
    "market_source_state_events",
    "market_qualified_observations",
    "market_observation_invalidations",
    "market_completed_minute_bars",
    "market_session_snapshots",
    "scheduler_runs",
    "market_ingest_nonces",
    "market_stream_ingest_streams",
    "market_stream_ingest_emissions",
    "market_stream_ingest_cursors",
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(schema, /minute_end = minute_start \+ 60000/);
  assert.match(schema, /market_minute_revision_idx/);
  assert.match(schema, /session_date TEXT NOT NULL/);
  assert.match(schema, /market_ingest_nonces_expiry_idx/);
  assert.match(schema, /research_only_required/);
  assert.match(schema, /execution_eligible_allowed/);
  assert.match(schema, /market_observation_invalidation_lookup_idx/);
});

test("hot-path schema convergence is cached per D1 binding", async () => {
  let batches = 0;
  const database = {
    prepare(sql) { return { sql }; },
    async batch(statements) {
      batches += 1;
      return statements.map(() => ({ meta: { changes: 0 } }));
    },
  };
  await ensureMarketPersistenceSchemaOnce(database);
  await ensureMarketPersistenceSchemaOnce(database);
  assert.equal(batches, 1);
});

test("production receiver schema gate is cached and never executes DDL", async () => {
  let checks = 0;
  let ddl = 0;
  const database = {
    prepare(sql) {
      if (/^(?:CREATE|ALTER|DROP)\b/i.test(sql.trim())) ddl += 1;
      return { async first() { checks += 1; return null; } };
    },
  };
  await requireMarketIngestionSchema(database);
  await requireMarketIngestionSchema(database);
  assert.equal(checks, 1);
  assert.equal(ddl, 0);
});

test("a database rebuilt from the journal converges the omitted 0004 shape before public reads", async () => {
  const sqlite = new DatabaseSync(":memory:");
  await applyJournal(sqlite);
  const database = sqliteD1(sqlite);
  await assert.rejects(requireMooSafetySchema(database), /MOO_SAFETY_SCHEMA_UNAVAILABLE/);

  const weekendTick = Date.parse("2026-07-18T16:00:00Z");
  await ensureMooSafetySchemaOnce(database, weekendTick);
  await requireMooSafetySchema(database);

  const libraryColumns = new Set(sqlite.prepare("PRAGMA table_info(library_plans)").all().map((row) => row.name));
  const freezeColumns = new Set(sqlite.prepare("PRAGMA table_info(forecast_preopen_freezes)").all().map((row) => row.name));
  assert.equal(libraryColumns.has("strategy_kind"), true);
  assert.equal(libraryColumns.has("actual_open_source"), true);
  assert.equal(freezeColumns.has("actionable_cutoff_at"), true);
  assert.ok(sqlite.prepare("SELECT record_id FROM session_quarantine LIMIT 0"));
  assert.deepEqual(
    { ...sqlite.prepare("SELECT schema_version,ready_at FROM moo_safety_schema_state WHERE id=1").get() },
    { schema_version: 1, ready_at: weekendTick },
  );
  sqlite.close();
});

test("the controlled bridge is idempotent and preserves an already-upgraded production shape", async () => {
  const sqlite = new DatabaseSync(":memory:");
  await applyJournal(sqlite, {
    before0006: async () => {
      await applyMigration(sqlite, "0004_moo_phase1_safety");
      await applyMigration(sqlite, "0005_research_snapshot_outcomes");
      sqlite.prepare(`INSERT INTO library_plans (
        date,strategy_kind,signal,open_range_low,open_range_high,expected_move,confidence,rationale,
        actual_open,actual_open_source,created_at,updated_at
      ) VALUES ('2026-07-17','MOO_PLANNER','WAIT',100,101,1,0,'preserve',100.5,'NASDAQ_OFFICIAL_CROSS',1,2)`).run();
      sqlite.prepare("INSERT INTO forecast_preopen_freezes (target_date,frozen_at,actionable_cutoff_at,payload_json) VALUES ('2026-07-17',10,20,'{}')").run();
    },
  });
  const database = sqliteD1(sqlite);
  await requireMooSafetySchema(database);
  assert.equal(sqlite.prepare("SELECT ready_at FROM moo_safety_schema_state WHERE id=1").get().ready_at, 0);
  await ensureMooSafetySchemaOnce(database, 30);
  await ensureMooSafetySchemaOnce(database, 40);
  await requireMooSafetySchema(database);
  assert.deepEqual(
    { ...sqlite.prepare("SELECT strategy_kind,actual_open,actual_open_source FROM library_plans WHERE date='2026-07-17'").get() },
    { strategy_kind: "MOO_PLANNER", actual_open: 100.5, actual_open_source: "NASDAQ_OFFICIAL_CROSS" },
  );
  assert.deepEqual(
    { ...sqlite.prepare("SELECT frozen_at,actionable_cutoff_at,payload_json FROM forecast_preopen_freezes WHERE target_date='2026-07-17'").get() },
    { frozen_at: 10, actionable_cutoff_at: 20, payload_json: "{}" },
  );
  assert.equal(sqlite.prepare("SELECT ready_at FROM moo_safety_schema_state WHERE id=1").get().ready_at, 30);
  sqlite.close();
});

test("migration journal retains the drift bridge, safety readiness, and immutable model/archive ownership", async () => {
  const [journalText, migration, snapshotText, streamMigration, streamSnapshotText, safetyMigration, safetySnapshotText, modelArchiveMigration, modelArchiveSnapshotText, drizzleSchema] = await Promise.all([
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_live_market_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0006_snapshot.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_market_stream_ingestion.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0007_snapshot.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_moo_safety_schema_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0008_snapshot.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0009_moo_model_archive.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/0009_snapshot.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  const journal = JSON.parse(journalText);
  assert.equal(journal.entries.at(-1).tag, "0009_moo_model_archive");
  assert.equal(journal.entries.some((entry) => entry.tag === "0008_moo_safety_schema_state"), true);
  assert.equal(journal.entries.some((entry) => entry.tag.startsWith("0004_")), false);
  assert.equal(journal.entries.some((entry) => entry.tag.startsWith("0005_")), false);
  assert.match(migration, /Do not replay or rewrite those already-deployed migrations/);
  const snapshot = JSON.parse(snapshotText);
  for (const indexName of [
    "market_source_state_lookup_idx",
    "market_observation_sequence_idx",
    "market_minute_revision_idx",
    "market_session_snapshot_watermark_idx",
    "scheduler_runs_job_idx",
    "market_ingest_nonces_expiry_idx",
  ]) {
    assert.match(snapshotText, new RegExp(indexName));
    assert.match(drizzleSchema, new RegExp(indexName));
    assert.match(migration, new RegExp(indexName));
  }
  assert.ok(snapshot.tables.market_completed_minute_bars);
  assert.ok(snapshot.tables.market_qualified_observations);
  assert.ok(snapshot.tables.market_session_snapshots);
  const streamSnapshot = JSON.parse(streamSnapshotText);
  for (const tableName of [
    "market_stream_ingest_streams",
    "market_stream_ingest_emissions",
    "market_stream_ingest_cursors",
    "market_observation_invalidations",
  ]) {
    assert.ok(streamSnapshot.tables[tableName]);
    assert.match(streamMigration, new RegExp(tableName));
    assert.match(drizzleSchema, new RegExp(tableName));
  }
  assert.match(streamMigration, /research_only_required/);
  assert.match(streamMigration, /execution_eligible_allowed/);
  assert.match(safetyMigration, /CREATE TABLE `moo_safety_schema_state`/);
  assert.match(safetyMigration, /INSERT OR IGNORE INTO `moo_safety_schema_state`/);
  assert.ok(JSON.parse(safetySnapshotText).tables.moo_safety_schema_state);
  assert.match(drizzleSchema, /mooSafetySchemaState/);
  const modelArchiveSnapshot = JSON.parse(modelArchiveSnapshotText);
  for (const tableName of [
    "market_archive_segments", "moo_feature_snapshots", "moo_model_entries",
    "moo_model_promotion_events", "moo_decision_artifacts", "moo_decision_outcomes",
  ]) {
    assert.ok(modelArchiveSnapshot.tables[tableName]);
    assert.match(modelArchiveMigration, new RegExp(tableName));
    assert.match(drizzleSchema, new RegExp(tableName));
  }
  assert.match(modelArchiveMigration, /market_archive_stream_start_idx/);
});
