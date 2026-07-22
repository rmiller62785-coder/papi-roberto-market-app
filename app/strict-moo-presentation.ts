import type { MooDecisionSnapshot, MooSourceHealth } from "./moo-contract.ts";
import type { MooSystemStatus } from "./moo-system-status.ts";

export type StrictJourneyState =
  | "live"
  | "pending"
  | "stale"
  | "unavailable"
  | "closed"
  | "not_applicable";

export type StrictJourneyStageId = "source" | "model" | "freeze" | "ticket" | "fill";

export type StrictJourneyStage = {
  id: StrictJourneyStageId;
  state: StrictJourneyState;
  current: boolean;
};

export type StrictMooPresentationInput = {
  snapshot: MooDecisionSnapshot;
  transport?: MooSystemStatus["transport"] | null;
  commissioning?: {
    executionMode: string;
    modelPromoted: boolean;
    artifactValidated: boolean;
    artifactStoreState: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
    statusEvaluatedAt: number | null;
    riskPolicyVersion: string | null;
  } | null;
  statusUnavailable?: boolean;
  deliveryState?: "live" | "retrying" | "expired" | "offline" | "loading";
  nowMs: number;
};

export type StrictMooPresentation = {
  stages: StrictJourneyStage[];
  currentStage: StrictJourneyStageId;
  sourceStageState: StrictJourneyState;
  streamState: StrictJourneyState;
  quoteState: StrictJourneyState;
  browserState: StrictJourneyState;
  usSource: MooSourceHealth | null;
  modelReady: boolean;
  artifactReady: boolean;
  ticketReady: boolean;
  fillAuditReady: boolean;
};

function strictQuoteState(
  snapshot: MooDecisionSnapshot,
  source: MooSourceHealth | null,
  statusUnavailable: boolean,
  nowMs: number,
): StrictJourneyState {
  if (snapshot.lifecycle === "MARKET_CLOSED" || source?.state === "CLOSED") return "closed";
  if (snapshot.lifecycle === "FUTURE_SESSION" || snapshot.blockReason === "TARGET_SESSION_NOT_STARTED") return "pending";
  if (statusUnavailable) return "unavailable";
  if (source?.state === "LIVE" && source.entitlement === "REALTIME" && source.coverage === "CONSOLIDATED_SIP") {
    if (source.validUntil != null && nowMs > source.validUntil) return "stale";
    return "live";
  }
  if (source?.state === "DEGRADED" || source?.state === "DELAYED" || snapshot.blockReason === "STALE_US_QUOTE") {
    return "stale";
  }
  if (snapshot.blockReason === "DATA_PENDING" && source?.entitlement !== "NOT_ENTITLED") return "pending";
  return "unavailable";
}

function strictStreamState(
  transport: MooSystemStatus["transport"] | null | undefined,
  statusUnavailable: boolean,
): StrictJourneyState {
  if (statusUnavailable) return "unavailable";
  if (transport?.noteCode === "DURABLE_STREAM_SERVICE_ENABLED" && transport.stream.state === "LIVE") return "live";
  if (transport?.noteCode === "DURABLE_STREAM_SERVICE_STALE" || transport?.stream.state === "STALE") return "stale";
  if (transport == null) return "pending";
  return "unavailable";
}

function nextStageState(
  prerequisite: StrictJourneyState,
  ready: boolean,
  waiting: boolean,
): StrictJourneyState {
  if (prerequisite !== "live") return "not_applicable";
  if (ready) return "live";
  return waiting ? "pending" : "unavailable";
}

/**
 * Convert the server-authored Strict status into display-only journey states.
 * This mapper never promotes readiness: every green state requires evidence
 * already present in the validated v2 response.
 */
export function deriveStrictMooPresentation(input: StrictMooPresentationInput): StrictMooPresentation {
  const { snapshot, commissioning, nowMs } = input;
  const deliveryState = input.deliveryState ?? (input.statusUnavailable ? "expired" : "live");
  const statusUnavailable = input.statusUnavailable === true || ["expired", "offline"].includes(deliveryState) ||
    snapshot.warnings.includes("LAST_GOOD_SERVER_AUDIT_ONLY");
  const usSource = snapshot.sources.find((source) => source.id === "US") ?? null;
  const quoteState = strictQuoteState(snapshot, usSource, statusUnavailable, nowMs);
  const streamState = strictStreamState(input.transport, statusUnavailable);
  const browserState: StrictJourneyState = statusUnavailable
    ? "unavailable"
    : deliveryState === "retrying"
      ? "stale"
      : deliveryState === "loading"
        ? "pending"
        : "live";
  const browserEvidenceAvailable = browserState === "live" || browserState === "stale";
  const sourceStageState = quoteState === "closed"
    ? "closed"
    : quoteState === "pending"
      ? "pending"
      : quoteState === "stale" || streamState === "stale"
        ? "stale"
        : quoteState === "live" && streamState === "live" && browserEvidenceAvailable
          ? "live"
          : "unavailable";

  const artifactReady = commissioning?.artifactValidated === true && snapshot.frozenAt != null;
  const modelReady = commissioning?.modelPromoted === true &&
    Boolean(snapshot.modelVersion?.trim() && snapshot.featureSchemaVersion?.trim());
  // A promoted model and a validated frozen artifact are historical evidence.
  // Current transport degradation must remain visible in the source stage, but
  // it cannot erase evidence that was already validated at the decision cutoff.
  const modelState: StrictJourneyState = modelReady
    ? "live"
    : nextStageState(sourceStageState, false, false);

  const freezeAt = snapshot.deadlines.find((deadline) => deadline.label === "DECISION_FREEZE")?.at ?? snapshot.actionCutoffAt;
  const freezeState: StrictJourneyState = artifactReady
    ? "live"
    : nextStageState(modelState, false, nowMs < freezeAt);

  const favoredTicket = snapshot.decision === "LONG_FAVORED"
    ? snapshot.longTicket
    : snapshot.decision === "SHORT_FAVORED"
      ? snapshot.shortTicket
      : null;
  const commissionedNoTrade = modelReady && snapshot.decision === "NO_TRADE" && snapshot.decisionReasonCode === "NO_EDGE";
  const executionAuthorized = commissioning != null && commissioning.executionMode !== "NOT_COMMISSIONED";
  const ticketReady = !statusUnavailable && executionAuthorized && artifactReady && (favoredTicket?.actionable === true || commissionedNoTrade) &&
    (favoredTicket == null || Boolean(commissioning?.riskPolicyVersion?.trim()));
  const ticketState = nextStageState(freezeState, ticketReady, artifactReady && executionAuthorized);

  const fillAuditReady = snapshot.lifecycle === "CROSS_COMPLETE" &&
    snapshot.actualOfficialOpenCents != null &&
    (snapshot.decision === "NO_TRADE" || favoredTicket?.actualFillCents != null);
  const fillState: StrictJourneyState = ticketState !== "live"
    ? "not_applicable"
    : fillAuditReady
      ? "live"
      : "pending";

  const states: Array<[StrictJourneyStageId, StrictJourneyState]> = [
    ["source", sourceStageState],
    ["model", modelState],
    ["freeze", freezeState],
    ["ticket", ticketState],
    ["fill", fillState],
  ];
  const currentStage = artifactReady
    ? states.slice(3).find(([, state]) => state !== "live" && state !== "not_applicable")?.[0] ??
      states.slice(3).find(([, state]) => state === "not_applicable")?.[0] ?? "fill"
    : states.find(([, state]) => state !== "live" && state !== "not_applicable")?.[0] ??
      states.find(([, state]) => state === "not_applicable")?.[0] ?? "fill";

  return {
    stages: states.map(([id, state]) => ({ id, state, current: id === currentStage })),
    currentStage,
    sourceStageState,
    streamState,
    quoteState,
    browserState,
    usSource,
    modelReady,
    artifactReady,
    ticketReady,
    fillAuditReady,
  };
}
