import {
  MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS,
  type MooTypedValue,
  type MooValueProvenance,
  type MooValueReasonCode,
  type MooValueState,
} from "./moo-contract.ts";
import {
  MOO_FEATURE_SNAPSHOT_SCHEMA,
  sealMooFeatureSnapshot,
  type MooFeatureManifestEntry,
  type MooFeatureScalar,
} from "./moo-feature-snapshot.ts";
import { evaluateMooDataQuality } from "./moo-data-quality.ts";

/** Structural read models accepted from the D1 market store. */
export type PointInTimeObservation = {
  sessionDate: string;
  provider: string;
  feed: string;
  qualification: "RESEARCH" | "STRICT_EXECUTION";
  coverage: string;
  entitlement: "ENTITLED" | "NOT_ENTITLED" | "UNKNOWN";
  providerTime: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  serviceSequence: number;
};

export type PointInTimeMinuteBar = {
  sessionDate: string;
  provider: string;
  feed: string;
  minuteStart: number;
  minuteEnd: number;
  providerTime: number;
  receivedAt: number;
  processedAt: number;
  availableAt: number;
  revision: number;
};

export type MooFeatureDefinition = {
  name: string;
  manifest: MooFeatureManifestEntry;
  maximumAgeMs?: number | null;
};

export type MooFeatureCandidate = MooTypedValue<MooFeatureScalar>;

export type MooFeatureBuildResult = {
  snapshot: ReturnType<typeof sealMooFeatureSnapshot>;
  diagnostics: string[];
};

const READY = new Set<MooValueState>(["AVAILABLE", "FROZEN"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function expectedSession(manifest: MooFeatureManifestEntry, targetSession: string) {
  if (manifest.sessionBinding === "TARGET_SESSION") return targetSession;
  if (manifest.sessionBinding === "EXACT_SESSION") return manifest.expectedSession;
  return null;
}

function emptyProvenance(manifest: MooFeatureManifestEntry, targetSession: string): MooValueProvenance {
  return {
    // The existing feature contract explicitly permits INTERNAL manifests,
    // although MooValueProvenance's sourceId alias is narrower. Preserve the
    // runtime contract value until the shared type is versioned by its owner.
    sourceId: manifest.sourceId as MooValueProvenance["sourceId"],
    provider: null,
    venue: null,
    entitlement: null,
    coverage: null,
    sessionDate: expectedSession(manifest, targetSession),
    timestamps: {
      sourceAt: null,
      receivedAt: null,
      processedAt: null,
      availableAt: null,
      checkedAt: null,
      validUntil: null,
    },
  };
}

function unavailableField(
  manifest: MooFeatureManifestEntry,
  targetSession: string,
  state: MooValueState,
  reasonCode: MooValueReasonCode,
  lastGoodValue?: MooFeatureScalar | null,
): MooFeatureCandidate {
  return {
    value: null,
    state,
    reasonCode,
    ...(lastGoodValue == null ? {} : { lastGoodValue }),
    provenance: emptyProvenance(manifest, targetSession),
  };
}

function scalarMatches(value: unknown, kind: MooFeatureManifestEntry["scalarType"]) {
  if (kind === "NUMBER") return typeof value === "number" && Number.isFinite(value);
  if (kind === "STRING") return typeof value === "string";
  return typeof value === "boolean";
}

function cloneProvenance(value: MooValueProvenance): MooValueProvenance {
  return { ...value, timestamps: { ...value.timestamps } };
}

function normalizeCandidate(input: {
  definition: MooFeatureDefinition;
  candidate: MooFeatureCandidate | undefined;
  targetSession: string;
  asOf: number;
  openingCrossAt: number;
}): { field: MooFeatureCandidate; diagnostics: string[] } {
  const { definition, targetSession, asOf, openingCrossAt } = input;
  const candidate = input.candidate;
  const diagnostics: string[] = [];
  if (!candidate) {
    diagnostics.push(`FIELD_MISSING:${definition.name}`);
    return {
      field: unavailableField(definition.manifest, targetSession, "UNAVAILABLE", "SOURCE_UNAVAILABLE"),
      diagnostics,
    };
  }
  if (!candidate.provenance?.timestamps) {
    diagnostics.push(`PROVENANCE_MISSING:${definition.name}`);
    return {
      field: unavailableField(definition.manifest, targetSession, "INVALID", "VALIDATION_FAILED", candidate.value),
      diagnostics,
    };
  }
  const ready = READY.has(candidate.state);
  if (!ready) {
    const expected = expectedSession(definition.manifest, targetSession);
    const sourceMatches = candidate.provenance.sourceId === definition.manifest.sourceId;
    const sessionMatches = definition.manifest.sessionBinding === "NONE"
      ? candidate.provenance.sessionDate == null
      : candidate.provenance.sessionDate === expected;
    const provenance = sourceMatches && sessionMatches
      ? cloneProvenance(candidate.provenance)
      : emptyProvenance(definition.manifest, targetSession);
    return {
      field: {
        ...candidate,
        value: null,
        ...(candidate.value == null ? {} : { lastGoodValue: candidate.value }),
        provenance,
      },
      diagnostics,
    };
  }
  if (candidate.value == null || !scalarMatches(candidate.value, definition.manifest.scalarType)) {
    diagnostics.push(`SCALAR_TYPE_MISMATCH:${definition.name}`);
    return {
      field: unavailableField(definition.manifest, targetSession, "INVALID", "VALIDATION_FAILED", candidate.value),
      diagnostics,
    };
  }

  const provenance = candidate.provenance;
  const expected = expectedSession(definition.manifest, targetSession);
  const sourceMatches = provenance.sourceId === definition.manifest.sourceId;
  const entitlementMatches = definition.manifest.requiredEntitlement == null ||
    provenance.entitlement === definition.manifest.requiredEntitlement;
  const coverageMatches = definition.manifest.requiredCoverage == null ||
    provenance.coverage === definition.manifest.requiredCoverage;
  const sessionMatches = definition.manifest.sessionBinding === "NONE"
    ? provenance.sessionDate == null
    : provenance.sessionDate === expected;
  if (!sourceMatches || !entitlementMatches || !coverageMatches || !sessionMatches) {
    diagnostics.push(`PROVENANCE_POLICY_MISMATCH:${definition.name}`);
    const state: MooValueState = provenance.entitlement === "NOT_ENTITLED" ? "NOT_ENTITLED" : "INVALID";
    const reason: MooValueReasonCode = state === "NOT_ENTITLED" ? "SOURCE_NOT_ENTITLED" : "VALIDATION_FAILED";
    const field = unavailableField(definition.manifest, targetSession, state, reason, candidate.value);
    if (state === "NOT_ENTITLED") field.provenance.entitlement = "NOT_ENTITLED";
    return { field, diagnostics };
  }

  const times = provenance.timestamps;
  const chronologyValid = timestamp(times.receivedAt) && timestamp(times.processedAt) && timestamp(times.availableAt) &&
    (times.sourceAt == null || timestamp(times.sourceAt)) &&
    times.receivedAt >= (times.sourceAt ?? times.receivedAt) - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
    times.processedAt >= times.receivedAt - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
    times.availableAt >= times.processedAt - MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
    times.receivedAt <= asOf && times.processedAt <= asOf && times.availableAt <= asOf &&
    (times.checkedAt == null || (timestamp(times.checkedAt) && times.checkedAt <= asOf)) &&
    (times.sourceAt == null || times.sourceAt <= asOf + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS);
  if (!chronologyValid) {
    diagnostics.push(`TIMESTAMP_POLICY_FAILED:${definition.name}`);
    return {
      field: unavailableField(definition.manifest, targetSession, "INVALID", "VALIDATION_FAILED", candidate.value),
      diagnostics,
    };
  }

  const ageAnchor = times.sourceAt ?? times.availableAt;
  const expired = times.validUntil != null && (!timestamp(times.validUntil) || times.validUntil < asOf);
  const maximumAgeMs = definition.maximumAgeMs;
  const stale = maximumAgeMs != null &&
    (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 0 || asOf - ageAnchor > maximumAgeMs);
  if (expired || stale) {
    diagnostics.push(`FRESHNESS_POLICY_FAILED:${definition.name}`);
    return {
      field: {
        value: null,
        state: "STALE",
        reasonCode: "SOURCE_STALE",
        lastGoodValue: candidate.value,
        provenance: cloneProvenance(provenance),
      },
      diagnostics,
    };
  }

  const normalizedName = definition.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  if ((definition.manifest.availabilityClass === "OUTCOME_ONLY" || normalizedName.includes("officialopen") || normalizedName.includes("openingcross")) &&
    asOf < openingCrossAt) {
    diagnostics.push(`OUTCOME_LEAKAGE:${definition.name}`);
    return {
      field: unavailableField(definition.manifest, targetSession, "INVALID", "VALIDATION_FAILED", candidate.value),
      diagnostics,
    };
  }
  return {
    field: { ...candidate, provenance: cloneProvenance(candidate.provenance) },
    diagnostics,
  };
}

/**
 * Seal a model-input snapshot from values that were actually available at the
 * declared cutoff. Invalid or late candidates are represented as unavailable
 * audit evidence; their values can never enter the sealed prediction inputs.
 */
export function buildMooFeatureSnapshot(input: {
  featureSchemaVersion: string;
  snapshotId: string;
  targetSession: string;
  asOf: number;
  capturedAt: number;
  openingCrossAt: number;
  definitions: MooFeatureDefinition[];
  candidates: Record<string, MooFeatureCandidate | undefined>;
  qualityThreshold?: number;
}): MooFeatureBuildResult {
  if (!input.featureSchemaVersion.trim() || !input.snapshotId.trim()) throw new TypeError("feature schema and snapshot identity are required");
  if (!validDate(input.targetSession)) throw new TypeError("targetSession must be a real YYYY-MM-DD date");
  if (!timestamp(input.asOf) || !timestamp(input.capturedAt) || input.capturedAt < input.asOf || !timestamp(input.openingCrossAt)) {
    throw new TypeError("feature snapshot timestamps are invalid");
  }
  if (!Array.isArray(input.definitions) || input.definitions.length === 0) throw new TypeError("feature definitions are required");
  const names = input.definitions.map((definition) => definition.name);
  if (names.some((name) => !name.trim()) || new Set(names).size !== names.length) throw new TypeError("feature definitions must have unique names");
  const unknownCandidates = Object.keys(input.candidates).filter((name) => !names.includes(name));
  if (unknownCandidates.length) throw new TypeError(`undeclared feature candidates: ${unknownCandidates.sort().join(",")}`);

  const definitions = [...input.definitions].sort((left, right) => left.name.localeCompare(right.name));
  const manifest: Record<string, MooFeatureManifestEntry> = {};
  const fields: Record<string, MooFeatureCandidate> = {};
  const diagnostics: string[] = [];
  for (const definition of definitions) {
    manifest[definition.name] = { ...definition.manifest };
    const normalized = normalizeCandidate({
      definition,
      candidate: input.candidates[definition.name],
      targetSession: input.targetSession,
      asOf: input.asOf,
      openingCrossAt: input.openingCrossAt,
    });
    fields[definition.name] = normalized.field;
    diagnostics.push(...normalized.diagnostics);
  }
  const qualityEvaluation = evaluateMooDataQuality({
    targetSession: input.targetSession,
    asOf: input.asOf,
    openingCrossAt: input.openingCrossAt,
    threshold: input.qualityThreshold,
    diagnosticReasonCodes: diagnostics,
    fields: definitions.map((definition) => ({
      name: definition.name,
      manifest: definition.manifest,
      field: fields[definition.name],
      maximumAgeMs: definition.maximumAgeMs,
    })),
  });
  const requiredReady = definitions.every((definition) => !definition.manifest.required || READY.has(fields[definition.name].state));
  const state = qualityEvaluation.invalidFields.length > 0
    ? "REJECTED"
    : requiredReady && qualityEvaluation.quality.state === "PASS"
      ? "QUALIFIED"
      : "PARTIAL";
  const availableTimes = Object.values(fields)
    .filter((field) => READY.has(field.state))
    .map((field) => field.provenance.timestamps.availableAt)
    .filter((value): value is number => timestamp(value));
  const snapshot = sealMooFeatureSnapshot({
    schemaVersion: MOO_FEATURE_SNAPSHOT_SCHEMA,
    featureSchemaVersion: input.featureSchemaVersion,
    snapshotId: input.snapshotId,
    targetSession: input.targetSession,
    asOf: input.asOf,
    capturedAt: input.capturedAt,
    openingCrossAt: input.openingCrossAt,
    maximumAvailableAt: availableTimes.length ? Math.max(...availableTimes) : null,
    state,
    manifest,
    fields,
    quality: qualityEvaluation.quality,
  });
  return { snapshot, diagnostics: [...new Set(diagnostics)].sort() };
}

/** Select one exact-source observation without blending feeds or sessions. */
export function selectLatestQualifiedObservationAsOf(
  observations: PointInTimeObservation[],
  input: {
    targetSession: string;
    asOf: number;
    provider: string;
    feed: string;
    qualification: PointInTimeObservation["qualification"];
    coverage: string;
  },
) {
  return observations
    .filter((row) => row.sessionDate === input.targetSession && row.provider === input.provider && row.feed === input.feed &&
      row.qualification === input.qualification && row.coverage === input.coverage && row.entitlement === "ENTITLED" &&
      row.availableAt <= input.asOf && row.processedAt <= input.asOf && row.receivedAt <= input.asOf &&
      row.providerTime <= row.receivedAt + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS &&
      row.receivedAt <= row.processedAt && row.processedAt <= row.availableAt)
    .sort((left, right) => right.providerTime - left.providerTime || right.availableAt - left.availableAt || right.serviceSequence - left.serviceSequence)[0] ?? null;
}

/**
 * Select the highest revision available at the cutoff for each completed
 * minute from one exact provider/feed. Forming candles and cross-feed averages
 * are excluded.
 */
export function selectCompletedMinuteBarsAsOf(
  bars: PointInTimeMinuteBar[],
  input: { targetSession: string; asOf: number; provider: string; feed: string },
) {
  const latest = new Map<number, PointInTimeMinuteBar>();
  for (const row of bars) {
    if (row.sessionDate !== input.targetSession || row.provider !== input.provider || row.feed !== input.feed ||
      row.minuteEnd > input.asOf || row.providerTime > input.asOf + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS ||
      row.receivedAt > input.asOf || row.processedAt > input.asOf || row.availableAt > input.asOf ||
      row.minuteStart >= row.minuteEnd ||
      row.receivedAt < row.minuteEnd || row.providerTime > row.receivedAt + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS ||
      row.receivedAt > row.processedAt || row.processedAt > row.availableAt) continue;
    const previous = latest.get(row.minuteStart);
    if (!previous || row.revision > previous.revision || (row.revision === previous.revision && row.availableAt > previous.availableAt)) {
      latest.set(row.minuteStart, row);
    }
  }
  return [...latest.values()].sort((left, right) => left.minuteStart - right.minuteStart);
}
