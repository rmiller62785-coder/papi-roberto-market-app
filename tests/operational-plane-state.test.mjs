import assert from "node:assert/strict";
import test from "node:test";

import {
  schedulerIssueCheckpoints,
  schedulerOperationalState,
  strictOperationalState,
} from "../app/operational-plane-state.ts";

function scheduler(overrides = {}) {
  return {
    status: "healthy",
    evaluatedAt: 1,
    lastAttemptAt: 1,
    lastTransportSuccessAt: 1,
    lastSnapshotSuccessAt: 1,
    lastFreezeSuccessAt: null,
    lastPreopenAt: 1,
    lastOutcomeAt: null,
    consecutiveFailures: 0,
    missedCheckpoints: [],
    stalledRuns: [],
    nextExpectedCheckpoint: null,
    lastRun: { checkpoint: "T-1H", status: "captured" },
    ...overrides,
  };
}

test("scheduler plane fails closed for missing, stalled, failed, and missed summaries", () => {
  assert.equal(schedulerOperationalState(null, true), "error");
  assert.equal(schedulerOperationalState(scheduler({ status: "stalled", stalledRuns: [{ checkpoint: "T-5M", status: "started" }] }), false), "error");
  assert.equal(schedulerOperationalState(scheduler({ status: "failed", lastRun: { checkpoint: "T-4H", status: "failed" } }), false), "error");
  assert.equal(schedulerOperationalState(scheduler({ status: "degraded", missedCheckpoints: ["T-30M"] }), false), "error");
  assert.deepEqual(
    schedulerIssueCheckpoints(scheduler({
      missedCheckpoints: ["T-30M"],
      stalledRuns: [{ checkpoint: "T-5M", status: "started" }],
      lastRun: { checkpoint: "T-4H", status: "failed" },
    })),
    ["T-30M", "T-5M", "T-4H"],
  );
});

test("scheduler running and first-run states never imply success", () => {
  assert.equal(schedulerOperationalState(scheduler({ status: "running" }), false), "loading");
  assert.equal(schedulerOperationalState(scheduler({ status: "awaiting_first_run" }), false), "loading");
  assert.equal(schedulerOperationalState(scheduler(), false), "ready");
});

test("Strict plane treats a complete no-edge result as healthy without requiring a side", () => {
  assert.equal(strictOperationalState({
    lifecycle: "PREOPEN",
    deliveryState: "live",
    gateReady: true,
    quoteState: "LIVE",
    streamState: "LIVE",
  }), "ready");
});

test("Strict lifecycle distinguishes future and closed sessions from commissioning errors", () => {
  assert.equal(strictOperationalState({
    lifecycle: "FUTURE_SESSION",
    deliveryState: "live",
    gateReady: false,
    quoteState: "UNAVAILABLE",
    streamState: "LIVE",
  }), "loading");
  assert.equal(strictOperationalState({
    lifecycle: "MARKET_CLOSED",
    deliveryState: "live",
    gateReady: false,
    quoteState: "CLOSED",
    streamState: "LIVE",
  }), "loading");
  assert.equal(strictOperationalState({
    lifecycle: "PREOPEN",
    deliveryState: "live",
    gateReady: false,
    quoteState: "LIVE",
    streamState: "LIVE",
  }), "error");
});
