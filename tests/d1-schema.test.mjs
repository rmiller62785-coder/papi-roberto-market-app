import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ensureForecastSnapshotOutcomeColumns } from "../app/d1-schema.ts";

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
});
