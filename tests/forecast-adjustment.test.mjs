import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateForecastContributions,
  applyForecastAdjustment,
} from "../app/forecast-adjustment.ts";

test("range-only geopolitical evidence widens the band without moving the median", () => {
  const adjustment = aggregateForecastContributions([
    { directionBps: 0, rangePct: 0.35, dedupeGroup: "geopolitical_event" },
  ]);
  const result = applyForecastAdjustment(
    { median: 200, low: 199, high: 201 },
    adjustment,
  );
  assert.equal(result.median, 200);
  assert.equal(result.low, 198.65);
  assert.equal(result.high, 201.35);
  assert.equal(result.shiftDollars, 0);
});

test("fresh signed market confirmation moves the expected-open median", () => {
  const adjustment = aggregateForecastContributions([
    { directionBps: -30, rangePct: 0.1, dedupeGroup: "overnight_futures" },
  ]);
  const result = applyForecastAdjustment(
    { median: 200, low: 199, high: 201 },
    adjustment,
  );
  assert.equal(result.median, 199.4);
  assert.equal(result.shiftDollars, -0.6);
});

test("correlated geopolitical news and Polymarket range effects use max, not sum", () => {
  const adjustment = aggregateForecastContributions([
    { directionBps: 0, rangePct: 0.35, dedupeGroup: "geopolitical_event" },
    { directionBps: 0, rangePct: 0.08, dedupeGroup: "geopolitical_event" },
  ]);
  assert.equal(adjustment.rangeExpansionPct, 0.35);
  assert.equal(adjustment.rangeMultiplier, 1.35);
});

test("an explicit negative research range weight can tighten but not collapse the band", () => {
  const adjustment = aggregateForecastContributions([
    { directionBps: 0, rangePct: -0.25, dedupeGroup: "manual_research" },
  ]);
  assert.equal(adjustment.rangeExpansionPct, -0.25);
  assert.equal(adjustment.rangeMultiplier, 0.75);
});

test("aggregate safety caps bound extreme manual hypotheses", () => {
  const result = aggregateForecastContributions([
    { directionBps: 900, rangePct: 7, dedupeGroup: "a" },
    { directionBps: 900, rangePct: 7, dedupeGroup: "b" },
  ]);
  assert.equal(result.directionBps, 100);
  assert.equal(result.rangeMultiplier, 3);
  assert.equal(result.safetyCapApplied, true);
  assert.equal(result.rawDirectionBps, 1800);
  assert.equal(result.rawRangeExpansionPct, 14);
});
