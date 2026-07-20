import assert from "node:assert/strict";
import test from "node:test";

import {
  computeMooModelEntryDigest,
  freezeMooModelEntry,
  mooModelEligibleForFeature,
  recomputeMooPromotionMetrics,
  validateMooModelEntry,
} from "../app/moo-model-registry.ts";
import { computeMooFeatureManifestDigest, sealMooFeatureSnapshot } from "../app/moo-feature-snapshot.ts";

const targetSession = "2026-07-20";

function featureManifest() {
  return {
    us: {
      scalarType: "NUMBER", required: true, sourceId: "US", requiredEntitlement: "REALTIME",
      requiredCoverage: "CONSOLIDATED_SIP", sessionBinding: "TARGET_SESSION", expectedSession: null,
      availabilityClass: "PREDICTION_INPUT",
    },
  };
}

function model(overrides = {}) {
  const value = {
    schemaVersion: "moo-model-registry-v1",
    modelVersion: "nvda-open-v1",
    status: "PROMOTED",
    featureSchemaVersion: "features-v1",
    featureManifestHash: computeMooFeatureManifestDigest(featureManifest()),
    expectedTargetSession: targetSession,
    artifactHash: `sha256:${"b".repeat(64)}`,
    trainedThrough: 100,
    folds: [
      { trainThrough: 10, testFrom: 20, testThrough: 30, observations: 20 },
      { trainThrough: 30, testFrom: 40, testThrough: 50, observations: 20 },
    ],
    baselines: [
      { baseline: "PREVIOUS_CLOSE", grossMaeCents: 120, assumedRoundTripCostCents: 0 },
      { baseline: "OVERNIGHT_MIDPOINT", grossMaeCents: 110, assumedRoundTripCostCents: 0 },
    ],
    modelGrossMaeCents: 100,
    assumedRoundTripCostCents: 3,
    minimumBaselineImprovementCents: 2,
    sampleSize: 40,
    calibration: { method: "isotonic-v1", sampleSize: 40, expectedCalibrationErrorPct: 4, calibratedThrough: 900 },
    promotedAt: 950,
    promotedBy: "risk-reviewer",
    promotionPolicyVersion: "promotion-v1",
    retiredAt: null,
    ...overrides,
  };
  return { ...value, contentHash: computeMooModelEntryDigest(value) };
}

function feature(overrides = {}) {
  const asOf = 1_000;
  return sealMooFeatureSnapshot({
    schemaVersion: "moo-feature-snapshot-v1",
    featureSchemaVersion: "features-v1",
    snapshotId: "feature-1",
    targetSession,
    asOf,
    capturedAt: 1_001,
    openingCrossAt: 2_000,
    maximumAvailableAt: 992,
    state: "QUALIFIED",
    manifest: featureManifest(),
    fields: {
      us: {
        value: 20_265, state: "AVAILABLE", reasonCode: "VALUE_PRESENT",
        provenance: {
          sourceId: "US", provider: "fixture", venue: "SIP", entitlement: "REALTIME",
          coverage: "CONSOLIDATED_SIP", sessionDate: targetSession,
          timestamps: { sourceAt: 990, receivedAt: 991, processedAt: 992, availableAt: 992, checkedAt: 993, validUntil: 1_100 },
        },
      },
    },
    quality: { state: "PASS", score: 95, threshold: 80, scoringVersion: "quality-v1", reasonCodes: [] },
    ...overrides,
  });
}

test("only a promoted calibrated walk-forward model bound to the target session is eligible", () => {
  const entry = model();
  const snapshot = feature();
  assert.equal(validateMooModelEntry(entry).valid, true);
  assert.equal(mooModelEligibleForFeature({ model: entry, featureSnapshot: snapshot, evaluatedAt: 1_100, expectedTargetSession: targetSession }), true);
  assert.equal(mooModelEligibleForFeature({ model: entry, featureSnapshot: snapshot, evaluatedAt: 1_100, expectedTargetSession: "2026-07-21" }), false);
  assert.equal(mooModelEligibleForFeature({ model: model({ expectedTargetSession: "2026-07-21" }), featureSnapshot: snapshot, evaluatedAt: 1_100, expectedTargetSession: targetSession }), false);
});

test("random, overlapping, or sample-inconsistent evaluation windows cannot pass", () => {
  const result = validateMooModelEntry(model({
    folds: [
      { trainThrough: 50, testFrom: 20, testThrough: 30, observations: 10 },
      { trainThrough: 25, testFrom: 30, testThrough: 40, observations: 10 },
    ],
  }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.startsWith("FOLD_CHRONOLOGY_INVALID")));
  assert.ok(result.errors.some((error) => error.startsWith("FOLD_OVERLAP")));
  assert.ok(result.errors.includes("SAMPLE_SIZE_FOLD_MISMATCH"));
});

test("feature schema mismatch and training leakage both fail eligibility", () => {
  const schemaMismatch = feature({ featureSchemaVersion: "features-v2" });
  assert.equal(mooModelEligibleForFeature({ model: model(), featureSnapshot: schemaMismatch, evaluatedAt: 1_100, expectedTargetSession: targetSession }), false);
  assert.equal(mooModelEligibleForFeature({ model: model({ trainedThrough: 1_000 }), featureSnapshot: feature(), evaluatedAt: 1_100, expectedTargetSession: targetSession }), false);
});

test("promotion metrics are recomputed after model and baseline costs", () => {
  const metrics = recomputeMooPromotionMetrics(model());
  assert.deepEqual(metrics.map((metric) => metric.modelImprovementCents), [17, 7]);
  assert.equal(metrics.every((metric) => metric.passed), true);

  const spoofed = model({
    baselines: [
      { baseline: "PREVIOUS_CLOSE", grossMaeCents: 100, assumedRoundTripCostCents: 0, passed: true, modelImprovementCents: 999 },
      { baseline: "OVERNIGHT_MIDPOINT", grossMaeCents: 100, assumedRoundTripCostCents: 0, passed: true, modelImprovementCents: 999 },
    ],
  });
  const result = validateMooModelEntry(spoofed);
  assert.ok(result.errors.includes("PROMOTED_MODEL_BASELINE_GATE_FAILED"));
  assert.equal(recomputeMooPromotionMetrics(spoofed).every((metric) => metric.passed), false);
});

test("promotion requires calibration and both simple baselines", () => {
  const result = validateMooModelEntry(model({ calibration: null, baselines: [] }));
  assert.ok(result.errors.includes("PROMOTED_MODEL_UNCALIBRATED"));
  assert.ok(result.errors.includes("REQUIRED_BASELINES_MISSING"));
  assert.ok(result.errors.includes("PROMOTED_MODEL_BASELINE_GATE_FAILED"));
});

test("promotion cannot predate training, evaluation, or calibration evidence", () => {
  const result = validateMooModelEntry(model({
    promotedAt: 25,
    trainedThrough: 100,
    calibration: { method: "isotonic-v1", sampleSize: 40, expectedCalibrationErrorPct: 4, calibratedThrough: 90 },
  }));
  assert.ok(result.errors.includes("TRAINING_AFTER_PROMOTION"));
  assert.ok(result.errors.includes("EVALUATION_AFTER_PROMOTION"));
  assert.ok(result.errors.includes("CALIBRATION_AFTER_PROMOTION"));
});

test("model entries bind the exact manifest and deeply freeze after validation", () => {
  const entry = freezeMooModelEntry(model());
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.folds), true);
  const changedManifest = feature({ manifest: { ...featureManifest(), extra: featureManifest().us }, fields: {
    ...feature().fields,
    extra: feature().fields.us,
  } });
  assert.equal(mooModelEligibleForFeature({ model: entry, featureSnapshot: changedManifest, evaluatedAt: 1_100, expectedTargetSession: targetSession }), false);
});
