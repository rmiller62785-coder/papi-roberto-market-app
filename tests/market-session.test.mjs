import assert from "node:assert/strict";
import test from "node:test";

import {
  isNasdaqEarlyClose,
  isNasdaqHoliday,
  isNasdaqSessionDate,
  mooDeadlines,
  mooLifecycleAt,
  nasdaqSessionSchedule,
  newYorkWallTimeUtc,
  nextNasdaqSession,
  previousNasdaqSession,
} from "../app/market-session.ts";

test("2026 Nasdaq holidays and early closes match the published calendar", () => {
  for (const date of [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
    "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
    "2026-11-26", "2026-12-25",
  ]) {
    assert.equal(isNasdaqHoliday(date), true, date);
    assert.equal(isNasdaqSessionDate(date), false, date);
  }
  assert.equal(isNasdaqEarlyClose("2026-11-27"), true);
  assert.equal(isNasdaqEarlyClose("2026-12-24"), true);
  assert.equal(isNasdaqEarlyClose("2026-07-02"), false);
  assert.equal(nasdaqSessionSchedule("2026-11-27").regularCloseAt, Date.parse("2026-11-27T18:00:00Z"));
});

test("next and previous session traversal excludes weekends and holidays", () => {
  assert.equal(nextNasdaqSession("2026-07-03"), "2026-07-06");
  assert.equal(previousNasdaqSession("2026-07-05"), "2026-07-02");
  assert.equal(nextNasdaqSession("2026-07-02"), "2026-07-02");
  assert.equal(nextNasdaqSession("2026-07-02", { inclusive: false }), "2026-07-06");
  assert.equal(previousNasdaqSession("2026-07-06", { inclusive: false }), "2026-07-02");
});

test("New York wall-clock conversion is DST safe", () => {
  assert.equal(newYorkWallTimeUtc("2026-07-20", 9, 24, 30), Date.parse("2026-07-20T13:24:30Z"));
  assert.equal(newYorkWallTimeUtc("2026-01-20", 9, 24, 30), Date.parse("2026-01-20T14:24:30Z"));
  assert.equal(newYorkWallTimeUtc("2026-03-09", 9, 30), Date.parse("2026-03-09T13:30:00Z"));
  assert.equal(newYorkWallTimeUtc("2026-11-02", 9, 30), Date.parse("2026-11-02T14:30:00Z"));
});

test("MOO lifecycle has separate freeze, modify/cancel, entry, and Cross states", () => {
  const at = (time) => Date.parse(`2026-07-20T${time}Z`);
  assert.equal(mooLifecycleAt("2026-07-20", at("07:59:59")), "PREPARING");
  assert.equal(mooLifecycleAt("2026-07-20", at("13:24:29")), "READY");
  assert.equal(mooLifecycleAt("2026-07-20", at("13:24:30")), "FROZEN");
  assert.equal(mooLifecycleAt("2026-07-20", at("13:25:00")), "LATE_LOCKED");
  assert.equal(mooLifecycleAt("2026-07-20", at("13:28:00")), "ENTRY_CLOSED");
  assert.equal(mooLifecycleAt("2026-07-20", at("13:30:00")), "CROSS_COMPLETE");
  assert.equal(mooLifecycleAt("2026-07-20", Date.parse("2026-07-19T22:00:00Z")), "MARKET_CLOSED");
});

test("deadline objects preserve exact Nasdaq timing", () => {
  const now = Date.parse("2026-07-20T13:24:45Z");
  const deadlines = mooDeadlines("2026-07-20", now);
  assert.deepEqual(deadlines.map(({ label, passed }) => [label, passed]), [
    ["DECISION_FREEZE", true],
    ["MODIFY_CANCEL", false],
    ["FINAL_ENTRY", false],
  ]);
  assert.equal(deadlines[1].remainingMs, 15_000);
  assert.equal(deadlines[2].remainingMs, 195_000);
});

