import {
  deepFreezeMoo,
  isMooSourceId,
  mooCanonicalDigest,
  validateMooLocateProof,
  validateMooRequiredSourceIds,
  type MooDecisionSnapshot,
  type MooDeepReadonly,
  type MooLocateProof,
} from "./moo-contract.ts";
import { nasdaqSessionSchedule } from "./market-session.ts";
import {
  mooFeatureSnapshotQualified,
  validateMooFeatureSnapshot,
  type MooFeatureSnapshot,
} from "./moo-feature-snapshot.ts";
import {
  mooModelEligibleForFeature,
  validateMooModelEntry,
  type MooModelRegistryEntry,
} from "./moo-model-registry.ts";
import {
  resolveMooRiskPolicy,
  validateMooRiskPolicy,
  type MooStrictRiskPolicy,
} from "./moo-risk-policy.ts";

export const MOO_DECISION_ARTIFACT_SCHEMA = "moo-decision-artifact-v1" as const;
export const MOO_DECISION_OUTCOME_SCHEMA = "moo-decision-outcome-v1" as const;

export type MooDecisionArtifactState = "READY" | "NO_EDGE" | "BLOCKED";

/** A cutoff-owned record with all contracts required to reproduce its state. */
export type MooDecisionArtifact = {
  schemaVersion: typeof MOO_DECISION_ARTIFACT_SCHEMA;
  artifactId: string;
  targetSession: string;
  state: MooDecisionArtifactState;
  executionEnvironment: "paper" | "live";
  evaluatedAt: number;
  cutoffAt: number;
  frozenAt: number;
  featureSnapshotId: string | null;
  modelVersion: string | null;
  riskPolicyVersion: string | null;
  featureSnapshot: MooFeatureSnapshot | null;
  model: MooModelRegistryEntry | null;
  riskPolicy: MooStrictRiskPolicy | null;
  shortLocateProof: MooLocateProof | null;
  decisionSnapshot: MooDecisionSnapshot;
  contentHash: string;
};

/** Outcome-only data attaches beside, never inside, the immutable decision. */
export type MooDecisionOutcome = {
  schemaVersion: typeof MOO_DECISION_OUTCOME_SCHEMA;
  artifactId: string;
  targetSession: string;
  actualOfficialOpenCents: number | null;
  officialOpenSource: "NASDAQ_OFFICIAL_CROSS" | null;
  longFillCents: number | null;
  shortFillCents: number | null;
  capturedAt: number;
  contentHash: string;
};

export type MooArtifactValidation = { valid: boolean; errors: string[] };
export type MooFreezeResult =
  | { status: "CREATED"; artifact: MooDecisionArtifact }
  | { status: "EXISTS_IDENTICAL"; artifact: MooDecisionArtifact }
  | { status: "CONFLICT"; existing: MooDecisionArtifact };

export interface MooArtifactStore {
  getFrozen(targetSession: string): Promise<MooDecisionArtifact | null>;
  freezeOnce(artifact: MooDecisionArtifact): Promise<MooFreezeResult>;
  getOutcome(artifactId: string): Promise<MooDecisionOutcome | null>;
  attachOutcomeOnce(outcome: MooDecisionOutcome): Promise<"CREATED" | "EXISTS_IDENTICAL" | "CONFLICT">;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_COVERAGE = {
  US: "CONSOLIDATED_SIP",
  NVD: "DIRECT_VENUE",
  FX: "INSTITUTIONAL_FX",
  FUTURES: "CME_ENTITLED",
  NOII: "NASDAQ_NOII",
} as const;
const STRICT_MAX_SOURCE_AGE_MS = { US: 2_000, NVD: 10_000, FX: 60_000, FUTURES: 10_000, NOII: 2_000 } as const;

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function cents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function digestMatches(value: { contentHash: string }) {
  return /^sha256:[0-9a-f]{64}$/.test(value.contentHash) &&
    mooCanonicalDigest(value as unknown as Record<string, unknown>) === value.contentHash;
}

function snapshotContractErrors(artifact: MooDecisionArtifact, errors: string[]) {
  const snapshot = artifact.decisionSnapshot;
  if (!snapshot || typeof snapshot !== "object") return errors.push("DECISION_SNAPSHOT_MISSING");
  if (snapshot.schemaVersion !== "moo-phase1-v1") errors.push("SNAPSHOT_SCHEMA_INVALID");
  if (snapshot.targetSession !== artifact.targetSession) errors.push("SNAPSHOT_TARGET_MISMATCH");
  if (snapshot.actionCutoffAt !== artifact.cutoffAt) errors.push("SNAPSHOT_CUTOFF_MISMATCH");
  if (snapshot.frozenAt !== artifact.frozenAt) errors.push("SNAPSHOT_FREEZE_MISMATCH");
  if (!timestamp(snapshot.generatedAt) || snapshot.generatedAt > artifact.frozenAt) errors.push("SNAPSHOT_GENERATED_AFTER_FREEZE");
  if (snapshot.generatedAt !== artifact.evaluatedAt) errors.push("SNAPSHOT_EVALUATION_MISMATCH");
  if (!["READY", "FROZEN"].includes(snapshot.lifecycle)) errors.push("SNAPSHOT_LIFECYCLE_INVALID");
  if ((snapshot.featureSnapshotId ?? null) !== artifact.featureSnapshotId) errors.push("FEATURE_SNAPSHOT_MISMATCH");
  if ((snapshot.modelVersion ?? null) !== artifact.modelVersion) errors.push("MODEL_VERSION_MISMATCH");
  if ((snapshot.shortLocateProof?.contentHash ?? null) !== (artifact.shortLocateProof?.contentHash ?? null)) {
    errors.push("LOCATE_PROOF_MISMATCH");
  }
  const sourcePolicy = validateMooRequiredSourceIds(snapshot.requiredSourceIds);
  if (!sourcePolicy.valid) {
    errors.push("SNAPSHOT_REQUIRED_SOURCE_POLICY_INVALID");
    errors.push(...sourcePolicy.errors.map((error) => `SOURCE_POLICY:${error}`));
  } else {
    for (const id of snapshot.requiredSourceIds) {
      const matches = (Array.isArray(snapshot.sources) ? snapshot.sources : []).filter((source) => source?.id === id);
      if (matches.length !== 1) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_AMBIGUOUS:${id}`);
        continue;
      }
      const source = matches[0];
      if (!isMooSourceId(source.id)) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_ID_INVALID:${String(source.id)}`);
        continue;
      }
      if (source.state !== "LIVE" || source.entitlement !== "REALTIME" || source.coverage !== STRICT_COVERAGE[id]) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_NOT_STRICT:${id}`);
      }
      if (!timestamp(source.observedAt) || !timestamp(source.checkedAt) || source.observedAt > artifact.frozenAt || source.checkedAt > artifact.frozenAt) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_TIME_INVALID:${id}`);
      }
      if (timestamp(source.observedAt) && timestamp(source.checkedAt) && source.checkedAt < source.observedAt - 1_000) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_CHECK_ORDER_INVALID:${id}`);
      }
      if (timestamp(source.observedAt)) {
        const derivedAge = Math.max(0, artifact.frozenAt - source.observedAt);
        const reportedAge = source.ageMs == null ? derivedAge : source.ageMs;
        if (!timestamp(reportedAge) || Math.max(derivedAge, reportedAge) > STRICT_MAX_SOURCE_AGE_MS[id]) {
          errors.push(`SNAPSHOT_REQUIRED_SOURCE_STALE:${id}`);
        }
      }
      for (const time of [source.receivedAt, source.processedAt, source.availableAt]) {
        if (time != null && (!timestamp(time) || time > artifact.frozenAt)) errors.push(`SNAPSHOT_REQUIRED_SOURCE_AVAILABLE_TOO_LATE:${id}`);
      }
      if (source.validUntil != null && (!timestamp(source.validUntil) || source.validUntil < artifact.frozenAt)) {
        errors.push(`SNAPSHOT_REQUIRED_SOURCE_EXPIRED:${id}`);
      }
    }
  }
  if (snapshot.actualOfficialOpenCents != null || snapshot.officialOpenSource != null || snapshot.predictionErrorCents != null ||
    snapshot.longTicket?.actualFillCents != null || snapshot.shortTicket?.actualFillCents != null ||
    snapshot.longTicket?.rebasedTargetCents != null || snapshot.shortTicket?.rebasedTargetCents != null) {
    errors.push("OUTCOME_DATA_EMBEDDED_IN_DECISION");
  }
}

function nestedContractErrors(artifact: MooDecisionArtifact, errors: string[]) {
  const { featureSnapshot, model, riskPolicy } = artifact;
  if (featureSnapshot != null) {
    const validation = validateMooFeatureSnapshot(featureSnapshot);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `FEATURE:${error}`));
    if (featureSnapshot.snapshotId !== artifact.featureSnapshotId) errors.push("FEATURE_NESTED_ID_MISMATCH");
    if (featureSnapshot.targetSession !== artifact.targetSession) errors.push("FEATURE_TARGET_MISMATCH");
    if (featureSnapshot.featureSchemaVersion !== artifact.decisionSnapshot?.featureSchemaVersion) {
      errors.push("FEATURE_SCHEMA_SNAPSHOT_MISMATCH");
    }
    if (featureSnapshot.quality.score !== artifact.decisionSnapshot?.dataQualityScore) {
      errors.push("FEATURE_QUALITY_SNAPSHOT_MISMATCH");
    }
    if (featureSnapshot.asOf > artifact.evaluatedAt || featureSnapshot.capturedAt > artifact.evaluatedAt ||
      (featureSnapshot.maximumAvailableAt != null && featureSnapshot.maximumAvailableAt > artifact.evaluatedAt)) {
      errors.push("FEATURE_AVAILABLE_AFTER_EVALUATION");
    }
  }
  if (model != null) {
    const validation = validateMooModelEntry(model);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `MODEL:${error}`));
    if (model.modelVersion !== artifact.modelVersion) errors.push("MODEL_NESTED_ID_MISMATCH");
    if (model.featureSchemaVersion !== artifact.decisionSnapshot?.featureSchemaVersion) errors.push("MODEL_SCHEMA_SNAPSHOT_MISMATCH");
  }
  if (riskPolicy != null) {
    const validation = validateMooRiskPolicy(riskPolicy);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `RISK:${error}`));
    if (riskPolicy.policyVersion !== artifact.riskPolicyVersion) errors.push("RISK_NESTED_ID_MISMATCH");
  }
  if ((artifact.state === "READY" || artifact.state === "NO_EDGE") && (!featureSnapshot || !model)) {
    errors.push("MODEL_FEATURE_CONTRACT_MISSING");
  }
  if (featureSnapshot && model && !mooModelEligibleForFeature({
    model,
    featureSnapshot,
    evaluatedAt: artifact.frozenAt,
    expectedTargetSession: artifact.targetSession,
  })) errors.push("MODEL_FEATURE_NOT_ELIGIBLE");
}

export function computeMooDecisionArtifactDigest(
  artifact: Omit<MooDecisionArtifact, "contentHash"> | MooDecisionArtifact,
) {
  return mooCanonicalDigest(artifact as unknown as Record<string, unknown>);
}

export function validateMooDecisionArtifact(artifact: MooDecisionArtifact): MooArtifactValidation {
  const errors: string[] = [];
  if (!artifact || typeof artifact !== "object") return { valid: false, errors: ["ARTIFACT_INVALID"] };
  if (artifact.schemaVersion !== MOO_DECISION_ARTIFACT_SCHEMA) errors.push("SCHEMA_VERSION_INVALID");
  if (!["READY", "NO_EDGE", "BLOCKED"].includes(artifact.state)) errors.push("ARTIFACT_STATE_INVALID");
  if (!nonempty(artifact.artifactId)) errors.push("ARTIFACT_ID_MISSING");
  if (!validDate(artifact.targetSession)) errors.push("TARGET_SESSION_INVALID");
  let schedule: ReturnType<typeof nasdaqSessionSchedule> | null = null;
  try { schedule = nasdaqSessionSchedule(artifact.targetSession); } catch { errors.push("TARGET_SESSION_INVALID"); }
  if (schedule && !schedule.isTradingSession) errors.push("TARGET_NOT_TRADING_SESSION");
  if (!timestamp(artifact.evaluatedAt)) errors.push("EVALUATED_AT_INVALID");
  if (!timestamp(artifact.cutoffAt)) errors.push("CUTOFF_AT_INVALID");
  if (!timestamp(artifact.frozenAt)) errors.push("FROZEN_AT_INVALID");
  if (schedule && artifact.cutoffAt !== schedule.decisionFreezeAt) errors.push("CUTOFF_NOT_CANONICAL");
  if (schedule && artifact.featureSnapshot && artifact.featureSnapshot.openingCrossAt !== schedule.regularOpenAt) {
    errors.push("FEATURE_OPENING_CROSS_NOT_CANONICAL");
  }
  if (schedule && (artifact.frozenAt < schedule.premarketOpenAt || artifact.frozenAt > schedule.decisionFreezeAt)) {
    errors.push("FREEZE_OUTSIDE_DECISION_WINDOW");
  }
  if (timestamp(artifact.frozenAt) && timestamp(artifact.cutoffAt) && artifact.frozenAt > artifact.cutoffAt) errors.push("FREEZE_AFTER_CUTOFF");
  if (timestamp(artifact.evaluatedAt) && timestamp(artifact.frozenAt) && artifact.evaluatedAt > artifact.frozenAt) errors.push("EVALUATION_AFTER_FREEZE");
  if (!["paper", "live"].includes(artifact.executionEnvironment)) errors.push("EXECUTION_ENVIRONMENT_INVALID");
  snapshotContractErrors(artifact, errors);
  nestedContractErrors(artifact, errors);
  const snapshot = artifact.decisionSnapshot;
  if (artifact.state === "READY") {
    if (snapshot?.decision === "NO_TRADE" || snapshot?.blockReason !== "NONE") errors.push("READY_STATE_INCONSISTENT");
    if (!nonempty(artifact.featureSnapshotId) || !nonempty(artifact.modelVersion) || !nonempty(artifact.riskPolicyVersion)) {
      errors.push("READY_IDENTITY_INCOMPLETE");
    }
    if (!artifact.featureSnapshot || !mooFeatureSnapshotQualified(artifact.featureSnapshot)) errors.push("READY_FEATURE_NOT_QUALIFIED");
    const favored = snapshot?.decision === "LONG_FAVORED" ? snapshot.longTicket : snapshot?.shortTicket;
    const opposite = snapshot?.decision === "LONG_FAVORED" ? snapshot.shortTicket : snapshot?.longTicket;
    if (!favored?.actionable || opposite?.actionable) errors.push("READY_TICKET_ACTIONABILITY_INVALID");
    const resolvedRisk = artifact.riskPolicy ? resolveMooRiskPolicy(artifact.riskPolicy, artifact.frozenAt, {
      environment: artifact.executionEnvironment,
      purpose: "STRICT",
    }) : null;
    if (!resolvedRisk) errors.push("READY_RISK_POLICY_NOT_STRICT");
    else {
      const ticketMatches = (ticket: typeof snapshot.longTicket | null | undefined, resolved: typeof resolvedRisk.longTicket) =>
        ticket != null && ticket.orderType === "MOO" && ticket.stopOffsetCents === resolved.stopOffsetCents &&
        ticket.quantity === resolved.quantity && ticket.accountLabel === resolved.accountLabel &&
        ticket.reserveCents === resolved.reserveCents && ticket.maximumLossCents === resolved.maximumLossCents &&
        ticket.timeStop === resolved.timeStop;
      if (!ticketMatches(snapshot?.longTicket, resolvedRisk.longTicket) || !ticketMatches(snapshot?.shortTicket, resolvedRisk.shortTicket)) {
        errors.push("READY_TICKET_RISK_POLICY_MISMATCH");
      }
    }
    if (snapshot?.decision === "SHORT_FAVORED" && schedule) {
      const accountAlias = snapshot.shortTicket?.accountLabel ?? "";
      const quantity = snapshot.shortTicket?.quantity ?? -1;
      const locate = validateMooLocateProof(artifact.shortLocateProof, {
        accountAlias,
        targetSession: artifact.targetSession,
        quantity,
        availableBy: artifact.frozenAt,
        validThrough: schedule.finalEntryAt,
      });
      if (!locate.valid || snapshot.shortTicket?.shortability !== "AVAILABLE") {
        errors.push("READY_SHORT_LOCATE_INVALID");
        errors.push(...locate.errors.map((error) => `LOCATE:${error}`));
      }
      if (artifact.riskPolicy && artifact.riskPolicy.short.accountAlias.trim().toLowerCase() !== accountAlias.trim().toLowerCase()) {
        errors.push("READY_SHORT_RISK_ACCOUNT_MISMATCH");
      }
    }
  }
  if (artifact.state === "NO_EDGE") {
    if (snapshot?.decision !== "NO_TRADE" || snapshot?.blockReason !== "NO_EDGE" || snapshot?.decisionReasonCode !== "NO_EDGE") {
      errors.push("NO_EDGE_STATE_INCONSISTENT");
    }
    if (!nonempty(artifact.featureSnapshotId) || !nonempty(artifact.modelVersion)) errors.push("NO_EDGE_IDENTITY_INCOMPLETE");
  }
  if (artifact.state === "BLOCKED" && (snapshot?.decision !== "NO_TRADE" || snapshot?.blockReason === "NONE" || snapshot?.blockReason === "NO_EDGE")) {
    errors.push("BLOCKED_STATE_INCONSISTENT");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(artifact.contentHash)) errors.push("CONTENT_HASH_INVALID");
  else {
    try { if (!digestMatches(artifact)) errors.push("CONTENT_HASH_MISMATCH"); }
    catch { errors.push("CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

export function computeMooDecisionOutcomeDigest(
  outcome: Omit<MooDecisionOutcome, "contentHash"> | MooDecisionOutcome,
) {
  return mooCanonicalDigest(outcome as unknown as Record<string, unknown>);
}

export function validateMooDecisionOutcome(
  outcome: MooDecisionOutcome,
  artifact?: MooDecisionArtifact | null,
): MooArtifactValidation {
  const errors: string[] = [];
  if (!outcome || typeof outcome !== "object") return { valid: false, errors: ["OUTCOME_INVALID"] };
  if (outcome.schemaVersion !== MOO_DECISION_OUTCOME_SCHEMA) errors.push("SCHEMA_VERSION_INVALID");
  if (!nonempty(outcome.artifactId)) errors.push("ARTIFACT_ID_MISSING");
  if (!validDate(outcome.targetSession)) errors.push("TARGET_SESSION_INVALID");
  if (!timestamp(outcome.capturedAt)) errors.push("CAPTURED_AT_INVALID");
  for (const [label, value] of [["actualOfficialOpenCents", outcome.actualOfficialOpenCents], ["longFillCents", outcome.longFillCents], ["shortFillCents", outcome.shortFillCents]] as const) {
    if (value != null && !cents(value)) errors.push(`${label.toUpperCase()}_INVALID`);
  }
  if (outcome.actualOfficialOpenCents != null && outcome.officialOpenSource !== "NASDAQ_OFFICIAL_CROSS") {
    errors.push("OFFICIAL_OPEN_SOURCE_INVALID");
  }
  if (outcome.actualOfficialOpenCents == null && outcome.officialOpenSource != null) errors.push("OFFICIAL_OPEN_SOURCE_WITHOUT_VALUE");
  let schedule: ReturnType<typeof nasdaqSessionSchedule> | null = null;
  try { schedule = nasdaqSessionSchedule(outcome.targetSession); } catch { errors.push("TARGET_SESSION_INVALID"); }
  if (schedule && (outcome.actualOfficialOpenCents != null || outcome.longFillCents != null || outcome.shortFillCents != null) &&
    outcome.capturedAt < schedule.regularOpenAt) errors.push("OUTCOME_BEFORE_OPENING_CROSS");
  if (!artifact) errors.push("OUTCOME_ARTIFACT_REQUIRED");
  else {
    let artifactValidation: MooArtifactValidation;
    try { artifactValidation = validateMooDecisionArtifact(artifact); }
    catch { artifactValidation = { valid: false, errors: ["ARTIFACT_VALIDATION_THROW"] }; }
    if (!artifactValidation.valid) errors.push("OUTCOME_ARTIFACT_INVALID");
    if (outcome.artifactId !== artifact.artifactId) errors.push("OUTCOME_ARTIFACT_MISMATCH");
    if (outcome.targetSession !== artifact.targetSession) errors.push("OUTCOME_TARGET_MISMATCH");
    if (artifact.state !== "READY") {
      if (outcome.longFillCents != null || outcome.shortFillCents != null) errors.push("BLOCKED_ARTIFACT_HAS_FILL");
    } else if (artifact.decisionSnapshot?.decision === "LONG_FAVORED") {
      if (outcome.shortFillCents != null) errors.push("OPPOSITE_SIDE_FILL_INVALID");
    } else if (artifact.decisionSnapshot?.decision === "SHORT_FAVORED") {
      if (outcome.longFillCents != null) errors.push("OPPOSITE_SIDE_FILL_INVALID");
    } else if (outcome.longFillCents != null || outcome.shortFillCents != null) errors.push("NO_TRADE_HAS_FILL");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(outcome.contentHash)) errors.push("CONTENT_HASH_INVALID");
  else {
    try { if (!digestMatches(outcome)) errors.push("CONTENT_HASH_MISMATCH"); }
    catch { errors.push("CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

export function sealMooDecisionArtifact(
  artifact: Omit<MooDecisionArtifact, "contentHash">,
): MooDeepReadonly<MooDecisionArtifact> {
  const value: MooDecisionArtifact = { ...artifact, contentHash: computeMooDecisionArtifactDigest(artifact) };
  const validation = validateMooDecisionArtifact(value);
  if (!validation.valid) throw new TypeError(`Invalid MOO decision artifact: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}

export function freezeMooDecisionArtifact<T extends MooDecisionArtifact>(artifact: T): MooDeepReadonly<T> {
  const validation = validateMooDecisionArtifact(artifact);
  if (!validation.valid) throw new TypeError(`Invalid MOO decision artifact: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(artifact);
}

export function sealMooDecisionOutcome(
  outcome: Omit<MooDecisionOutcome, "contentHash">,
  artifact: MooDecisionArtifact,
): MooDeepReadonly<MooDecisionOutcome> {
  const value: MooDecisionOutcome = { ...outcome, contentHash: computeMooDecisionOutcomeDigest(outcome) };
  const validation = validateMooDecisionOutcome(value, artifact);
  if (!validation.valid) throw new TypeError(`Invalid MOO decision outcome: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}
