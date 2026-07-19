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
