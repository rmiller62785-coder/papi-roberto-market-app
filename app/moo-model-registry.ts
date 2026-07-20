import { deepFreezeMoo, mooCanonicalDigest, type MooDeepReadonly } from "./moo-contract.ts";
import type { MooFeatureSnapshot } from "./moo-feature-snapshot.ts";
import { computeMooFeatureManifestDigest, mooFeatureSnapshotQualified } from "./moo-feature-snapshot.ts";

export const MOO_MODEL_REGISTRY_SCHEMA = "moo-model-registry-v1" as const;

export type MooModelStatus = "CANDIDATE" | "PROMOTED" | "RETIRED";

export type MooWalkForwardFold = {
  trainThrough: number;
  testFrom: number;
  testThrough: number;
  observations: number;
};

/** Raw evaluation inputs. Net metrics and pass/fail are always recomputed. */
export type MooModelBaselineResult = {
  baseline: "PREVIOUS_CLOSE" | "OVERNIGHT_MIDPOINT" | "ZERO_EDGE";
  grossMaeCents: number;
  assumedRoundTripCostCents: number;
};

export type MooModelRegistryEntry = {
  schemaVersion: typeof MOO_MODEL_REGISTRY_SCHEMA;
  modelVersion: string;
  status: MooModelStatus;
  featureSchemaVersion: string;
  featureManifestHash: string;
  expectedTargetSession: string;
  artifactHash: string;
  trainedThrough: number;
  folds: MooWalkForwardFold[];
  baselines: MooModelBaselineResult[];
  modelGrossMaeCents: number;
  assumedRoundTripCostCents: number;
  minimumBaselineImprovementCents: number;
  sampleSize: number;
  calibration: {
    method: string;
    sampleSize: number;
    expectedCalibrationErrorPct: number;
    calibratedThrough: number;
  } | null;
  promotedAt: number | null;
  promotedBy: string | null;
  promotionPolicyVersion: string | null;
  retiredAt: number | null;
  contentHash: string;
};

export type MooRecomputedPromotionMetric = {
  baseline: MooModelBaselineResult["baseline"];
  modelNetMaeCents: number;
  baselineNetMaeCents: number;
  modelImprovementCents: number;
  passed: boolean;
};

export type MooModelValidation = { valid: boolean; errors: string[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function recomputeMooPromotionMetrics(entry: MooModelRegistryEntry): MooRecomputedPromotionMetric[] {
  const modelNetMaeCents = entry.modelGrossMaeCents + entry.assumedRoundTripCostCents;
  return (entry.baselines ?? []).map((baseline) => {
    const baselineNetMaeCents = baseline.grossMaeCents + baseline.assumedRoundTripCostCents;
    const modelImprovementCents = baselineNetMaeCents - modelNetMaeCents;
    return {
      baseline: baseline.baseline,
      modelNetMaeCents,
      baselineNetMaeCents,
      modelImprovementCents,
      passed: Number.isFinite(modelImprovementCents) && modelImprovementCents >= entry.minimumBaselineImprovementCents,
    };
  });
}

export function computeMooModelEntryDigest(
  entry: Omit<MooModelRegistryEntry, "contentHash"> | MooModelRegistryEntry,
) {
  return mooCanonicalDigest(entry as unknown as Record<string, unknown>);
}

export function validateMooModelEntry(entry: MooModelRegistryEntry): MooModelValidation {
  const errors: string[] = [];
  if (!entry || typeof entry !== "object") return { valid: false, errors: ["MODEL_ENTRY_INVALID"] };
  if (entry.schemaVersion !== MOO_MODEL_REGISTRY_SCHEMA) errors.push("SCHEMA_VERSION_INVALID");
  if (!["CANDIDATE", "PROMOTED", "RETIRED"].includes(entry.status)) errors.push("MODEL_STATUS_INVALID");
  if (!nonempty(entry.modelVersion)) errors.push("MODEL_VERSION_MISSING");
  if (!nonempty(entry.featureSchemaVersion)) errors.push("FEATURE_SCHEMA_VERSION_MISSING");
  if (!/^sha256:[0-9a-f]{64}$/.test(entry.featureManifestHash)) errors.push("FEATURE_MANIFEST_HASH_INVALID");
  if (!validDate(entry.expectedTargetSession)) errors.push("EXPECTED_TARGET_SESSION_INVALID");
  if (!/^sha256:[0-9a-f]{64}$/.test(entry.artifactHash)) errors.push("ARTIFACT_HASH_INVALID");
  if (!timestamp(entry.trainedThrough)) errors.push("TRAINED_THROUGH_INVALID");
  if (!positiveInteger(entry.sampleSize)) errors.push("SAMPLE_SIZE_INVALID");
  if (!finiteNonnegative(entry.modelGrossMaeCents)) errors.push("MODEL_GROSS_MAE_INVALID");
  if (!finiteNonnegative(entry.assumedRoundTripCostCents)) errors.push("COST_ASSUMPTION_INVALID");
  if (!finiteNonnegative(entry.minimumBaselineImprovementCents)) errors.push("MINIMUM_BASELINE_IMPROVEMENT_INVALID");
  if (!Array.isArray(entry.folds) || !entry.folds.length) errors.push("WALK_FORWARD_FOLDS_MISSING");
  let previousTestThrough = -1;
  let previousTrainThrough = -1;
  let foldObservations = 0;
  for (const [index, fold] of (entry.folds ?? []).entries()) {
    if (!timestamp(fold.trainThrough) || !timestamp(fold.testFrom) || !timestamp(fold.testThrough)) {
      errors.push(`FOLD_TIME_INVALID:${index}`);
      continue;
    }
    if (fold.trainThrough >= fold.testFrom || fold.testFrom > fold.testThrough) errors.push(`FOLD_CHRONOLOGY_INVALID:${index}`);
    if (fold.testFrom <= previousTestThrough) errors.push(`FOLD_OVERLAP:${index}`);
    if (fold.trainThrough <= previousTrainThrough) errors.push(`FOLD_TRAINING_NOT_FORWARD:${index}`);
    if (timestamp(entry.trainedThrough) && fold.testThrough > entry.trainedThrough) errors.push(`FOLD_AFTER_TRAINING_CUTOFF:${index}`);
    if (!positiveInteger(fold.observations)) errors.push(`FOLD_OBSERVATIONS_INVALID:${index}`);
    else foldObservations += fold.observations;
    previousTestThrough = fold.testThrough;
    previousTrainThrough = fold.trainThrough;
  }
  if (positiveInteger(entry.sampleSize) && foldObservations !== entry.sampleSize) errors.push("SAMPLE_SIZE_FOLD_MISMATCH");
  const requiredBaselines = new Set(["PREVIOUS_CLOSE", "OVERNIGHT_MIDPOINT"]);
  const seenBaselines = new Set<string>();
  for (const [index, baseline] of (entry.baselines ?? []).entries()) {
    if (!["PREVIOUS_CLOSE", "OVERNIGHT_MIDPOINT", "ZERO_EDGE"].includes(baseline.baseline)) {
      errors.push(`BASELINE_TYPE_INVALID:${index}`);
    }
    if (seenBaselines.has(baseline.baseline)) errors.push(`BASELINE_DUPLICATE:${baseline.baseline}`);
    seenBaselines.add(baseline.baseline);
    requiredBaselines.delete(baseline.baseline);
    if (!finiteNonnegative(baseline.grossMaeCents) || !finiteNonnegative(baseline.assumedRoundTripCostCents)) {
      errors.push(`BASELINE_METRIC_INVALID:${index}`);
    }
  }
  if (requiredBaselines.size) errors.push("REQUIRED_BASELINES_MISSING");
  if (entry.calibration != null) {
    if (!nonempty(entry.calibration.method)) errors.push("CALIBRATION_METHOD_MISSING");
    if (!positiveInteger(entry.calibration.sampleSize)) errors.push("CALIBRATION_SAMPLE_INVALID");
    if (!finiteNonnegative(entry.calibration.expectedCalibrationErrorPct) || entry.calibration.expectedCalibrationErrorPct > 100) {
      errors.push("CALIBRATION_ERROR_INVALID");
    }
    if (!timestamp(entry.calibration.calibratedThrough)) errors.push("CALIBRATED_THROUGH_INVALID");
    if (positiveInteger(entry.calibration.sampleSize) && positiveInteger(entry.sampleSize) && entry.calibration.sampleSize > entry.sampleSize) {
      errors.push("CALIBRATION_SAMPLE_EXCEEDS_EVALUATION");
    }
  }
  if (entry.status === "PROMOTED") {
    if (entry.calibration == null) errors.push("PROMOTED_MODEL_UNCALIBRATED");
    const metrics = recomputeMooPromotionMetrics(entry);
    if (!metrics.length || metrics.some((metric) => !metric.passed)) errors.push("PROMOTED_MODEL_BASELINE_GATE_FAILED");
    if (!timestamp(entry.promotedAt)) errors.push("PROMOTED_AT_MISSING");
    if (!nonempty(entry.promotedBy)) errors.push("PROMOTED_BY_MISSING");
    if (!nonempty(entry.promotionPolicyVersion)) errors.push("PROMOTION_POLICY_VERSION_MISSING");
    if (entry.retiredAt != null) errors.push("PROMOTED_MODEL_HAS_RETIREMENT_TIME");
    if (timestamp(entry.promotedAt)) {
      if (timestamp(entry.trainedThrough) && entry.trainedThrough > entry.promotedAt) errors.push("TRAINING_AFTER_PROMOTION");
      if ((entry.folds ?? []).some((fold) => timestamp(fold.testThrough) && fold.testThrough > entry.promotedAt!)) {
        errors.push("EVALUATION_AFTER_PROMOTION");
      }
      if (entry.calibration && timestamp(entry.calibration.calibratedThrough) && entry.calibration.calibratedThrough > entry.promotedAt) {
        errors.push("CALIBRATION_AFTER_PROMOTION");
      }
    }
  }
  if (entry.status === "CANDIDATE" && entry.promotedAt != null) errors.push("CANDIDATE_HAS_PROMOTION_TIME");
  if (entry.status === "RETIRED") {
    if (!timestamp(entry.retiredAt)) errors.push("RETIRED_AT_MISSING");
    if (entry.promotedAt != null && entry.retiredAt! < entry.promotedAt) errors.push("RETIREMENT_PRECEDES_PROMOTION");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(entry.contentHash)) errors.push("CONTENT_HASH_INVALID");
  else {
    try {
      if (computeMooModelEntryDigest(entry) !== entry.contentHash) errors.push("CONTENT_HASH_MISMATCH");
    } catch { errors.push("CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

export function mooModelEligibleForFeature(input: {
  model: MooModelRegistryEntry;
  featureSnapshot: MooFeatureSnapshot;
  evaluatedAt: number;
  expectedTargetSession: string;
}) {
  const { model, featureSnapshot, evaluatedAt, expectedTargetSession } = input;
  if (!timestamp(evaluatedAt) || !validDate(expectedTargetSession)) return false;
  if (!validateMooModelEntry(model).valid || model.status !== "PROMOTED") return false;
  if (!mooFeatureSnapshotQualified(featureSnapshot)) return false;
  if (model.expectedTargetSession !== expectedTargetSession || featureSnapshot.targetSession !== expectedTargetSession) return false;
  if (model.featureSchemaVersion !== featureSnapshot.featureSchemaVersion) return false;
  if (model.featureManifestHash !== computeMooFeatureManifestDigest(featureSnapshot.manifest)) return false;
  if (model.trainedThrough >= featureSnapshot.asOf) return false;
  if (featureSnapshot.asOf > evaluatedAt || featureSnapshot.capturedAt > evaluatedAt) return false;
  if (model.promotedAt == null || model.promotedAt > evaluatedAt) return false;
  if (model.calibration == null || model.calibration.calibratedThrough >= featureSnapshot.asOf) return false;
  return true;
}


export function sealMooModelEntry(
  entry: Omit<MooModelRegistryEntry, "contentHash">,
): MooDeepReadonly<MooModelRegistryEntry> {
  const value: MooModelRegistryEntry = { ...entry, contentHash: computeMooModelEntryDigest(entry) };
  const validation = validateMooModelEntry(value);
  if (!validation.valid) throw new TypeError(`Invalid MOO model entry: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}

export function freezeMooModelEntry<T extends MooModelRegistryEntry>(entry: T): MooDeepReadonly<T> {
  const validation = validateMooModelEntry(entry);
  if (!validation.valid) throw new TypeError(`Invalid MOO model entry: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(entry);
}
