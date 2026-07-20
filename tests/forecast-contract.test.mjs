import assert from "node:assert/strict";
import test from "node:test";

import { asNonActionableResearchForecast } from "../app/forecast-contract.ts";

test("live research remains unzeroed while being explicitly non-actionable", () => {
  const live = {
    weights: [{ key: "geopolitical", rangeWeight: 0.35 }],
    contributions: [{ key: "geopolitical", appliedRangePct: 0.35, applied: true }],
    adjustment: { directionBps: 0, rangeMultiplier: 1.35 },
    methodology: { version: "open-research-v2", state: "RESEARCH_NOT_CALIBRATED" },
    flag: { level: "HIGH", score: 60 },
    marketContext: { available: false },
    overnightContext: { available: false },
    polymarket: { signalState: "neutral" },
    computedAt: 123,
  };

  const research = asNonActionableResearchForecast(live);
  assert.equal(research.adjustment.rangeMultiplier, 1.35);
  assert.equal(research.contributions[0].appliedRangePct, 0.35);
  assert.equal(research.methodology.actionable, false);
  assert.equal(research.methodology.decisionUse, "NON_ACTIONABLE_RESEARCH");
  assert.equal(live.methodology.actionable, undefined, "the immutable source block is not mutated");
});
