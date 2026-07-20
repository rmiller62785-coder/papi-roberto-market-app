import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  actionableMooFreezeAt,
  buildScheduledPreopenCapture,
  scheduledCaptureCheckpoint,
} from "../app/scheduled-capture.ts";
import { isNasdaqSessionDate } from "../app/market-session.ts";

const bar = (time, close) => ({
  time,
  open: close - 0.05,
  high: close + 0.1,
  low: close - 0.1,
  close,
  volume: 1_000,
});

function market(at) {
  const bars = Array.from({ length: 30 }, (_, index) =>
    bar(at - (30 - index) * 60_000, 200 + index * 0.03));
  return {
    targetDate: "2026-07-20",
    checkedAt: new Date(at).toISOString(),
    session: "PREMARKET",
    price: bars.at(-1).close,
    previousClose: 199.5,
    bars,
    analysisBars: bars,
    daily: [
      { date: "2026-07-14", high: 199, low: 195, close: 198 },
      { date: "2026-07-15", high: 201, low: 197, close: 200 },
      { date: "2026-07-16", high: 202, low: 198, close: 201 },
      { date: "2026-07-17", high: 203, low: 199, close: 200.5 },
    ],
    firstMinuteHistory: [
      { range: 0.5, volume: 10_000 },
      { range: 0.7, volume: 12_000 },
      { range: 0.6, volume: 11_000 },
    ],
    targetSession: { evidenceQualified: true },
    freshness: {
      quote: {
        observedAt: new Date(at).toISOString(),
        fetchedAt: new Date(at).toISOString(),
        stale: false,
      },
      history: {
        stale: false,
        fetchedAt: new Date(at).toISOString(),
        latestMinuteObservedAt: new Date(at - 60_000).toISOString(),
      },
    },
    premarket: { high: 201.2, low: 199.4, current: 200.8 },
    day: { open: null },
    firstMinute: { close: null, volume: 0, complete: false },
  };
}

const forecast = (at) => ({
  computedAt: at,
  methodology: { version: "open-research-v2", state: "RESEARCH_NOT_CALIBRATED" },
  flag: { updatedAt: at },
  adjustment: { directionBps: -10, rangeMultiplier: 1.25 },
  contributions: [],
});

test("the final scheduled checkpoint is 09:24 and 09:25-09:29 are monitoring-only", () => {
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:24:00Z")), "T-5M");
  for (let minute = 25; minute <= 29; minute += 1) {
    assert.equal(
      scheduledCaptureCheckpoint(Date.parse(`2026-07-20T13:${minute}:00Z`)),
      null,
    );
  }
});

test("09:24:30 ET is inclusive and any later evidence is rejected", () => {
  const freezeAt = actionableMooFreezeAt("2026-07-20");
  assert.equal(freezeAt, Date.parse("2026-07-20T13:24:30Z"));
  assert.ok(buildScheduledPreopenCapture(market(freezeAt), forecast(freezeAt), freezeAt));
  assert.equal(
    buildScheduledPreopenCapture(market(freezeAt + 1), forecast(freezeAt + 1), freezeAt + 1),
    null,
  );
});

test("scheduled legacy analysis cannot manufacture a MOO Library plan", () => {
  const freezeAt = actionableMooFreezeAt("2026-07-20");
  const capture = buildScheduledPreopenCapture(market(freezeAt), forecast(freezeAt), freezeAt);
  assert.ok(capture);
  assert.equal(capture.plan, null);
  assert.match(capture.snapshot.factorsJson, /NON_ACTIONABLE_UNTIL_A_SEPARATE_MOO_MODEL_IS_VALIDATED/);
});

test("weekends and known holidays are non-sessions and are quarantined by the Library contract", async () => {
  assert.equal(isNasdaqSessionDate("2026-07-18"), false);
  assert.equal(isNasdaqSessionDate("2026-07-03"), false);
  assert.equal(isNasdaqSessionDate("2026-07-20"), true);
  const libraryRoute = await readFile(new URL("../app/api/library/route.ts", import.meta.url), "utf8");
  assert.match(libraryRoute, /NOT_A_NASDAQ_SESSION/);
  assert.match(libraryRoute, /session_quarantine/);
  assert.match(libraryRoute, /WHERE NOT EXISTS/);
  assert.match(libraryRoute, /Future-dated outcomes are not allowed/);
});

test("forecast persistence enforces the hard cutoff and official-open provenance", async () => {
  const forecastRoute = await readFile(new URL("../app/api/forecast/route.ts", import.meta.url), "utf8");
  assert.match(forecastRoute, /excluded\.frozen_at <= excluded\.actionable_cutoff_at/);
  assert.match(forecastRoute, /MOO_LOCKED_MONITORING/);
  assert.match(forecastRoute, /NASDAQ_OFFICIAL_CROSS/);
});
