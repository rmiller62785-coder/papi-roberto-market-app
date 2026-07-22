import {
  validateMooDecisionArtifact,
  validateMooDecisionOutcome,
  type MooArtifactStore,
  type MooDecisionArtifact,
  type MooDecisionOutcome,
  type MooFreezeResult,
} from "./moo-artifact-store.ts";
import {
  validateMooFeatureSnapshot,
  type MooFeatureSnapshot,
} from "./moo-feature-snapshot.ts";
import {
  validateMooModelEntry,
  type MooModelRegistryEntry,
} from "./moo-model-registry.ts";

type D1Result = { meta?: { changes?: number } };

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value !== "string") throw new TypeError(`${label} payload is unavailable`);
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch (error) { throw new TypeError(`${label} payload is invalid JSON`, { cause: error }); }
  return parsed as T;
}

function changed(result: D1Result) {
  return typeof result.meta?.changes === "number" && result.meta.changes > 0;
}

function timestamp(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a nonnegative timestamp`);
}

function validateArtifact(value: MooDecisionArtifact) {
  const validation = validateMooDecisionArtifact(value);
  if (!validation.valid) throw new TypeError(`Invalid persisted MOO artifact: ${validation.errors.join(", ")}`);
  return value;
}

function validateOutcome(value: MooDecisionOutcome, artifact: MooDecisionArtifact) {
  const validation = validateMooDecisionOutcome(value, artifact);
  if (!validation.valid) throw new TypeError(`Invalid persisted MOO outcome: ${validation.errors.join(", ")}`);
  return value;
}

/**
 * D1 ownership store for immutable Strict MOO artifacts. INSERT OR IGNORE plus
 * a content-hash comparison makes retries idempotent while a second payload
 * for the same session or outcome key fails closed as an explicit conflict.
 */
export function createD1MooArtifactStore(database: D1Database): MooArtifactStore {
  const getFrozen = async (targetSession: string) => {
    const row = await database.prepare(`SELECT payload_json FROM moo_decision_artifacts
      WHERE target_session=? LIMIT 1`).bind(targetSession).first<Record<string, unknown>>();
    if (!row) return null;
    const artifact = validateArtifact(parseJson<MooDecisionArtifact>(row.payload_json, "decision artifact"));
    return artifact.frozenAt <= Date.now() && artifact.evaluatedAt <= Date.now() ? artifact : null;
  };

  const getOutcome = async (artifactId: string) => {
    const row = await database.prepare(`SELECT outcome.payload_json AS payload_json,artifact.payload_json AS artifact_json
      FROM moo_decision_outcomes AS outcome
      JOIN moo_decision_artifacts AS artifact ON artifact.artifact_id=outcome.artifact_id
      WHERE outcome.artifact_id=? LIMIT 1`).bind(artifactId).first<Record<string, unknown>>();
    if (!row) return null;
    const artifact = validateArtifact(parseJson<MooDecisionArtifact>(row.artifact_json, "decision artifact"));
    return validateOutcome(parseJson<MooDecisionOutcome>(row.payload_json, "decision outcome"), artifact);
  };

  return {
    getFrozen,
    async freezeOnce(artifact: MooDecisionArtifact): Promise<MooFreezeResult> {
      validateArtifact(artifact);
      const now = Date.now();
      if (artifact.frozenAt > now || artifact.evaluatedAt > now) {
        throw new TypeError("A decision artifact cannot be persisted before its trusted freeze time");
      }
      const result = await database.prepare(`INSERT OR IGNORE INTO moo_decision_artifacts (
        artifact_id,target_session,state,execution_environment,evaluated_at,cutoff_at,frozen_at,
        feature_snapshot_id,model_version,risk_policy_version,content_hash,payload_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        artifact.artifactId, artifact.targetSession, artifact.state, artifact.executionEnvironment,
        artifact.evaluatedAt, artifact.cutoffAt, artifact.frozenAt, artifact.featureSnapshotId,
        artifact.modelVersion, artifact.riskPolicyVersion, artifact.contentHash,
        JSON.stringify(artifact), artifact.frozenAt,
      ).run() as D1Result;
      if (changed(result)) return { status: "CREATED", artifact };
      const existing = await getFrozen(artifact.targetSession);
      if (!existing) throw new Error("MOO_ARTIFACT_INSERT_NOT_OBSERVABLE");
      return existing.contentHash === artifact.contentHash
        ? { status: "EXISTS_IDENTICAL", artifact: existing }
        : { status: "CONFLICT", existing };
    },
    getOutcome,
    async attachOutcomeOnce(outcome: MooDecisionOutcome) {
      const artifactRow = await database.prepare(`SELECT payload_json FROM moo_decision_artifacts
        WHERE artifact_id=? LIMIT 1`).bind(outcome.artifactId).first<Record<string, unknown>>();
      if (!artifactRow) throw new TypeError("Decision artifact is required before its outcome");
      const artifact = validateArtifact(parseJson<MooDecisionArtifact>(artifactRow.payload_json, "decision artifact"));
      validateOutcome(outcome, artifact);
      const result = await database.prepare(`INSERT OR IGNORE INTO moo_decision_outcomes (
        artifact_id,target_session,content_hash,payload_json,captured_at,created_at
      ) VALUES (?,?,?,?,?,?)`).bind(
        outcome.artifactId, outcome.targetSession, outcome.contentHash, JSON.stringify(outcome),
        outcome.capturedAt, outcome.capturedAt,
      ).run() as D1Result;
      if (changed(result)) return "CREATED";
      const existing = await getOutcome(outcome.artifactId);
      if (!existing) throw new Error("MOO_OUTCOME_INSERT_NOT_OBSERVABLE");
      return existing.contentHash === outcome.contentHash ? "EXISTS_IDENTICAL" : "CONFLICT";
    },
  };
}

export async function appendMooFeatureSnapshotOnce(
  database: D1Database,
  snapshot: MooFeatureSnapshot,
  createdAt = Date.now(),
) {
  timestamp(createdAt, "createdAt");
  const validation = validateMooFeatureSnapshot(snapshot);
  if (!validation.valid) throw new TypeError(`Invalid feature snapshot: ${validation.errors.join(", ")}`);
  const result = await database.prepare(`INSERT OR IGNORE INTO moo_feature_snapshots (
    snapshot_id,target_session,as_of,captured_at,feature_schema_version,state,quality_state,
    quality_score,content_hash,payload_json,created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    snapshot.snapshotId, snapshot.targetSession, snapshot.asOf, snapshot.capturedAt,
    snapshot.featureSchemaVersion, snapshot.state, snapshot.quality.state, snapshot.quality.score,
    snapshot.contentHash, JSON.stringify(snapshot), createdAt,
  ).run() as D1Result;
  if (changed(result)) return "CREATED" as const;
  const existing = await database.prepare(`SELECT content_hash FROM moo_feature_snapshots
    WHERE snapshot_id=? LIMIT 1`).bind(snapshot.snapshotId).first<Record<string, unknown>>();
  if (!existing) throw new Error("MOO_FEATURE_INSERT_NOT_OBSERVABLE");
  return existing.content_hash === snapshot.contentHash ? "EXISTS_IDENTICAL" as const : "CONFLICT" as const;
}

/** Candidate registration is append-only. Promotion remains a separate, owner-authorized operation. */
export async function appendMooModelCandidateOnce(
  database: D1Database,
  entry: MooModelRegistryEntry,
  artifactKey: string,
  createdAt = Date.now(),
) {
  timestamp(createdAt, "createdAt");
  if (!artifactKey.trim()) throw new TypeError("artifactKey is required");
  const validation = validateMooModelEntry(entry);
  if (!validation.valid) throw new TypeError(`Invalid model candidate: ${validation.errors.join(", ")}`);
  if (entry.status !== "CANDIDATE" || entry.promotedAt != null || entry.promotedBy != null) {
    throw new TypeError("Only unpromoted candidates can be registered by the research runner");
  }
  const result = await database.prepare(`INSERT OR IGNORE INTO moo_model_entries (
    model_version,status,feature_schema_version,expected_target_session,artifact_key,artifact_hash,
    trained_through,promoted_at,content_hash,payload_json,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    entry.modelVersion, entry.status, entry.featureSchemaVersion, entry.expectedTargetSession,
    artifactKey, entry.artifactHash, entry.trainedThrough, entry.promotedAt, entry.contentHash,
    JSON.stringify(entry), createdAt, createdAt,
  ).run() as D1Result;
  if (changed(result)) return "CREATED" as const;
  const existing = await database.prepare(`SELECT content_hash FROM moo_model_entries
    WHERE model_version=? LIMIT 1`).bind(entry.modelVersion).first<Record<string, unknown>>();
  if (!existing) throw new Error("MOO_MODEL_INSERT_NOT_OBSERVABLE");
  return existing.content_hash === entry.contentHash ? "EXISTS_IDENTICAL" as const : "CONFLICT" as const;
}

export async function readPromotedMooModel(database: D1Database, targetSession: string) {
  const row = await database.prepare(`SELECT payload_json FROM moo_model_entries
    WHERE status='PROMOTED' AND expected_target_session=?
    ORDER BY promoted_at DESC LIMIT 1`).bind(targetSession).first<Record<string, unknown>>();
  if (!row) return null;
  const entry = parseJson<MooModelRegistryEntry>(row.payload_json, "model registry");
  const validation = validateMooModelEntry(entry);
  if (!validation.valid || entry.status !== "PROMOTED") return null;
  return entry;
}
