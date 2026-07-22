import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMooDataQuality, MOO_DATA_QUALITY_SCORING_VERSION } from "../app/moo-data-quality.ts";

const targetSession = "2026-07-21";
const asOf = Date.parse("2026-07-21T13:24:20Z");
const openingCrossAt = Date.parse("2026-07-21T13:30:00Z");

function manifest(overrides = {}) {
  return {
    scalarType: "NUMBER",
    required: true,
    sourceId: "US",
    requiredEntitlement: "REALTIME",
    requiredCoverage: "CONSOLIDATED_SIP",
    sessionBinding: "TARGET_SESSION",
    expectedSession: null,
    availabilityClass: "PREDICTION_INPUT",
    ...overrides,
  };
}

function field(overrides = {}) {
  return {
    value: 20_250,
    state: "AVAILABLE",
    reasonCode: "VALUE_PRESENT",
    provenance: {
      sourceId: "US",
      provider: "Alpaca",
      venue: "SIP",
      entitlement: "REALTIME",
      coverage: "CONSOLIDATED_SIP",
      sessionDate: targetSession,
      timestamps: {
        sourceAt: asOf - 500,
        receivedAt: asOf - 400,
        processedAt: asOf - 300,
        availableAt: asOf - 300,
        checkedAt: asOf - 200,
        validUntil: asOf + 1_000,
      },
    },
    ...overrides,
  };
}

function evaluate(fields) {
  return evaluateMooDataQuality({ targetSession, asOf, openingCrossAt, fields });
}

test("complete exact-source point-in-time evidence receives a deterministic passing score", () => {
  const result = evaluate([{ name: "usLastCents", manifest: manifest(), field: field(), maximumAgeMs: 2_000 }]);
  assert.equal(result.quality.state, "PASS");
  assert.equal(result.quality.score, 100);
  assert.equal(result.quality.scoringVersion, MOO_DATA_QUALITY_SCORING_VERSION);
  assert.deepEqual(result.invalidFields, []);
});

test("no required observation is unavailable rather than a fabricated zero-quality score", () => {
  const result = evaluate([{
    name: "usLastCents",
    manifest: manifest(),
    field: field({ value: null, state: "UNAVAILABLE", reasonCode: "SOURCE_UNAVAILABLE" }),
  }]);
  assert.equal(result.quality.state, "UNAVAILABLE");
  assert.equal(result.quality.score, null);
  assert.ok(result.quality.reasonCodes.includes("REQUIRED_FEATURE_SET_INCOMPLETE"));
});

test("stale required evidence fails and optional absence cannot compensate for it", () => {
  const result = evaluate([
    { name: "usLastCents", manifest: manifest(), field: field({ value: null, state: "STALE", reasonCode: "SOURCE_STALE" }) },
    { name: "optionalFx", manifest: manifest({ required: false, sourceId: "FX", requiredEntitlement: null, requiredCoverage: null }), field: field({ value: null, state: "UNAVAILABLE", reasonCode: "SOURCE_UNAVAILABLE" }) },
  ]);
  assert.equal(result.quality.state, "FAIL");
  assert.deepEqual(result.invalidFields, ["usLastCents"]);
  assert.ok(result.quality.reasonCodes.some((reason) => reason.includes("STALE")));
});

test("wrong coverage and post-as-of availability are hard failures", () => {
  const wrongCoverage = field({ provenance: { ...field().provenance, coverage: "IEX_SINGLE_EXCHANGE" } });
  const late = field({ provenance: { ...field().provenance, timestamps: { ...field().provenance.timestamps, availableAt: asOf + 1 } } });
  const result = evaluate([
    { name: "coverage", manifest: manifest(), field: wrongCoverage },
    { name: "late", manifest: manifest(), field: late },
  ]);
  assert.equal(result.quality.state, "FAIL");
  assert.deepEqual(result.invalidFields, ["coverage", "late"]);
  assert.ok(result.quality.reasonCodes.includes("PROVENANCE_POLICY_MISMATCH:coverage"));
  assert.ok(result.quality.reasonCodes.includes("TIMESTAMP_POLICY_FAILED:late"));
});

test("outcome semantics cannot enter a pre-cross quality-passing feature set", () => {
  const result = evaluate([{
    name: "officialOpenCents",
    manifest: manifest({ availabilityClass: "OUTCOME_ONLY" }),
    field: field(),
  }]);
  assert.equal(result.quality.state, "FAIL");
  assert.ok(result.quality.reasonCodes.includes("OUTCOME_LEAKAGE:officialOpenCents"));
});
