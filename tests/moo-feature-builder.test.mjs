import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMooFeatureSnapshot,
  selectCompletedMinuteBarsAsOf,
  selectLatestQualifiedObservationAsOf,
} from "../app/moo-feature-builder.ts";
import { validateMooFeatureSnapshot } from "../app/moo-feature-snapshot.ts";

const targetSession = "2026-07-21";
const asOf = Date.parse("2026-07-21T13:24:20Z");
const openingCrossAt = Date.parse("2026-07-21T13:30:00Z");

function definition(overrides = {}) {
  return {
    name: "usLastCents",
    maximumAgeMs: 2_000,
    manifest: {
      scalarType: "NUMBER",
      required: true,
      sourceId: "US",
      requiredEntitlement: "REALTIME",
      requiredCoverage: "CONSOLIDATED_SIP",
      sessionBinding: "TARGET_SESSION",
      expectedSession: null,
      availabilityClass: "PREDICTION_INPUT",
    },
    ...overrides,
  };
}

function candidate(overrides = {}) {
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

function build(overrides = {}) {
  return buildMooFeatureSnapshot({
    featureSchemaVersion: "nvda-open-features-v1",
    snapshotId: "features-2026-07-21-t5",
    targetSession,
    asOf,
    capturedAt: asOf + 1,
    openingCrossAt,
    definitions: [definition()],
    candidates: { usLastCents: candidate() },
    ...overrides,
  });
}

test("the builder seals qualified exact-SIP evidence with its true availability watermark", () => {
  const result = build();
  assert.equal(result.snapshot.state, "QUALIFIED");
  assert.equal(result.snapshot.quality.score, 100);
  assert.equal(result.snapshot.maximumAvailableAt, asOf - 300);
  assert.deepEqual(validateMooFeatureSnapshot(result.snapshot), { valid: true, errors: [] });
  assert.equal(Object.isFrozen(result.snapshot.fields.usLastCents.provenance.timestamps), true);
});

test("IEX substitution and post-as-of evidence are rejected without retaining their values", () => {
  const iex = candidate({ provenance: { ...candidate().provenance, coverage: "IEX_SINGLE_EXCHANGE" } });
  const substituted = build({ candidates: { usLastCents: iex } });
  assert.equal(substituted.snapshot.state, "REJECTED");
  assert.equal(substituted.snapshot.fields.usLastCents.value, null);
  assert.ok(substituted.diagnostics.includes("PROVENANCE_POLICY_MISMATCH:usLastCents"));

  const late = candidate({ provenance: { ...candidate().provenance, timestamps: { ...candidate().provenance.timestamps, availableAt: asOf + 1 } } });
  const future = build({ candidates: { usLastCents: late } });
  assert.equal(future.snapshot.state, "REJECTED");
  assert.equal(future.snapshot.maximumAvailableAt, null);
  assert.ok(future.diagnostics.includes("TIMESTAMP_POLICY_FAILED:usLastCents"));
});

test("missing data stays partial and stale last-good data cannot qualify", () => {
  const missing = build({ candidates: {} });
  assert.equal(missing.snapshot.state, "PARTIAL");
  assert.equal(missing.snapshot.quality.state, "UNAVAILABLE");
  assert.equal(missing.snapshot.fields.usLastCents.value, null);

  const staleCandidate = candidate({ provenance: { ...candidate().provenance, timestamps: { ...candidate().provenance.timestamps, sourceAt: asOf - 10_000 } } });
  const stale = build({ candidates: { usLastCents: staleCandidate } });
  assert.equal(stale.snapshot.state, "REJECTED");
  assert.equal(stale.snapshot.fields.usLastCents.state, "STALE");
  assert.equal(stale.snapshot.fields.usLastCents.value, null);
  assert.equal(stale.snapshot.fields.usLastCents.lastGoodValue, 20_250);
});

test("official-opening outcomes cannot leak into a pre-cross feature snapshot", () => {
  const official = definition({
    name: "officialOpenCents",
    manifest: { ...definition().manifest, availabilityClass: "OUTCOME_ONLY" },
  });
  const result = build({ definitions: [official], candidates: { officialOpenCents: candidate() } });
  assert.equal(result.snapshot.state, "REJECTED");
  assert.equal(result.snapshot.fields.officialOpenCents.value, null);
  assert.ok(result.diagnostics.includes("OUTCOME_LEAKAGE:officialOpenCents"));
});

function observation(sequence, overrides = {}) {
  return {
    id: `observation-${sequence}`,
    provider: "alpaca",
    feed: "sip",
    symbol: "NVDA",
    sessionDate: targetSession,
    kind: "QUOTE",
    qualification: "STRICT_EXECUTION",
    entitlement: "ENTITLED",
    coverage: "CONSOLIDATED_SIP",
    price: 202 + sequence / 100,
    size: 20,
    providerEventId: null,
    providerTime: asOf - 1_000 + sequence,
    receivedAt: asOf - 900 + sequence,
    processedAt: asOf - 800 + sequence,
    availableAt: asOf - 700 + sequence,
    connectionEpoch: "4",
    serviceSequence: sequence,
    payloadHash: "a".repeat(64),
    createdAt: asOf,
    ...overrides,
  };
}

test("as-of selectors keep exact feeds separate and select completed highest revisions", () => {
  const selected = selectLatestQualifiedObservationAsOf([
    observation(1),
    observation(2, { feed: "iex", coverage: "IEX_SINGLE_EXCHANGE", qualification: "RESEARCH" }),
    observation(3, { availableAt: asOf + 1 }),
  ], { targetSession, asOf, provider: "alpaca", feed: "sip", qualification: "STRICT_EXECUTION", coverage: "CONSOLIDATED_SIP" });
  assert.equal(selected.serviceSequence, 1);

  const minuteStart = asOf - 5 * 60_000;
  const bar = (revision, overrides = {}) => ({
    id: `bar-${revision}`, provider: "alpaca", feed: "sip", symbol: "NVDA", sessionDate: targetSession,
    minuteStart, minuteEnd: minuteStart + 60_000, open: 201, high: 202, low: 200, close: 201.5,
    volume: 1_000, tradeCount: 10, providerTime: minuteStart + 60_000,
    receivedAt: minuteStart + 60_001, processedAt: minuteStart + 60_002, availableAt: minuteStart + 60_002,
    connectionEpoch: "4", serviceSequence: 10 + revision, revision, recovered: false,
    payloadHash: "b".repeat(64), createdAt: asOf, ...overrides,
  });
  const bars = selectCompletedMinuteBarsAsOf([
    bar(0), bar(1, { close: 201.6 }), bar(2, { availableAt: asOf + 1 }),
    bar(3, { receivedAt: asOf + 1 }), bar(4, { processedAt: asOf + 1 }),
    bar(5, { feed: "iex" }), bar(6, { minuteEnd: asOf + 60_000 }),
    bar(7, { receivedAt: minuteStart + 60_003, processedAt: minuteStart + 60_002 }),
    bar(8, { processedAt: minuteStart + 60_003, availableAt: minuteStart + 60_002 }),
  ], { targetSession, asOf, provider: "alpaca", feed: "sip" });
  assert.equal(bars.length, 1);
  assert.equal(bars[0].revision, 1);
  assert.equal(bars[0].close, 201.6);
});
