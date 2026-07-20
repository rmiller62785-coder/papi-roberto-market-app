import assert from "node:assert/strict";
import test from "node:test";
import { deriveResearchLean } from "../app/research-lean.ts";

const signed = (directionBps, overrides = {}) => ({
  key: "market_confirmation",
  label: "QQQ + semiconductor confirmation",
  enabled: true,
  applied: true,
  appliedDirectionBps: directionBps,
  appliedRangePct: 0.01,
  source: { status: "live" },
  ...overrides,
});

test("shows a long research lean only from fresh signed evidence", () => {
  const result = deriveResearchLean({ directionBps: 8, readiness: "DIRECTION_EVIDENCE_ACTIVE", contributions: [signed(8)] });
  assert.equal(result.side, "LONG_LEAN");
  assert.equal(result.state, "READY");
  assert.equal(result.signedDriverCount, 1);
});

test("shows a short research lean for a negative signed aggregate", () => {
  const result = deriveResearchLean({ directionBps: -4.5, readiness: "DIRECTION_EVIDENCE_ACTIVE", contributions: [signed(-4.5)] });
  assert.equal(result.side, "SHORT_LEAN");
  assert.equal(result.topDrivers[0].directionBps, -4.5);
});

test("preserves no edge below the signed threshold", () => {
  const result = deriveResearchLean({ directionBps: 0.49, readiness: "DIRECTION_EVIDENCE_ACTIVE", contributions: [signed(0.49)] });
  assert.equal(result.side, "NO_EDGE");
  assert.equal(result.state, "NO_SIGNAL");
});

test("range-only event evidence cannot manufacture direction", () => {
  const result = deriveResearchLean({
    directionBps: 12,
    readiness: "DEGRADED_RANGE_ONLY",
    contributions: [{ key: "prediction_market_repricing", label: "Polymarket", enabled: true, appliedRangePct: 0.2, appliedDirectionBps: 0, source: { status: "live" } }],
  });
  assert.equal(result.side, "NO_EDGE");
  assert.equal(result.state, "RANGE_ONLY");
  assert.equal(result.rangeOnlyDriverCount, 1);
});

test("a limited signed source cannot manufacture LONG or SHORT", () => {
  const result = deriveResearchLean({
    directionBps: 12,
    readiness: "DIRECTION_EVIDENCE_ACTIVE",
    contributions: [signed(12, { source: { status: "limited" } })],
  });
  assert.equal(result.side, "NO_EDGE");
  assert.equal(result.signedDriverCount, 0);
  assert.equal(result.state, "NO_SIGNAL");
});

test("stale, loading, and manual modes fail visibly closed", () => {
  assert.equal(deriveResearchLean({ directionBps: 10, readiness: "DIRECTION_EVIDENCE_ACTIVE", contributions: [signed(10)], stale: true }).state, "STALE");
  assert.equal(deriveResearchLean({ directionBps: 10, contributions: [signed(10)] }).state, "LOADING");
  assert.equal(deriveResearchLean({ directionBps: 10, readiness: "DIRECTION_EVIDENCE_ACTIVE", contributions: [signed(10)], manual: true }).state, "MANUAL");
});

test("offline signed sources are excluded and top drivers are magnitude ranked", () => {
  const result = deriveResearchLean({
    directionBps: -7,
    readiness: "DIRECTION_EVIDENCE_ACTIVE",
    contributions: [signed(3, { key: "small", label: "Small" }), signed(-10, { key: "large", label: "Large" }), signed(50, { key: "offline", label: "Offline", source: { status: "offline" } })],
  });
  assert.equal(result.side, "SHORT_LEAN");
  assert.equal(result.signedDriverCount, 2);
  assert.equal(result.topDrivers[0].key, "large");
});
