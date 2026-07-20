import assert from "node:assert/strict";
import test from "node:test";

import {
  freezeMooFeatureSnapshot,
  mooFeatureSnapshotQualified,
  sealMooFeatureSnapshot,
  validateMooFeatureSnapshot,
} from "../app/moo-feature-snapshot.ts";

const asOf = Date.parse("2026-07-20T13:24:20Z");
const openingCrossAt = Date.parse("2026-07-20T13:30:00Z");

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

function field(value, overrides = {}) {
  return {
    value,
    state: "AVAILABLE",
    reasonCode: "VALUE_PRESENT",
    provenance: {
      sourceId: "US",
      provider: "fixture",
      venue: "SIP",
      entitlement: "REALTIME",
      coverage: "CONSOLIDATED_SIP",
      sessionDate: "2026-07-20",
      timestamps: {
        sourceAt: asOf - 1_000,
        receivedAt: asOf - 900,
        processedAt: asOf - 800,
        availableAt: asOf - 800,
        checkedAt: asOf - 700,
        validUntil: asOf + 2_000,
      },
    },
    ...overrides,
  };
}

function snapshotInput(overrides = {}) {
  return {
    schemaVersion: "moo-feature-snapshot-v1",
    featureSchemaVersion: "features-v1",
    snapshotId: "features-2026-07-20-t5",
    targetSession: "2026-07-20",
    asOf,
    capturedAt: asOf + 1,
    openingCrossAt,
    maximumAvailableAt: asOf - 800,
    state: "QUALIFIED",
    manifest: {
      usLastCents: manifest(),
      premarketRangeCents: manifest(),
    },
    fields: {
      usLastCents: field(20_265),
      premarketRangeCents: field(169),
    },
    quality: { state: "PASS", score: 94, threshold: 80, scoringVersion: "quality-v1", reasonCodes: [] },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return sealMooFeatureSnapshot(snapshotInput(overrides));
}

test("a qualified feature snapshot validates its runtime manifest and full provenance", () => {
  const value = snapshot();
  assert.deepEqual(validateMooFeatureSnapshot(value), { valid: true, errors: [] });
  assert.equal(mooFeatureSnapshotQualified(value), true);
});

test("post-as-of values, entitlement substitution, and scalar-type drift fail closed", () => {
  const postAsOf = snapshotInput({
    fields: { usLastCents: field(20_265, { provenance: { ...field(20_265).provenance, timestamps: { ...field(20_265).provenance.timestamps, availableAt: asOf + 1 } } }), premarketRangeCents: field(169) },
  });
  postAsOf.contentHash = "sha256:" + "0".repeat(64);
  assert.ok(validateMooFeatureSnapshot(postAsOf).errors.includes("FIELD_POST_ASOF:usLastCents:availableAt"));

  const substituted = snapshotInput({
    fields: { usLastCents: field(20_265, { provenance: { ...field(20_265).provenance, coverage: "IEX_SINGLE_EXCHANGE" } }), premarketRangeCents: field("169") },
  });
  substituted.contentHash = "sha256:" + "0".repeat(64);
  const errors = validateMooFeatureSnapshot(substituted).errors;
  assert.ok(errors.includes("FIELD_COVERAGE_MISMATCH:usLastCents"));
  assert.ok(errors.includes("FIELD_SCALAR_TYPE_MISMATCH:premarketRangeCents"));
});

test("runtime objects and arrays cannot masquerade as BOOLEAN scalars", () => {
  const value = snapshotInput({
    manifest: { flag: manifest({ scalarType: "BOOLEAN" }) },
    fields: { flag: field({ not: "a scalar" }) },
  });
  value.contentHash = "sha256:" + "0".repeat(64);
  const errors = validateMooFeatureSnapshot(value).errors;
  assert.ok(errors.includes("FIELD_VALUE_NOT_SCALAR:flag"));
  assert.ok(errors.includes("FIELD_SCALAR_TYPE_MISMATCH:flag"));
});

test("partial captures remain auditable but cannot masquerade as qualified", () => {
  const input = snapshotInput({
    state: "PARTIAL",
    maximumAvailableAt: asOf - 800,
    fields: {
      usLastCents: field(null, {
        state: "NOT_ENTITLED",
        reasonCode: "SOURCE_NOT_ENTITLED",
        provenance: { ...field(null).provenance, entitlement: "NOT_ENTITLED", coverage: null },
      }),
      premarketRangeCents: field(169),
    },
    quality: { state: "FAIL", score: 0, threshold: 80, scoringVersion: "quality-v1", reasonCodes: ["US_NOT_ENTITLED"] },
  });
  // Only the ready field contributes to maximumAvailableAt.
  const value = sealMooFeatureSnapshot(input);
  assert.equal(validateMooFeatureSnapshot(value).valid, true);
  assert.equal(mooFeatureSnapshotQualified(value), false);
});

test("official-open outcome features cannot enter a pre-cross prediction snapshot", () => {
  const input = snapshotInput({
    manifest: { officialOpenCents: manifest({ availabilityClass: "OUTCOME_ONLY" }) },
    fields: { officialOpenCents: field(20_270) },
  });
  input.contentHash = "sha256:" + "0".repeat(64);
  assert.ok(validateMooFeatureSnapshot(input).errors.includes("OUTCOME_FEATURE_BEFORE_OPENING_CROSS:officialOpenCents"));
  assert.throws(() => sealMooFeatureSnapshot(snapshotInput({
    manifest: { officialOpenCents: manifest({ availabilityClass: "OUTCOME_ONLY" }) },
    fields: { officialOpenCents: field(20_270) },
  })), /OUTCOME_FEATURE_BEFORE_OPENING_CROSS/);

  const mislabeled = snapshotInput({
    manifest: { actualOfficialOpenCents: manifest({ availabilityClass: "PREDICTION_INPUT" }) },
    fields: { actualOfficialOpenCents: field(20_270) },
  });
  mislabeled.contentHash = "sha256:" + "0".repeat(64);
  assert.ok(validateMooFeatureSnapshot(mislabeled).errors.includes("OUTCOME_FEATURE_BEFORE_OPENING_CROSS:actualOfficialOpenCents"));
});

test("canonical hashes detect nested tampering and validated snapshots are deeply frozen", () => {
  const value = snapshot();
  assert.equal(Object.isFrozen(value.fields.usLastCents.provenance.timestamps), true);
  assert.throws(() => { value.fields.usLastCents.value = 1; }, TypeError);

  const mutable = structuredClone(value);
  mutable.fields.usLastCents.value = 1;
  assert.ok(validateMooFeatureSnapshot(mutable).errors.includes("CONTENT_HASH_MISMATCH"));
  assert.throws(() => freezeMooFeatureSnapshot(mutable), /CONTENT_HASH_MISMATCH/);
});

test("maximumAvailableAt is recomputed rather than trusted", () => {
  const input = snapshotInput({ maximumAvailableAt: asOf - 900 });
  input.contentHash = "sha256:" + "0".repeat(64);
  assert.ok(validateMooFeatureSnapshot(input).errors.includes("MAXIMUM_AVAILABLE_AT_MISMATCH"));
});
