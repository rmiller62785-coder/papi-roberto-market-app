import {
  MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS,
  type MooTypedValue,
} from "./moo-contract.ts";
import type {
  MooFeatureManifestEntry,
  MooFeatureQuality,
  MooFeatureScalar,
} from "./moo-feature-snapshot.ts";

export const MOO_DATA_QUALITY_SCORING_VERSION = "moo-data-quality-v1" as const;

export type MooQualityField = {
  name: string;
  manifest: MooFeatureManifestEntry;
  field: MooTypedValue<MooFeatureScalar>;
  maximumAgeMs?: number | null;
};

export type MooDataQualityEvaluation = {
  quality: MooFeatureQuality;
  components: {
    completeness: number;
    provenance: number;
    chronology: number;
    freshness: number;
  };
  requiredFieldCount: number;
  readyRequiredFieldCount: number;
  invalidFields: string[];
};

const READY = new Set(["AVAILABLE", "FROZEN"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function expectedSession(manifest: MooFeatureManifestEntry, targetSession: string) {
  if (manifest.sessionBinding === "TARGET_SESSION") return targetSession;
  if (manifest.sessionBinding === "EXACT_SESSION") return manifest.expectedSession;
  return null;
}

function scalarMatches(value: unknown, scalarType: MooFeatureManifestEntry["scalarType"]) {
  if (scalarType === "NUMBER") return typeof value === "number" && Number.isFinite(value);
  if (scalarType === "STRING") return typeof value === "string";
  return typeof value === "boolean";
}

function roundedComponent(passed: number, total: number, weight: number) {
  return total === 0 ? weight : Math.round((passed / total) * weight);
}

/**
 * Deterministic quality scoring for a declared feature manifest. Required
 * inputs are hard gates: a high optional-source score can never compensate
 * for a missing, stale, unentitled, wrong-session, or post-as-of required
 * value.
 */
export function evaluateMooDataQuality(input: {
  targetSession: string;
  asOf: number;
  openingCrossAt: number;
  fields: MooQualityField[];
  threshold?: number;
  diagnosticReasonCodes?: string[];
}): MooDataQualityEvaluation {
  if (!DATE.test(input.targetSession) || !validTimestamp(input.asOf) || !validTimestamp(input.openingCrossAt)) {
    throw new TypeError("quality evaluation session or timestamps are invalid");
  }
  const threshold = input.threshold ?? 80;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new TypeError("quality threshold must be 0-100");
  if (!Array.isArray(input.fields) || input.fields.length === 0) throw new TypeError("quality evaluation requires fields");
  const names = input.fields.map((item) => item.name);
  if (names.some((name) => !name.trim()) || new Set(names).size !== names.length) throw new TypeError("quality field names must be unique and nonempty");

  const required = input.fields.filter((item) => item.manifest.required);
  const scored = required.length ? required : input.fields;
  let complete = 0;
  let provenance = 0;
  let chronology = 0;
  let fresh = 0;
  const invalid = new Set<string>();
  const reasons = new Set(input.diagnosticReasonCodes ?? []);

  for (const item of scored) {
    const { name, manifest, field } = item;
    const ready = READY.has(field.state) && field.value != null;
    if (!ready) {
      reasons.add(`${manifest.required ? "REQUIRED" : "OPTIONAL"}_FIELD_NOT_READY:${name}:${field.state}`);
      if (manifest.required && ["INVALID", "NOT_ENTITLED", "STALE"].includes(field.state)) invalid.add(name);
      continue;
    }
    if (!scalarMatches(field.value, manifest.scalarType)) {
      reasons.add(`SCALAR_TYPE_MISMATCH:${name}`);
      invalid.add(name);
      continue;
    }
    complete += 1;

    const valueProvenance = field.provenance;
    const expected = expectedSession(manifest, input.targetSession);
    let provenanceOk = valueProvenance.sourceId === manifest.sourceId &&
      (manifest.requiredEntitlement == null || valueProvenance.entitlement === manifest.requiredEntitlement) &&
      (manifest.requiredCoverage == null || valueProvenance.coverage === manifest.requiredCoverage) &&
      valueProvenance.sessionDate === expected;
    if (manifest.sessionBinding === "NONE") provenanceOk = provenanceOk && valueProvenance.sessionDate == null;
    if (!provenanceOk) {
      reasons.add(`PROVENANCE_POLICY_MISMATCH:${name}`);
      invalid.add(name);
    } else provenance += 1;

    const times = valueProvenance.timestamps;
    const ordered = validTimestamp(times.receivedAt) && validTimestamp(times.processedAt) && validTimestamp(times.availableAt) &&
      (times.sourceAt == null || validTimestamp(times.sourceAt)) &&
      times.receivedAt >= (times.sourceAt ?? times.receivedAt) - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
      times.processedAt >= times.receivedAt - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
      times.availableAt >= times.processedAt - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
      times.receivedAt <= input.asOf && times.processedAt <= input.asOf && times.availableAt <= input.asOf &&
      (times.checkedAt == null || (validTimestamp(times.checkedAt) && times.checkedAt <= input.asOf)) &&
      (times.sourceAt == null || times.sourceAt <= input.asOf + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS);
    if (!ordered) {
      reasons.add(`TIMESTAMP_POLICY_FAILED:${name}`);
      invalid.add(name);
    } else chronology += 1;

    const ageAnchor = times.sourceAt ?? times.availableAt;
    const maximumAgeMs = item.maximumAgeMs;
    const freshnessOk = ordered &&
      (times.validUntil == null || (validTimestamp(times.validUntil) && times.validUntil >= input.asOf)) &&
      (maximumAgeMs == null || (Number.isSafeInteger(maximumAgeMs) && maximumAgeMs >= 0 && input.asOf - ageAnchor <= maximumAgeMs));
    if (!freshnessOk) {
      reasons.add(`FRESHNESS_POLICY_FAILED:${name}`);
      if (manifest.required) invalid.add(name);
    } else fresh += 1;

    const normalizedName = name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if ((manifest.availabilityClass === "OUTCOME_ONLY" || normalizedName.includes("officialopen") || normalizedName.includes("openingcross")) &&
      input.asOf < input.openingCrossAt) {
      reasons.add(`OUTCOME_LEAKAGE:${name}`);
      invalid.add(name);
    }
  }

  const components = {
    completeness: roundedComponent(complete, scored.length, 40),
    provenance: roundedComponent(provenance, scored.length, 25),
    chronology: roundedComponent(chronology, scored.length, 20),
    freshness: roundedComponent(fresh, scored.length, 15),
  };
  const readyRequiredFieldCount = required.filter((item) => READY.has(item.field.state) && item.field.value != null).length;
  const unavailable = required.length > 0 && readyRequiredFieldCount === 0 && invalid.size === 0;
  const score = unavailable ? null : Object.values(components).reduce((sum, value) => sum + value, 0);
  const allRequiredReady = required.length === readyRequiredFieldCount;
  const pass = !unavailable && invalid.size === 0 && allRequiredReady && score != null && score >= threshold;
  if (!allRequiredReady) reasons.add("REQUIRED_FEATURE_SET_INCOMPLETE");
  if (invalid.size) reasons.add("REQUIRED_FEATURE_POLICY_FAILED");
  const reasonCodes = [...reasons].sort();
  return {
    quality: {
      state: unavailable ? "UNAVAILABLE" : pass ? "PASS" : "FAIL",
      score,
      threshold,
      scoringVersion: MOO_DATA_QUALITY_SCORING_VERSION,
      reasonCodes,
    },
    components,
    requiredFieldCount: required.length,
    readyRequiredFieldCount,
    invalidFields: [...invalid].sort(),
  };
}
