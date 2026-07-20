import assert from "node:assert/strict";
import test from "node:test";

import {
  FORECAST_REQUEST_TIMEOUT_MS,
  MARKET_REQUEST_TIMEOUT_MS,
  MAX_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  canReuseMainForecast,
  forecastPollingIntervalMs,
  marketPollingIntervalMs,
  mooStatusPollingIntervalMs,
} from "../app/polling-policy.ts";

const context = (overrides = {}) => ({
  session: "MARKET OPEN",
  workflow: "confirmation",
  visibilityState: "visible",
  online: true,
  ...overrides,
});

test("market polling is adaptive across workflows and market sessions", () => {
  assert.equal(marketPollingIntervalMs(context({ workflow: "moo" })), 5_000);
  assert.equal(marketPollingIntervalMs(context()), 10_000);
  assert.equal(marketPollingIntervalMs(context({ session: "PREMARKET", workflow: "moo" })), 15_000);
  assert.equal(marketPollingIntervalMs(context({ session: "PREMARKET" })), 15_000);
  assert.equal(marketPollingIntervalMs(context({ session: "AFTER-HOURS" })), 60_000);
  assert.equal(marketPollingIntervalMs(context({ session: "CLOSED" })), 120_000);
  assert.equal(marketPollingIntervalMs(context({ session: undefined })), 120_000);
});

test("hidden and offline tabs back off market polling", () => {
  assert.equal(marketPollingIntervalMs(context({ workflow: "moo", visibilityState: "hidden" })), 60_000);
  assert.equal(marketPollingIntervalMs(context({ workflow: "moo", online: false })), 120_000);
  assert.equal(marketPollingIntervalMs(context({ session: "CLOSED", online: false })), 120_000);
});

test("forecast polling remains slower than quotes and backs off further", () => {
  assert.equal(forecastPollingIntervalMs(context({ workflow: "moo" })), 30_000);
  assert.equal(forecastPollingIntervalMs(context()), 60_000);
  assert.equal(forecastPollingIntervalMs(context({ session: "PREMARKET", workflow: "moo" })), 30_000);
  assert.equal(forecastPollingIntervalMs(context({ session: "PREMARKET" })), 60_000);
  assert.equal(forecastPollingIntervalMs(context({ session: "AFTER-HOURS" })), 120_000);
  assert.equal(forecastPollingIntervalMs(context({ session: "CLOSED" })), 120_000);
  assert.equal(forecastPollingIntervalMs(context({ workflow: "moo", visibilityState: "hidden" })), 120_000);
  assert.equal(forecastPollingIntervalMs(context({ workflow: "moo", online: false })), 300_000);
});

test("request watchdogs are explicit and endpoint-specific", () => {
  assert.equal(MARKET_REQUEST_TIMEOUT_MS, 12_000);
  assert.equal(FORECAST_REQUEST_TIMEOUT_MS, 20_000);
});

test("visible Strict status refreshes inside its 45-second validity window", () => {
  assert.equal(mooStatusPollingIntervalMs(context({ workflow: "moo" })), 30_000);
  assert.equal(mooStatusPollingIntervalMs(context({ visibilityState: "hidden" })), 120_000);
  assert.equal(mooStatusPollingIntervalMs(context({ online: false })), 300_000);
});

test("the strict forecast reuses the main response only for the same target", () => {
  assert.equal(canReuseMainForecast({
    mainTargetDate: "2026-07-20",
    strictTargetDate: "2026-07-20",
  }), true);
  assert.equal(canReuseMainForecast({
    mainTargetDate: "2026-07-20",
    strictTargetDate: "2026-07-21",
  }), false);
  assert.equal(canReuseMainForecast({
    mainTargetDate: "2026-07-20",
    strictTargetDate: null,
  }), false);
  assert.equal(canReuseMainForecast({
    mainTargetDate: undefined,
    strictTargetDate: undefined,
  }), false);
});

test("every policy result is finite, nonnegative, and bounded", () => {
  const sessions = ["MARKET OPEN", "PREMARKET", "AFTER-HOURS", "CLOSED", "UNAVAILABLE", null];
  const workflows = ["moo", "confirmation"];
  const visibilityStates = ["visible", "hidden"];
  const onlineStates = [true, false];

  for (const session of sessions) {
    for (const workflow of workflows) {
      for (const visibilityState of visibilityStates) {
        for (const online of onlineStates) {
          const input = { session, workflow, visibilityState, online };
          for (const interval of [
            marketPollingIntervalMs(input),
            forecastPollingIntervalMs(input),
            mooStatusPollingIntervalMs(input),
          ]) {
            assert.equal(Number.isFinite(interval), true);
            assert.ok(interval >= 0);
            assert.ok(interval >= MIN_POLL_INTERVAL_MS);
            assert.ok(interval <= MAX_POLL_INTERVAL_MS);
          }
        }
      }
    }
  }
});
