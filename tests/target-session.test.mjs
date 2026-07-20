import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTargetSession,
  defaultTargetSession,
  enumerateNearbyTargetSessions,
  validateTargetSession,
} from "../app/target-session.ts";

test("the default target is today's open session or the next valid Nasdaq session", () => {
  assert.equal(defaultTargetSession(Date.parse("2026-07-17T13:28:00Z")), "2026-07-17");
  assert.equal(defaultTargetSession(Date.parse("2026-07-17T13:28:00.001Z")), "2026-07-20");
  assert.equal(defaultTargetSession(Date.parse("2026-07-19T16:00:00Z")), "2026-07-20");
  assert.equal(defaultTargetSession(Date.parse("2026-07-03T16:00:00Z")), "2026-07-06");
});

test("early-close sessions roll to the next session at their actual close", () => {
  assert.equal(defaultTargetSession(Date.parse("2026-11-27T14:28:00Z")), "2026-11-27");
  assert.equal(defaultTargetSession(Date.parse("2026-11-27T14:28:00.001Z")), "2026-11-30");
});

test("selected dates are classified relative to New York market dates", () => {
  const sunday = Date.parse("2026-07-19T16:00:00Z");
  assert.equal(classifyTargetSession("2026-07-17", sunday), "PAST");
  assert.equal(classifyTargetSession("2026-07-20", sunday), "NEXT");
  assert.equal(classifyTargetSession("2026-07-21", sunday), "FUTURE");
  assert.equal(classifyTargetSession("2026-07-20", Date.parse("2026-07-20T12:00:00Z")), "CURRENT");
});

test("validation distinguishes malformed dates from weekends and holidays", () => {
  assert.deepEqual(validateTargetSession("2026-02-30"), {
    valid: false,
    date: "2026-02-30",
    reason: "INVALID_DATE",
  });
  assert.deepEqual(validateTargetSession("2026-07-19"), {
    valid: false,
    date: "2026-07-19",
    reason: "NON_TRADING_DAY",
  });
  assert.deepEqual(validateTargetSession("2026-07-03"), {
    valid: false,
    date: "2026-07-03",
    reason: "NON_TRADING_DAY",
  });
});

test("nearby options skip weekends and holidays and preserve the selected schedule", () => {
  const options = enumerateNearbyTargetSessions(Date.parse("2026-07-19T16:00:00Z"), {
    past: 2,
    future: 2,
  });
  assert.deepEqual(options.map((option) => option.date), [
    "2026-07-16",
    "2026-07-17",
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
  ]);
  assert.equal(options.find((option) => option.isDefault)?.date, "2026-07-20");
  assert.deepEqual(options.map((option) => option.relation), ["PAST", "PAST", "NEXT", "FUTURE", "FUTURE"]);
});

test("option schedules remain correct across early closes and DST boundaries", () => {
  const thanksgiving = enumerateNearbyTargetSessions(Date.parse("2026-11-26T17:00:00Z"), {
    past: 0,
    future: 0,
  })[0];
  assert.equal(thanksgiving.date, "2026-11-27");
  assert.equal(thanksgiving.earlyClose, true);
  assert.equal(thanksgiving.regularOpenAt, Date.parse("2026-11-27T14:30:00Z"));

  const spring = enumerateNearbyTargetSessions(Date.parse("2026-03-08T16:00:00Z"), { past: 0, future: 0 })[0];
  const autumn = enumerateNearbyTargetSessions(Date.parse("2026-11-01T17:00:00Z"), { past: 0, future: 0 })[0];
  assert.equal(spring.regularOpenAt, Date.parse("2026-03-09T13:30:00Z"));
  assert.equal(autumn.regularOpenAt, Date.parse("2026-11-02T14:30:00Z"));
});
