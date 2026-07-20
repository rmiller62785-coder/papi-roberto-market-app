const snapshotOutcomeColumns = [
  ["first_minute_close", "REAL"],
  ["first_minute_error", "REAL"],
  ["outcome_captured_at", "INTEGER"],
] as const;

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
