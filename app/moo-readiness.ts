import type {
  MooBlockReason,
  MooDecisionSnapshot,
  MooSourceHealth,
} from "./moo-contract.ts";

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

function sourceAvailable(source: MooSourceHealth | undefined) {
  return source != null && ["LIVE", "DEGRADED", "DELAYED"].includes(source.state);
}

function sourceStrictReady(source: MooSourceHealth | undefined, duplicate: boolean) {
  return source != null && !duplicate && source.state === "LIVE" && source.entitlement === "REALTIME";
}

function groupSources(
  sources: MooSourceHealth[],
  role: MooSourceRole,
  sourceIds: readonly MooSourceHealth["id"][] = SOURCE_IDS_BY_ROLE[role],
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
      available,
      strictReady: sourceStrictReady(source, duplicate),
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
    if (!source.present || source.duplicate || source.entitlement !== "REALTIME") {
      return "FEED_NOT_ENTITLED";
    }
    if (source.state === "DEGRADED" || source.state === "DELAYED") {
      return source.id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (source.state !== "LIVE") return "DATA_PENDING";
  }
  return null;
}

function dominantBlocker(
  snapshot: MooDecisionSnapshot,
  requiredNow: MooReadinessGroup,
  strictLocateReady: boolean,
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
  if (snapshot.decision === "NO_TRADE") return "LOW_CONFIDENCE";
  if (snapshot.confidencePct == null) return "LOW_CONFIDENCE";
  if (snapshot.decision === "SHORT_FAVORED" && !strictLocateReady) {
    return "SHORTABILITY_UNCONFIRMED";
  }
  if (!snapshot.longTicket.actionable || !snapshot.shortTicket.actionable) {
    return "RISK_POLICY_UNCONFIGURED";
  }
  return "NONE";
}

function commissionState(
  snapshot: MooDecisionSnapshot,
  blocker: MooDominantBlockerCode,
): MooStrictCommissionState {
  const modelCommissioned = snapshot.blockReason !== "MODEL_NOT_TRAINED" &&
    Boolean(snapshot.modelVersion?.trim()) &&
    Boolean(snapshot.featureSchemaVersion?.trim());
  if (!modelCommissioned) return "NOT_COMMISSIONED";
  if (snapshot.decision === "NO_TRADE" && blocker === "LOW_CONFIDENCE") {
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
 * Broker asset metadata remains indicative; when supplied, only an explicit
 * guaranteed-locate flag can satisfy the summary's strict locate check.
 */
export function summarizeMooReadiness(
  snapshot: MooDecisionSnapshot,
  broker?: MooBrokerReadinessInput | null,
): MooReadinessSummary {
  const requiredSourceIds: readonly MooSourceHealth["id"][] = snapshot.requiredSourceIds?.length
    ? snapshot.requiredSourceIds
    : ["US"];
  const requiredSet = new Set(requiredSourceIds);
  const requiredNow = groupSources(snapshot.sources, "REQUIRED_NOW", requiredSourceIds);
  const optionalResearch = groupSources(
    snapshot.sources,
    "OPTIONAL_RESEARCH",
    SOURCE_IDS_BY_ROLE.OPTIONAL_RESEARCH.filter((id) => !requiredSet.has(id)),
  );
  const postFreezeMonitoring = groupSources(
    snapshot.sources,
    "POST_FREEZE_MONITORING",
    SOURCE_IDS_BY_ROLE.POST_FREEZE_MONITORING.filter((id) => !requiredSet.has(id)),
  );
  const indicativeBorrowStatusCode = borrowStatusCode(broker?.borrowStatus);
  const guaranteedLocateConfirmed = broker == null
    ? snapshot.shortTicket.shortability === "AVAILABLE"
    : broker.locateGuaranteed === true;
  const strictLocateReady = snapshot.shortTicket.shortability === "AVAILABLE" && guaranteedLocateConfirmed;
  const blocker = dominantBlocker(snapshot, requiredNow, strictLocateReady);

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
