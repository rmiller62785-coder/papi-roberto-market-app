import assert from "node:assert/strict";
import test from "node:test";

import { computeOpeningAnalysis } from "../app/opening-analysis.ts";

const alignedLongInput = {
  daily: [
    { high: 120, low: 100, close: 115 },
    { high: 122, low: 102, close: 117 },
    { high: 124, low: 104, close: 119 },
  ],
  previousClose: 114,
  referencePrice: 115,
  premarketHigh: 116,
  premarketLow: 112,
  premarketCurrent: 115,
  rangeLow: 90,
  lowerThird: 100,
  upperThird: 110,
  rangeHigh: 130,
  pivotLow: 105,
  pivotHigh: 108,
  ema9: 114,
  ema21: 113,
  ema9Slope: 0.5,
  historicalFirstMinuteRanges: [1, 1.2, 1.4, 1.1],
  historicalFirstMinuteVolumes: [100, 110, 120, 105],
  targetSessionEvidence: true,
};

test("a forming 9:30 candle cannot confirm or reject the setup", () => {
  const result = computeOpeningAnalysis({
    ...alignedLongInput,
    firstMinuteClose: 100,
    firstMinuteVolume: 1,
    firstMinuteComplete: false,
  });

  assert.equal(result.plan.status, "FORMING_931");
  assert.equal(result.plan.side, "LONG");
  assert.equal(result.plan.volumeRatio, null);
});

test("only a completed first-minute candle can confirm or reject", () => {
  const confirmed = computeOpeningAnalysis({
    ...alignedLongInput,
    firstMinuteClose: 116,
    firstMinuteVolume: 150,
    firstMinuteComplete: true,
  });
  const rejected = computeOpeningAnalysis({
    ...alignedLongInput,
    firstMinuteClose: 100,
    firstMinuteVolume: 150,
    firstMinuteComplete: true,
  });

  assert.equal(confirmed.plan.status, "CONFIRMED");
  assert.equal(confirmed.plan.side, "LONG");
  assert.equal(rejected.plan.status, "REJECTED");
  assert.equal(rejected.plan.side, "WAIT");
});

const datedGapHistory = [
  { date: "2026-07-01", open: 100, high: 102, low: 99, close: 101 },
  { date: "2026-07-02", open: 105, high: 107, low: 104, close: 106 },
  { date: "2026-07-03", open: 101, high: 104, low: 100, close: 102 },
  { date: "2026-07-06", open: 108, high: 110, low: 107, close: 109 },
  { date: "2026-07-07", open: 104, high: 106, low: 103, close: 105 },
  { date: "2026-07-08", open: 111, high: 113, low: 110, close: 112 },
];

test("a defensible historical overnight-gap sample widens the expected-open band", () => {
  const historical = computeOpeningAnalysis({
    ...alignedLongInput,
    targetDate: "2026-07-09",
    daily: datedGapHistory,
    premarketHigh: null,
    premarketLow: null,
  });
  const fallback = computeOpeningAnalysis({
    ...alignedLongInput,
    daily: datedGapHistory.map(({ high, low, close }) => ({ high, low, close })),
    premarketHigh: null,
    premarketLow: null,
  });

  assert.equal(historical.opening.historicalGapSample, 5);
  assert.equal(historical.opening.method, "HISTORICAL_OVERNIGHT_GAP");
  assert.ok(historical.opening.baseHalfWidth > fallback.opening.baseHalfWidth);
  assert.ok(historical.opening.high - historical.opening.low > fallback.opening.high - fallback.opening.low);
});

test("daily rows on or after the target session never enter opening calculations", () => {
  const baseline = computeOpeningAnalysis({
    ...alignedLongInput,
    targetDate: "2026-07-09",
    daily: datedGapHistory,
    premarketHigh: null,
    premarketLow: null,
  });
  const withFutureOutlier = computeOpeningAnalysis({
    ...alignedLongInput,
    targetDate: "2026-07-09",
    daily: [
      ...datedGapHistory,
      { date: "2026-07-09", open: 250, high: 300, low: 200, close: 275 },
      { date: "2026-07-10", open: 50, high: 400, low: 10, close: 350 },
    ],
    premarketHigh: null,
    premarketLow: null,
  });

  assert.deepEqual(withFutureOutlier.opening, baseline.opening);
  assert.deepEqual(withFutureOutlier.scalp, baseline.scalp);
});

test("the transparent daily-range fallback remains available without dated opens", () => {
  const result = computeOpeningAnalysis({
    ...alignedLongInput,
    premarketHigh: null,
    premarketLow: null,
  });

  assert.equal(result.opening.historicalGapSample, 0);
  assert.equal(result.opening.method, "DAILY_RANGE_FALLBACK");
  assert.ok(result.opening.baseHalfWidth > 0);
  assert.ok(result.opening.rationale.includes("at least 5 are required"));
  assert.ok(result.opening.low < result.opening.median);
  assert.ok(result.opening.high > result.opening.median);
});

test("prior-session structure cannot create a target-session order", () => {
  const result = computeOpeningAnalysis({
    ...alignedLongInput,
    targetSessionEvidence: false,
  });

  assert.equal(result.plan.side, "WAIT");
  assert.equal(result.plan.status, "INSUFFICIENT_TARGET_SESSION");
  assert.equal(result.plan.entry, null);
  assert.match(result.plan.evidence.join(" "), /position is forced to WAIT/i);
});

test("omitting target-session evidence fails closed", () => {
  const input = { ...alignedLongInput };
  delete input.targetSessionEvidence;
  const result = computeOpeningAnalysis(input);

  assert.equal(result.plan.side, "WAIT");
  assert.equal(result.plan.status, "INSUFFICIENT_TARGET_SESSION");
  assert.equal(result.plan.entry, null);
});

test("missing weekday sessions are not treated as overnight pairs", () => {
  const result = computeOpeningAnalysis({
    ...alignedLongInput,
    targetDate: "2026-07-16",
    daily: [
      { date: "2026-07-01", open: 100, high: 102, low: 99, close: 101 },
      { date: "2026-07-03", open: 105, high: 107, low: 104, close: 106 },
      { date: "2026-07-06", open: 107, high: 109, low: 106, close: 108 },
      { date: "2026-07-09", open: 110, high: 112, low: 109, close: 111 },
      { date: "2026-07-13", open: 112, high: 114, low: 111, close: 113 },
      { date: "2026-07-15", open: 114, high: 116, low: 113, close: 115 },
    ],
    premarketHigh: null,
    premarketLow: null,
  });

  // Only Friday-to-Monday is calendar-adjacent without an intervening weekday.
  assert.equal(result.opening.historicalGapSample, 1);
  assert.notEqual(result.opening.method, "HISTORICAL_OVERNIGHT_GAP");
  assert.equal(result.opening.coverageState, "UNCALIBRATED_PROXY");
});
