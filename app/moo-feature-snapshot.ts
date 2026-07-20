import {
  deepFreezeMoo,
  mooCanonicalDigest,
  type MooDeepReadonly,
  type MooFeedCoverage,
  type MooSourceHealth,
  type MooTypedValue,
  type MooValueState,
} from "./moo-contract.ts";

export const MOO_FEATURE_SNAPSHOT_SCHEMA = "moo-feature-snapshot-v1" as const;

export type MooFeatureScalar = number | string | boolean;
export type MooFeatureScalarType = "NUMBER" | "STRING" | "BOOLEAN";
export type MooFeatureSnapshotState = "PARTIAL" | "QUALIFIED" | "REJECTED";
export type MooFeatureQualityState = "PASS" | "FAIL" | "UNAVAILABLE";
export type MooFeatureAvailabilityClass = "PREDICTION_INPUT" | "OUTCOME_ONLY";

export type MooFeatureManifestEntry = {
  scalarType: MooFeatureScalarType;
  required: boolean;
  sourceId: MooSourceHealth["id"] | "INTERNAL";
  requiredEntitlement: MooSourceHealth["entitlement"] | null;
  requiredCoverage: MooFeedCoverage | null;
  sessionBinding: "TARGET_SESSION" | "EXACT_SESSION" | "NONE";
  expectedSession: string | null;
  availabilityClass: MooFeatureAvailabilityClass;
};

export type MooFeatureQuality = {
  state: MooFeatureQualityState;
  score: number | null;
  threshold: number;
  scoringVersion: string;
  reasonCodes: string[];
};

/** Immutable point-in-time model input and its executable feature contract. */
export type MooFeatureSnapshot = {
  schemaVersion: typeof MOO_FEATURE_SNAPSHOT_SCHEMA;
  featureSchemaVersion: string;
  snapshotId: string;
  targetSession: string;
  asOf: number;
  capturedAt: number;
  openingCrossAt: number;
  maximumAvailableAt: number | null;
  state: MooFeatureSnapshotState;
  manifest: Record<string, MooFeatureManifestEntry>;
  fields: Record<string, MooTypedValue<MooFeatureScalar>>;
  quality: MooFeatureQuality;
  contentHash: string;
};

export type MooFeatureSnapshotValidation = { valid: boolean; errors: string[] };

const QUALIFIED_FIELD_STATES = new Set<MooValueState>(["AVAILABLE", "FROZEN"]);
const SCALAR_TYPES = new Set<MooFeatureScalarType>(["NUMBER", "STRING", "BOOLEAN"]);
const ENTITLEMENTS = new Set<MooSourceHealth["entitlement"]>([
  "REALTIME", "DELAYED", "LIMITED", "NOT_ENTITLED", "UNAVAILABLE",
]);
const COVERAGES = new Set<MooFeedCoverage>([
  "CONSOLIDATED_SIP", "IEX_SINGLE_EXCHANGE", "DIRECT_VENUE", "INSTITUTIONAL_FX",
  "CME_ENTITLED", "NASDAQ_NOII", "UNKNOWN",
]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OFFICIAL_OPEN_OUTCOME_FEATURES = new Set([
  "officialopencents",
  "actualofficialopencents",
  "officialopeningpricecents",
  "openingcrosscents",
]);

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function scalarType(value: unknown): MooFeatureScalarType | null {
  if (typeof value === "number" && Number.isFinite(value)) return "NUMBER";
  if (typeof value === "string") return "STRING";
  if (typeof value === "boolean") return "BOOLEAN";
  return null;
}

export function computeMooFeatureManifestDigest(manifest: Record<string, MooFeatureManifestEntry>) {
  return mooCanonicalDigest({ manifest }, []);
}

function validateManifest(name: string, entry: MooFeatureManifestEntry, targetSession: string, errors: string[]) {
  if (!entry || typeof entry !== "object") return errors.push(`MANIFEST_INVALID:${name}`);
  if (!SCALAR_TYPES.has(entry.scalarType)) errors.push(`MANIFEST_SCALAR_TYPE_INVALID:${name}`);
  if (typeof entry.required !== "boolean") errors.push(`MANIFEST_REQUIRED_INVALID:${name}`);
  if (!["US", "NVD", "FX", "FUTURES", "NOII", "INTERNAL"].includes(entry.sourceId)) {
    errors.push(`MANIFEST_SOURCE_INVALID:${name}`);
  }
  if (entry.requiredEntitlement != null && !ENTITLEMENTS.has(entry.requiredEntitlement)) {
    errors.push(`MANIFEST_ENTITLEMENT_INVALID:${name}`);
  }
  if (entry.requiredCoverage != null && !COVERAGES.has(entry.requiredCoverage)) {
    errors.push(`MANIFEST_COVERAGE_INVALID:${name}`);
  }
  if (!["TARGET_SESSION", "EXACT_SESSION", "NONE"].includes(entry.sessionBinding)) {
    errors.push(`MANIFEST_SESSION_BINDING_INVALID:${name}`);
  }
  if (entry.sessionBinding === "TARGET_SESSION" && entry.expectedSession != null) {
    errors.push(`MANIFEST_TARGET_SESSION_REDUNDANT:${name}`);
  }
  if (entry.sessionBinding === "EXACT_SESSION" && !validDate(entry.expectedSession)) {
    errors.push(`MANIFEST_EXPECTED_SESSION_INVALID:${name}`);
  }
  if (entry.sessionBinding === "EXACT_SESSION" && entry.expectedSession === targetSession) {
    // Legal, but the exact value still gets checked against provenance below.
  }
  if (entry.sessionBinding === "NONE" && entry.expectedSession != null) {
    errors.push(`MANIFEST_UNBOUND_SESSION_PRESENT:${name}`);
  }
  if (!["PREDICTION_INPUT", "OUTCOME_ONLY"].includes(entry.availabilityClass)) {
    errors.push(`MANIFEST_AVAILABILITY_CLASS_INVALID:${name}`);
  }
}

function validateField(
  name: string,
  field: MooTypedValue<MooFeatureScalar>,
  manifest: MooFeatureManifestEntry,
  snapshot: MooFeatureSnapshot,
  errors: string[],
) {
  if (!field || typeof field !== "object") return errors.push(`FIELD_INVALID:${name}`);
  const ready = QUALIFIED_FIELD_STATES.has(field.state);
  if (ready && field.value == null) errors.push(`FIELD_VALUE_MISSING:${name}`);
  if (field.value != null && scalarType(field.value) == null) errors.push(`FIELD_VALUE_NOT_SCALAR:${name}`);
  if (field.value != null && scalarType(field.value) !== manifest.scalarType) {
    errors.push(`FIELD_SCALAR_TYPE_MISMATCH:${name}`);
  }
  if (manifest.required && snapshot.state === "QUALIFIED" && !ready) errors.push(`REQUIRED_FIELD_NOT_READY:${name}`);
  if (typeof field.value === "number" && !Number.isFinite(field.value)) errors.push(`FIELD_NUMBER_INVALID:${name}`);
  if (!field.provenance || !field.provenance.timestamps) return errors.push(`FIELD_PROVENANCE_MISSING:${name}`);
  const provenance = field.provenance;
  if (provenance.sourceId !== manifest.sourceId) errors.push(`FIELD_SOURCE_MISMATCH:${name}`);
  if (ready && manifest.requiredEntitlement != null && provenance.entitlement !== manifest.requiredEntitlement) {
    errors.push(`FIELD_ENTITLEMENT_MISMATCH:${name}`);
  }
  if (ready && manifest.requiredCoverage != null && provenance.coverage !== manifest.requiredCoverage) {
    errors.push(`FIELD_COVERAGE_MISMATCH:${name}`);
  }
  if (field.state === "NOT_ENTITLED" && provenance.entitlement !== "NOT_ENTITLED") {
    errors.push(`FIELD_NOT_ENTITLED_INCONSISTENT:${name}`);
  }
  const expectedSession = manifest.sessionBinding === "TARGET_SESSION"
    ? snapshot.targetSession
    : manifest.sessionBinding === "EXACT_SESSION"
      ? manifest.expectedSession
      : null;
  if (manifest.sessionBinding === "NONE") {
    if (provenance.sessionDate != null) errors.push(`FIELD_SESSION_UNEXPECTED:${name}`);
  } else if (provenance.sessionDate !== expectedSession) {
    errors.push(`FIELD_SESSION_MISMATCH:${name}`);
  }
  const times = provenance.timestamps;
  for (const [label, value] of Object.entries(times)) {
    if (value != null && !timestamp(value)) errors.push(`FIELD_TIME_INVALID:${name}:${label}`);
  }
  const { sourceAt, receivedAt, processedAt, availableAt } = times;
  if (sourceAt != null && receivedAt != null && receivedAt < sourceAt - 1_000) errors.push(`FIELD_TIME_ORDER:${name}:receivedAt`);
  if (receivedAt != null && processedAt != null && processedAt < receivedAt - 1_000) errors.push(`FIELD_TIME_ORDER:${name}:processedAt`);
  if (processedAt != null && availableAt != null && availableAt < processedAt - 1_000) errors.push(`FIELD_TIME_ORDER:${name}:availableAt`);
  for (const [label, value] of [["receivedAt", receivedAt], ["processedAt", processedAt], ["availableAt", availableAt], ["checkedAt", times.checkedAt]] as const) {
    if (value != null && value > snapshot.asOf) errors.push(`FIELD_POST_ASOF:${name}:${label}`);
  }
  if (ready) {
    if (availableAt == null) errors.push(`FIELD_AVAILABLE_TIME_MISSING:${name}`);
    if (times.validUntil != null && times.validUntil < snapshot.asOf) errors.push(`FIELD_EXPIRED:${name}`);
    const normalizedName = name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    const officialOpenSemantic = OFFICIAL_OPEN_OUTCOME_FEATURES.has(normalizedName) ||
      normalizedName.includes("officialopen") || normalizedName.includes("openingcross");
    if ((manifest.availabilityClass === "OUTCOME_ONLY" || officialOpenSemantic) &&
      snapshot.asOf < snapshot.openingCrossAt) {
      errors.push(`OUTCOME_FEATURE_BEFORE_OPENING_CROSS:${name}`);
    }
  }
}

export function computeMooFeatureSnapshotDigest(snapshot: Omit<MooFeatureSnapshot, "contentHash"> | MooFeatureSnapshot) {
  return mooCanonicalDigest(snapshot as unknown as Record<string, unknown>);
}

export function validateMooFeatureSnapshot(snapshot: MooFeatureSnapshot): MooFeatureSnapshotValidation {
  const errors: string[] = [];
  if (!snapshot || typeof snapshot !== "object") return { valid: false, errors: ["SNAPSHOT_INVALID"] };
  if (snapshot.schemaVersion !== MOO_FEATURE_SNAPSHOT_SCHEMA) errors.push("SCHEMA_VERSION_INVALID");
  if (!["PARTIAL", "QUALIFIED", "REJECTED"].includes(snapshot.state)) errors.push("SNAPSHOT_STATE_INVALID");
  if (!nonempty(snapshot.featureSchemaVersion)) errors.push("FEATURE_SCHEMA_VERSION_MISSING");
  if (!nonempty(snapshot.snapshotId)) errors.push("SNAPSHOT_ID_MISSING");
  if (!validDate(snapshot.targetSession)) errors.push("TARGET_SESSION_INVALID");
  if (!timestamp(snapshot.asOf)) errors.push("AS_OF_INVALID");
  if (!timestamp(snapshot.capturedAt) || snapshot.capturedAt < snapshot.asOf) errors.push("CAPTURED_AT_INVALID");
  if (!timestamp(snapshot.openingCrossAt)) errors.push("OPENING_CROSS_AT_INVALID");
  if (snapshot.maximumAvailableAt != null && (!timestamp(snapshot.maximumAvailableAt) || snapshot.maximumAvailableAt > snapshot.asOf)) {
    errors.push("MAXIMUM_AVAILABLE_AT_INVALID");
  }
  const manifestNames = Object.keys(snapshot.manifest ?? {});
  const fieldNames = Object.keys(snapshot.fields ?? {});
  if (!manifestNames.length) errors.push("MANIFEST_EMPTY");
  if (!fieldNames.length) errors.push("FIELDS_EMPTY");
  for (const name of manifestNames) validateManifest(name, snapshot.manifest[name], snapshot.targetSession, errors);
  for (const name of fieldNames) {
    const manifest = snapshot.manifest?.[name];
    if (!manifest) errors.push(`FIELD_UNDECLARED:${name}`);
    else validateField(name, snapshot.fields[name], manifest, snapshot, errors);
  }
  for (const name of manifestNames) if (!(name in (snapshot.fields ?? {}))) errors.push(`MANIFEST_FIELD_MISSING:${name}`);
  const availableTimes = Object.values(snapshot.fields ?? {})
    .filter((field) => QUALIFIED_FIELD_STATES.has(field.state))
    .map((field) => field.provenance?.timestamps?.availableAt)
    .filter((value): value is number => timestamp(value));
  const computedMaximum = availableTimes.length ? Math.max(...availableTimes) : null;
  if (snapshot.maximumAvailableAt !== computedMaximum) errors.push("MAXIMUM_AVAILABLE_AT_MISMATCH");
  if (!snapshot.quality || typeof snapshot.quality !== "object") errors.push("QUALITY_INVALID");
  else {
    if (!["PASS", "FAIL", "UNAVAILABLE"].includes(snapshot.quality.state)) errors.push("QUALITY_STATE_INVALID");
    if (!percent(snapshot.quality.threshold)) errors.push("QUALITY_THRESHOLD_INVALID");
    if (snapshot.quality.score != null && !percent(snapshot.quality.score)) errors.push("QUALITY_SCORE_INVALID");
    if (!nonempty(snapshot.quality.scoringVersion)) errors.push("QUALITY_SCORING_VERSION_MISSING");
    if (snapshot.quality.state === "PASS" && (snapshot.quality.score == null || snapshot.quality.score < snapshot.quality.threshold)) {
      errors.push("QUALITY_PASS_INCONSISTENT");
    }
  }
  if (snapshot.state === "QUALIFIED") {
    if (snapshot.quality?.state !== "PASS") errors.push("QUALIFIED_QUALITY_NOT_PASSING");
    for (const [name, manifest] of Object.entries(snapshot.manifest ?? {})) {
      if (manifest.required && !QUALIFIED_FIELD_STATES.has(snapshot.fields?.[name]?.state)) {
        errors.push(`QUALIFIED_FIELD_NOT_READY:${name}`);
      }
    }
  }
  if (snapshot.state === "REJECTED" && snapshot.quality?.state === "PASS") errors.push("REJECTED_QUALITY_INCONSISTENT");
  if (!/^sha256:[0-9a-f]{64}$/.test(snapshot.contentHash)) errors.push("CONTENT_HASH_INVALID");
  else {
    try {
      if (computeMooFeatureSnapshotDigest(snapshot) !== snapshot.contentHash) errors.push("CONTENT_HASH_MISMATCH");
    } catch { errors.push("CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

export function mooFeatureSnapshotQualified(snapshot: MooFeatureSnapshot) {
  return snapshot.state === "QUALIFIED" && validateMooFeatureSnapshot(snapshot).valid;
}

export function sealMooFeatureSnapshot(
  snapshot: Omit<MooFeatureSnapshot, "contentHash">,
): MooDeepReadonly<MooFeatureSnapshot> {
  const value: MooFeatureSnapshot = { ...snapshot, contentHash: computeMooFeatureSnapshotDigest(snapshot) };
  const validation = validateMooFeatureSnapshot(value);
  if (!validation.valid) throw new TypeError(`Invalid MOO feature snapshot: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}

/** Reject invalid or tampered inputs before persistence and then deeply freeze. */
export function freezeMooFeatureSnapshot<T extends MooFeatureSnapshot>(snapshot: T): MooDeepReadonly<T> {
  const validation = validateMooFeatureSnapshot(snapshot);
  if (!validation.valid) throw new TypeError(`Invalid MOO feature snapshot: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(snapshot);
}
