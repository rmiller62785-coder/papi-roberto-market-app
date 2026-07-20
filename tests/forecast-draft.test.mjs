import assert from "node:assert/strict";
import test from "node:test";

import {
  clampWeightInput,
  forecastWeightsDiffer,
  reconcileForecastWeightEditor,
} from "../app/forecast-draft.ts";

const weight = (key, directionWeight = 10, rangeWeight = 0.2) => ({
  key,
  label: key,
  category: "test",
  enabled: true,
  directionWeight,
  rangeWeight,
  updatedAt: 1,
});

test("weight inputs are finite and clamped to the supported controls", () => {
  assert.equal(clampWeightInput(150, -100, 100, 4), 100);
  assert.equal(clampWeightInput(-1, 0, 2, 0.4), 0);
  assert.equal(clampWeightInput(Number.NaN, 0, 2, 0.4), 0.4);
});

test("forecast refresh preserves a dirty same-session draft", () => {
  const current = {
    targetDate: "2026-07-20",
    baseline: [weight("news")],
    weights: [weight("news", 25)],
  };
  const next = reconcileForecastWeightEditor(current, "2026-07-20", [weight("news", 12)]);
  assert.equal(next, current);
  assert.equal(forecastWeightsDiffer(next.weights, next.baseline), true);
});

test("forecast refresh discards drafts from an old target session", () => {
  const current = {
    targetDate: "2026-07-17",
    baseline: [weight("news")],
    weights: [weight("news", 25)],
  };
  const next = reconcileForecastWeightEditor(current, "2026-07-20", [weight("news", 12)]);
  assert.notEqual(next, current);
  assert.equal(next.targetDate, "2026-07-20");
  assert.equal(next.weights[0].directionWeight, 12);
  assert.equal(forecastWeightsDiffer(next.weights, next.baseline), false);
});
