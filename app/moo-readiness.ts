import {
  canonicalMooJson,
  isMooSourceId,
  validateMooRequiredSourceIds,
  validateMooLocateProof,
  type MooBlockReason,
  type MooDecisionSnapshot,
  type MooFeedCoverage,
  type MooSourceHealth,
} from "./moo-contract.ts";
import { nasdaqSessionSchedule } from "./market-session.ts";
import { validateMooDecisionArtifact, type MooDecisionArtifact } from "./moo-artifact-store.ts";

export type MooSourceRole = "REQUIRED_NOW" | "OPTIONAL_RESEARCH" | "POST_FREEZE_MONITORING";
export type MooConnectionMode = "REST_POLLING";
export type MooStrictCommissionState =
  | "NOT_COMMISSIONED"
  | "COMMISSIONED_BLOCKED"
  | "COMMISSIONED_NO_TRADE"
  | "COMMISSIONED_READY";
export type MooResearchOperationalState =
  | "RESEARCH_OFFLINE"
  | "RESEARCH_DEGRADED"
  | "RESEARCH_OPERATIONAL";
export type MooPaperOperationalState =
  | "PAPER_BLOCKED"
  | "PAPER_PARTIAL"
  | "PAPER_OPERATIONAL";
export type MooDominantBlockerCode = MooBlockReason | "RISK_POLICY_UNCONFIGURED";
export type MooBorrowStatusCode =
  | "EASY_TO_BORROW"
  | "HARD_TO_BORROW"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type MooBrokerReadinessInput = {
  shortable: boolean | null;
  borrowStatus: string | null;
  locateGuaranteed: boolean;
};

export type MooSourceReadiness = {
  id: MooSourceHealth["id"];
  role: MooSourceRole;
  present: boolean;
  duplicate: boolean;
  state: MooSourceHealth["state"] | "MISSING";
  entitlement: MooSourceHealth["entitlement"] | "MISSING";
  coverage: MooFeedCoverage | "MISSING";
  available: boolean;
  strictReady: boolean;
};

export type MooReadinessGroup = {
  ready: number;
  available: number;
  total: number;
  items: MooSourceReadiness[];
};

export type MooReadinessSummary = {
  sourceGroups: {
    requiredNow: MooReadinessGroup;
    optionalResearch: MooReadinessGroup;
    postFreezeMonitoring: MooReadinessGroup;
  };
  requiredReady: number;
  requiredTotal: number;
  optionalAvailable: number;
  optionalTotal: number;
  connectionMode: MooConnectionMode;
  dominantBlockerCode: MooDominantBlockerCode;
  strictCommissionState: MooStrictCommissionState;
  researchOperationalState: MooResearchOperationalState;
  paperOperationalState: MooPaperOperationalState;
  broker: {
    indicativeShortable: boolean | null;
    indicativeBorrowStatusCode: MooBorrowStatusCode;
    indicativeEasyToBorrow: boolean;
    guaranteedLocateConfirmed: boolean;
    strictLocateReady: boolean;
  };
};

const SOURCE_IDS_BY_ROLE = {
  REQUIRED_NOW: ["US"],
  OPTIONAL_RESEARCH: ["NVD", "FX", "FUTURES"],
  POST_FREEZE_MONITORING: ["NOII"],
} as const satisfies Record<MooSourceRole, readonly MooSourceHealth["id"][]>;

const STRICT_FEED_COVERAGE: Record<MooSourceHealth["id"], MooFeedCoverage> = {
  US: "CONSOLIDATED_SIP",
  NVD: "DIRECT_VENUE",
  FX: "INSTITUTIONAL_FX",
  FUTURES: "CME_ENTITLED",
  NOII: "NASDAQ_NOII",
};
const STRICT_MAX_SOURCE_AGE_MS: Record<MooSourceHealth["id"], number> = {
  US: 2_000, NVD: 10_000, FX: 60_000, FUTURES: 10_000, NOII: 2_000,
};

function sourceAvailable(source: MooSourceHealth | undefined) {
  return source != null && ["LIVE", "DEGRADED", "DELAYED"].includes(source.state);
}

function sourceStrictReady(source: MooSourceHealth | undefined, duplicate: boolean, evaluatedAt: number) {
  if (source == null || !isMooSourceId(source.id) || duplicate || source.state !== "LIVE" ||
    source.entitlement !== "REALTIME" || source.coverage !== STRICT_FEED_COVERAGE[source.id] ||
    typeof source.provider !== "string" || source.provider.trim().length === 0 ||
    (source.reasonCode != null && source.reasonCode !== "VALUE_PRESENT") ||
    !Number.isSafeInteger(source.observedAt) || !Number.isSafeInteger(source.checkedAt) ||
    source.observedAt! > evaluatedAt || source.checkedAt! > evaluatedAt ||
    source.checkedAt! < source.observedAt! - 1_000) return false;
  const derivedAge = Math.max(0, evaluatedAt - source.observedAt!);
  const reportedAge = Number.isSafeInteger(source.ageMs) && source.ageMs! >= 0 ? source.ageMs! : derivedAge;
  if (Math.max(derivedAge, reportedAge) > STRICT_MAX_SOURCE_AGE_MS[source.id]) return false;
  const sourceTimes = [source.receivedAt, source.processedAt, source.availableAt];
  if (sourceTimes.some((time) => time != null) &&
    (!Number.isSafeInteger(source.receivedAt) || !Number.isSafeInteger(source.processedAt) ||
      !Number.isSafeInteger(source.availableAt) || source.receivedAt! < source.observedAt! ||
      source.processedAt! < source.receivedAt! || source.availableAt! < source.processedAt! ||
      source.checkedAt! < source.availableAt! || source.availableAt! > evaluatedAt)) return false;
  if (source.validUntil != null && (!Number.isSafeInteger(source.validUntil) || source.validUntil < evaluatedAt)) return false;
  return source != null && !duplicate && source.state === "LIVE" && source.entitlement === "REALTIME" &&
    source.coverage === STRICT_FEED_COVERAGE[source.id];
}

function groupSources(
  sources: MooSourceHealth[],
  role: MooSourceRole,
  sourceIds: readonly MooSourceHealth["id"][] = SOURCE_IDS_BY_ROLE[role],
  evaluatedAt = Date.now(),
): MooReadinessGroup {
  const items = sourceIds.map((id): MooSourceReadiness => {
    const matches = sources.filter((source) => source.id === id);
    const source = matches.length === 1 ? matches[0] : undefined;
    const duplicate = matches.length > 1;
    const available = !duplicate && sourceAvailable(source);
    return {
      id,
      role,
      present: matches.length > 0,
      duplicate,
      state: source?.state ?? "MISSING",
      entitlement: source?.entitlement ?? "MISSING",
      coverage: source?.coverage ?? "MISSING",
      available,
      strictReady: sourceStrictReady(source, duplicate, evaluatedAt),
    };
  });
  return {
    ready: items.filter((item) => item.strictReady).length,
    available: items.filter((item) => item.available).length,
    total: items.length,
    items,
  };
}

function borrowStatusCode(value: string | null | undefined): MooBorrowStatusCode {
  const normalized = value?.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (normalized === "easy_to_borrow") return "EASY_TO_BORROW";
  if (normalized === "hard_to_borrow") return "HARD_TO_BORROW";
  if (normalized === "unavailable" || normalized === "not_shortable") return "UNAVAILABLE";
  return "UNKNOWN";
}

function requiredSourceBlocker(group: MooReadinessGroup): MooBlockReason | null {
  for (const source of group.items) {
    if (!source.present || source.duplicate || source.entitlement !== "REALTIME" ||
      source.coverage !== STRICT_FEED_COVERAGE[source.id]) {
      return "FEED_NOT_ENTITLED";
    }
    if (source.state === "DEGRADED" || source.state === "DELAYED") {
      return source.id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (source.state !== "LIVE") return "DATA_PENDING";
    if (!source.strictReady) return source.id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
  }
  return null;
}

function dominantBlocker(
  snapshot: MooDecisionSnapshot,
  requiredNow: MooReadinessGroup,
  strictLocateReady: boolean,
  artifactAuthorized: boolean,
): MooDominantBlockerCode {
  if (snapshot.blockReason !== "NONE") return snapshot.blockReason;
  const sourceBlocker = requiredSourceBlocker(requiredNow);
  if (sourceBlocker) return sourceBlocker;
  if (!snapshot.modelVersion?.trim() || !snapshot.featureSchemaVersion?.trim()) {
    return "MODEL_NOT_TRAINED";
  }
  if (
    snapshot.predictedOfficialOpenCents == null ||
    snapshot.dataQualityScore == null ||
    snapshot.majorThirdCents == null ||
    snapshot.minorThirdCents == null
  ) return "DATA_PENDING";
  if (snapshot.decision === "NO_TRADE") {
    return snapshot.decisionReasonCode === "NO_EDGE" ? "NO_EDGE" : "LOW_CONFIDENCE";
  }
  if (snapshot.confidencePct == null) return "LOW_CONFIDENCE";
  if (snapshot.decision === "SHORT_FAVORED" && !strictLocateReady) {
    return "SHORTABILITY_UNCONFIRMED";
  }
  const favoredTicket = snapshot.decision === "LONG_FAVORED"
    ? snapshot.longTicket
    : snapshot.shortTicket;
  if (!favoredTicket.actionable) {
    return "RISK_POLICY_UNCONFIGURED";
  }
  if (!artifactAuthorized) return "RISK_POLICY_UNCONFIGURED";
  return "NONE";
}

function artifactAuthorizesSnapshot(snapshot: MooDecisionSnapshot, artifact?: MooDecisionArtifact | null) {
  if (!artifact) return false;
  try {
    if (!validateMooDecisionArtifact(artifact).valid) return false;
    const expectedState = snapshot.decision === "NO_TRADE" && snapshot.decisionReasonCode === "NO_EDGE" ? "NO_EDGE" : "READY";
    return artifact.state === expectedState && canonicalMooJson(artifact.decisionSnapshot) === canonicalMooJson(snapshot);
  } catch {
    return false;
  }
}

function commissionState(
  snapshot: MooDecisionSnapshot,
  blocker: MooDominantBlockerCode,
): MooStrictCommissionState {
  const modelCommissioned = snapshot.blockReason !== "MODEL_NOT_TRAINED" &&
    Boolean(snapshot.modelVersion?.trim()) &&
    Boolean(snapshot.featureSchemaVersion?.trim());
  if (!modelCommissioned) return "NOT_COMMISSIONED";
  if (snapshot.decision === "NO_TRADE" && (blocker === "LOW_CONFIDENCE" || blocker === "NO_EDGE")) {
    return "COMMISSIONED_NO_TRADE";
  }
  return blocker === "NONE" ? "COMMISSIONED_READY" : "COMMISSIONED_BLOCKED";
}

function researchState(
  requiredNow: MooReadinessGroup,
  optionalResearch: MooReadinessGroup,
): MooResearchOperationalState {
  const available = requiredNow.available + optionalResearch.available;
  const total = requiredNow.total + optionalResearch.total;
  if (available === 0) return "RESEARCH_OFFLINE";
  return available === total ? "RESEARCH_OPERATIONAL" : "RESEARCH_DEGRADED";
}

function paperState(snapshot: MooDecisionSnapshot): MooPaperOperationalState {
  const hasAnchor = snapshot.predictedOfficialOpenCents != null && snapshot.predictedOpenState === "AVAILABLE";
  const hasThirds = snapshot.majorThirdCents != null && snapshot.minorThirdCents != null;
  if (hasAnchor && hasThirds) return "PAPER_OPERATIONAL";
  if (hasAnchor || hasThirds) return "PAPER_PARTIAL";
  return "PAPER_BLOCKED";
}

/**
 * Summarizes the existing strict snapshot without changing any decision gate.
 * Broker asset metadata remains indicative. Strict readiness is derived from
 * immutable, account-specific locate evidence embedded in the snapshot.
 */
export function summarizeMooReadiness(
  snapshot: MooDecisionSnapshot,
  broker?: MooBrokerReadinessInput | null,
  strictArtifact?: MooDecisionArtifact | null,
): MooReadinessSummary {
  const requiredPolicy = validateMooRequiredSourceIds(snapshot.requiredSourceIds);
  const requiredSourceIds: readonly MooSourceHealth["id"][] = requiredPolicy.valid ? snapshot.requiredSourceIds : ["US"];
  const requiredSet = new Set(requiredSourceIds);
  const evaluatedAt = snapshot.frozenAt ?? snapshot.generatedAt;
  const requiredNow = groupSources(snapshot.sources, "REQUIRED_NOW", requiredSourceIds, evaluatedAt);
  const optionalResearch = groupSources(
    snapshot.sources,
    "OPTIONAL_RESEARCH",
    SOURCE_IDS_BY_ROLE.OPTIONAL_RESEARCH.filter((id) => !requiredSet.has(id)),
    evaluatedAt,
  );
  const postFreezeMonitoring = groupSources(
    snapshot.sources,
    "POST_FREEZE_MONITORING",
    SOURCE_IDS_BY_ROLE.POST_FREEZE_MONITORING.filter((id) => !requiredSet.has(id)),
    evaluatedAt,
  );
  const indicativeBorrowStatusCode = borrowStatusCode(broker?.borrowStatus);
  // Preserve the public broker-status contract as indicative metadata only.
  // This claim cannot replace the immutable locate evidence validated below.
  const brokerLocateMetadataClaimed = broker?.locateGuaranteed === true;
  void brokerLocateMetadataClaimed;
  const schedule = nasdaqSessionSchedule(snapshot.targetSession);
  const locateEvaluationAt = snapshot.frozenAt ?? snapshot.generatedAt;
  const guaranteedLocateConfirmed = snapshot.shortTicket.accountLabel != null &&
    snapshot.shortTicket.quantity != null &&
    validateMooLocateProof(snapshot.shortLocateProof, {
      accountAlias: snapshot.shortTicket.accountLabel,
      targetSession: snapshot.targetSession,
      quantity: snapshot.shortTicket.quantity,
      availableBy: locateEvaluationAt,
      validThrough: schedule.finalEntryAt,
    }).valid;
  const strictLocateReady = snapshot.shortTicket.shortability === "AVAILABLE" && guaranteedLocateConfirmed;
  const artifactAuthorized = artifactAuthorizesSnapshot(snapshot, strictArtifact);
  const blocker = requiredPolicy.valid
    ? dominantBlocker(snapshot, requiredNow, strictLocateReady, artifactAuthorized)
    : "FEED_NOT_ENTITLED";

  return {
    sourceGroups: { requiredNow, optionalResearch, postFreezeMonitoring },
    requiredReady: requiredNow.ready,
    requiredTotal: requiredNow.total,
    optionalAvailable: optionalResearch.available,
    optionalTotal: optionalResearch.total,
    connectionMode: "REST_POLLING",
    dominantBlockerCode: blocker,
    strictCommissionState: commissionState(snapshot, blocker),
    researchOperationalState: researchState(requiredNow, optionalResearch),
    paperOperationalState: paperState(snapshot),
    broker: {
      indicativeShortable: broker?.shortable ?? null,
      indicativeBorrowStatusCode,
      indicativeEasyToBorrow: indicativeBorrowStatusCode === "EASY_TO_BORROW",
      guaranteedLocateConfirmed,
      strictLocateReady,
    },
  };
}
