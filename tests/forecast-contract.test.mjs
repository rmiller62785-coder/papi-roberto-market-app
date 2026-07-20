import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
    polymarket: { signalState: "active", rangeSignal: 0.07 },
    germanMarket: { signalState: "active", rangeSignal: 0.12, strictEligible: false },
    computedAt: 123,
  };

  const research = asNonActionableResearchForecast(live);
  assert.equal(research.adjustment.rangeMultiplier, 1.35);
  assert.equal(research.contributions[0].appliedRangePct, 0.35);
  assert.equal(research.methodology.actionable, false);
  assert.equal(research.methodology.decisionUse, "NON_ACTIONABLE_RESEARCH");
  assert.equal(research.polymarket.rangeSignal, 0.07);
  assert.equal(research.germanMarket.strictEligible, false);
  assert.equal(live.methodology.actionable, undefined, "the immutable source block is not mutated");
});

test("persisted and served external-evidence blocks are explicitly non-actionable", async () => {
  const route = await readFile(new URL("../app/api/forecast/route.ts", import.meta.url), "utf8");
  assert.match(route, /const liveForecastBlock = asNonActionableResearchForecast\(\{/);
  assert.match(route, /JSON\.stringify\(liveForecastBlock\)/);
  assert.match(route, /servedForecastBlock = asNonActionableResearchForecast\(\{/);
  assert.match(route, /\.\.\.liveForecastBlock\.methodology/);
  assert.match(route, /actionable: false as const/);
  assert.match(route, /decisionUse: "NON_ACTIONABLE_RESEARCH" as const/);
});
