import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHEDULED_ARCHIVE_MAXIMUM_ROWS,
  shouldRunScheduledArchiveMaintenance,
} from "../app/archive-maintenance.ts";

test("archive maintenance stays outside the live and checkpoint window", () => {
  assert.equal(SCHEDULED_ARCHIVE_MAXIMUM_ROWS, 500);
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-23T00:04:00Z")), false); // 20:04 ET
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-23T00:05:00Z")), true); // 20:05 ET
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-23T07:59:00Z")), true); // 03:59 ET
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-23T08:00:00Z")), false); // 04:00 ET
});

test("archive admission follows Eastern time across both daylight-saving transitions", () => {
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-03-08T07:30:00Z")), true); // 03:30 EDT
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-03-08T08:00:00Z")), false); // 04:00 EDT
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-11-01T08:30:00Z")), true); // 03:30 EST
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-11-01T09:00:00Z")), false); // 04:00 EST
});

test("archive admission remains deterministic on weekends and holidays", () => {
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-04T01:00:00Z")), true); // Friday 21:00 ET
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-07-04T14:00:00Z")), false); // Saturday 10:00 ET
  assert.equal(shouldRunScheduledArchiveMaintenance(Date.parse("2026-12-25T02:00:00Z")), true); // Christmas 21:00 ET
});
