import {
  isStrictUsSourceReady,
  MOO_STRICT_US_QUOTE_MAX_AGE_MS,
  MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
  MOO_STREAM_SOURCE_LAG_MAX_MS,
  type MooSystemStatus,
} from "./moo-system-status.ts";
import { MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS } from "./moo-contract.ts";

type JsonObject = Record<string, unknown>;

const SOURCE_IDS = ["US", "NVD", "FX", "FUTURES", "NOII"] as const;
const VALUE_STATES = [
  "AVAILABLE", "FROZEN", "PENDING", "NOT_STARTED", "MARKET_CLOSED", "STALE",
  "NOT_ENTITLED", "NOT_CONFIGURED", "NOT_PROMOTED", "NO_EDGE",
  "MISSED_CHECKPOINT", "INVALID", "UNAVAILABLE", "INSUFFICIENT_BARS",
] as const;
const REASON_CODES = [
  "VALUE_PRESENT", "AWAITING_SESSION_START", "AWAITING_MARKET_DATA", "MARKET_IS_CLOSED",
  "SOURCE_STALE", "SOURCE_NOT_ENTITLED", "USER_CONFIGURATION_REQUIRED",
  "MODEL_PROMOTION_REQUIRED", "MODEL_FOUND_NO_EDGE", "CHECKPOINT_NOT_CAPTURED",
  "VALIDATION_FAILED", "SOURCE_UNAVAILABLE", "INSUFFICIENT_COMPLETED_BARS",
] as const;

function objectValue(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function member(value: unknown, values: readonly string[]) {
  return typeof value === "string" && values.includes(value);
}

function safeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableTimestamp(value: unknown) {
  return value == null || safeTimestamp(value);
}

function nullableFinite(value: unknown) {
  return value == null || (typeof value === "number" && Number.isFinite(value));
}

function nullableText(value: unknown) {
  return value == null || typeof value === "string";
}

function nullableBoolean(value: unknown) {
  return value == null || typeof value === "boolean";
}

function strictTicketPayload(value: unknown, side: "LONG" | "SHORT") {
  if (!objectValue(value)) return false;
  const numericFields = [
    "assignedDistanceCents", "targetMoveCents", "estimatedFillCents", "estimatedTargetCents",
    "actualFillCents", "rebasedTargetCents", "stopOffsetCents", "quantity", "reserveCents",
    "maximumLossCents",
  ];
  return value.side === side && value.orderType === "MOO" &&
    typeof value.favored === "boolean" && typeof value.actionable === "boolean" &&
    member(value.thirdRole, ["MAJOR", "MINOR", "UNASSIGNED"]) &&
    numericFields.every((field) => nullableFinite(value[field])) &&
    nullableText(value.accountLabel) && nullableText(value.timeStop) &&
    member(value.shortability, ["NOT_APPLICABLE", "UNCONFIRMED", "AVAILABLE", "UNAVAILABLE"]);
}

function uncommissionedTicketPayload(value: unknown, side: "LONG" | "SHORT") {
  if (!strictTicketPayload(value, side) || !objectValue(value)) return false;
  const emptyFields = [
    "assignedDistanceCents", "targetMoveCents", "estimatedFillCents", "estimatedTargetCents",
    "actualFillCents", "rebasedTargetCents", "stopOffsetCents", "quantity", "accountLabel",
    "reserveCents", "maximumLossCents", "timeStop",
  ];
  return value.favored === false && value.actionable === false && value.thirdRole === "UNASSIGNED" &&
    emptyFields.every((field) => value[field] === null) &&
    value.shortability === (side === "LONG" ? "NOT_APPLICABLE" : "UNCONFIRMED");
}

function strictSourcePayload(value: unknown) {
  if (!objectValue(value)) return false;
  return member(value.id, SOURCE_IDS) && typeof value.label === "string" &&
    nullableText(value.venue) && nullableText(value.provider) &&
    member(value.entitlement, ["REALTIME", "DELAYED", "LIMITED", "NOT_ENTITLED", "UNAVAILABLE"]) &&
    (value.coverage === undefined || member(value.coverage, [
      "CONSOLIDATED_SIP", "IEX_SINGLE_EXCHANGE", "DIRECT_VENUE", "INSTITUTIONAL_FX",
      "CME_ENTITLED", "NASDAQ_NOII", "UNKNOWN",
    ])) &&
    nullableTimestamp(value.observedAt) && nullableTimestamp(value.checkedAt) &&
    nullableFinite(value.ageMs) &&
    (value.receivedAt === undefined || nullableTimestamp(value.receivedAt)) &&
    (value.processedAt === undefined || nullableTimestamp(value.processedAt)) &&
    (value.availableAt === undefined || nullableTimestamp(value.availableAt)) &&
    (value.validUntil === undefined || nullableTimestamp(value.validUntil)) &&
    (value.reasonCode === undefined || member(value.reasonCode, REASON_CODES)) &&
    member(value.state, ["LIVE", "DEGRADED", "DELAYED", "CLOSED", "UNAVAILABLE"]);
}

function uncommissionedSourcePayload(value: unknown) {
  return strictSourcePayload(value) && objectValue(value) && value.provider === null &&
    value.entitlement === "NOT_ENTITLED" && value.coverage === undefined &&
    value.observedAt === null && value.checkedAt === null && value.ageMs === null &&
    value.receivedAt === undefined && value.processedAt === undefined && value.availableAt === undefined &&
    value.validUntil === undefined && (
      (value.reasonCode === undefined && value.state === "UNAVAILABLE") ||
      (value.reasonCode === "MARKET_IS_CLOSED" && value.state === "CLOSED")
    );
}

function paidSipUsSourcePayload(value: unknown, evaluatedAt: number) {
  if (!strictSourcePayload(value) || !objectValue(value) || value.id !== "US" ||
    value.label !== "U.S. NVDA execution quote" || value.venue !== "U.S. consolidated SIP" ||
    value.provider !== "Alpaca SIP" ||
    value.coverage !== "CONSOLIDATED_SIP" || value.checkedAt !== evaluatedAt) return false;
  if (value.state === "LIVE") return value.entitlement === "REALTIME" &&
    isStrictUsSourceReady(value as unknown as MooSystemStatus["decisionSnapshot"]["sources"][number], evaluatedAt);
  if (value.state === "DEGRADED") {
    return value.entitlement === "REALTIME" && value.reasonCode === "SOURCE_STALE" && safeTimestamp(value.observedAt) &&
      safeTimestamp(value.receivedAt) && safeTimestamp(value.processedAt) && safeTimestamp(value.availableAt) &&
      safeTimestamp(value.validUntil) && value.validUntil === value.observedAt + MOO_STRICT_US_QUOTE_MAX_AGE_MS &&
      value.observedAt <= value.receivedAt + MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS && value.receivedAt <= value.processedAt &&
      value.processedAt <= value.availableAt && value.availableAt <= evaluatedAt &&
      value.ageMs === evaluatedAt - value.observedAt && value.ageMs > MOO_STRICT_US_QUOTE_MAX_AGE_MS;
  }
  return member(value.entitlement, ["REALTIME", "UNAVAILABLE"]) &&
    member(value.state, ["CLOSED", "UNAVAILABLE"]) && value.observedAt === null && value.ageMs === null &&
    value.receivedAt === undefined && value.processedAt === undefined && value.availableAt === undefined &&
    value.validUntil === undefined &&
    value.reasonCode === (value.state === "CLOSED" ? "MARKET_IS_CLOSED" : "SOURCE_UNAVAILABLE");
}

function strictStreamPayload(value: unknown, persistent: boolean, noteCode: unknown, evaluatedAt: number) {
  if (!objectValue(value) || !member(value.state, ["LIVE", "STALE", "UNAVAILABLE"]) ||
    nullableText(value.streamId) === false || nullableText(value.provider) === false ||
    !(value.feed == null || member(value.feed, ["iex", "sip"])) ||
    !(value.coverageScope == null || member(value.coverageScope, ["SINGLE_EXCHANGE", "CONSOLIDATED_SIP"])) ||
    nullableText(value.connectionEpoch) === false ||
    !nullableTimestamp(value.heartbeatAt) || !nullableTimestamp(value.sourceAvailableAt) ||
    !nullableTimestamp(value.heartbeatAgeMs) || !nullableTimestamp(value.sourceLagMs) ||
    value.maxHeartbeatAgeMs !== MOO_STREAM_HEARTBEAT_MAX_AGE_MS ||
    value.maxSourceLagMs !== MOO_STREAM_SOURCE_LAG_MAX_MS || typeof value.detailCode !== "string") return false;
  if (value.state === "LIVE") {
    return persistent && noteCode === "DURABLE_STREAM_SERVICE_ENABLED" &&
      typeof value.streamId === "string" && value.streamId.length > 0 &&
      typeof value.provider === "string" && value.provider.length > 0 &&
      member(value.feed, ["iex", "sip"]) &&
      value.coverageScope === (value.feed === "sip" ? "CONSOLIDATED_SIP" : "SINGLE_EXCHANGE") &&
      typeof value.connectionEpoch === "string" && value.connectionEpoch.startsWith(`${value.streamId}:`) &&
      /^\d+$/.test(value.connectionEpoch.slice(value.streamId.length + 1)) &&
      safeTimestamp(value.heartbeatAt) && safeTimestamp(value.sourceAvailableAt) &&
      safeTimestamp(value.heartbeatAgeMs) && safeTimestamp(value.sourceLagMs) &&
      value.heartbeatAt <= evaluatedAt && value.sourceAvailableAt <= evaluatedAt &&
      value.heartbeatAgeMs === evaluatedAt - value.heartbeatAt &&
      value.sourceLagMs === evaluatedAt - value.sourceAvailableAt &&
      value.heartbeatAgeMs <= value.maxHeartbeatAgeMs && value.sourceLagMs <= value.maxSourceLagMs;
  }
  if (value.state === "STALE") {
    const heartbeatCoherent = value.heartbeatAt === null
      ? value.heartbeatAgeMs === null
      : safeTimestamp(value.heartbeatAt) && value.heartbeatAt <= evaluatedAt &&
        value.heartbeatAgeMs === evaluatedAt - value.heartbeatAt;
    const sourceCoherent = value.sourceAvailableAt === null
      ? value.sourceLagMs === null
      : safeTimestamp(value.sourceAvailableAt) && value.sourceAvailableAt <= evaluatedAt &&
        value.sourceLagMs === evaluatedAt - value.sourceAvailableAt;
    return !persistent && noteCode === "DURABLE_STREAM_SERVICE_STALE" && heartbeatCoherent && sourceCoherent;
  }
  return !persistent && member(noteCode, ["DURABLE_STREAM_SERVICE_NOT_CONFIGURED", "DURABLE_STREAM_SERVICE_UNAVAILABLE"]) &&
    value.streamId === null && value.provider === null && value.feed === null && value.coverageScope === null &&
    value.connectionEpoch === null &&
    value.heartbeatAt === null && value.sourceAvailableAt === null && value.heartbeatAgeMs === null && value.sourceLagMs === null;
}

function strictDeadlinePayload(value: unknown) {
  return objectValue(value) &&
    member(value.label, ["DECISION_FREEZE", "MODIFY_CANCEL", "FINAL_ENTRY"]) &&
    safeTimestamp(value.at) && typeof value.passed === "boolean" &&
    typeof value.remainingMs === "number" && Number.isFinite(value.remainingMs);
}

function strictBrokerPayload(value: unknown) {
  if (!objectValue(value) || !objectValue(value.freshness)) return false;
  return value.provider === "Alpaca Paper Trading API" && value.environment === "paper" &&
    value.symbol === "NVDA" && typeof value.configured === "boolean" &&
    nullableText(value.assetStatus) && nullableBoolean(value.tradable) &&
    nullableBoolean(value.shortable) && nullableText(value.borrowStatus) &&
    member(value.borrowStatusSource, ["borrow_status", "easy_to_borrow", "unavailable"]) &&
    safeTimestamp(value.checkedAt) &&
    member(value.freshness.state, ["fresh", "cached", "stale", "unavailable"]) &&
    nullableFinite(value.freshness.ageMs) && value.freshness.maxAgeMs === 60_000 &&
    member(value.status, ["live", "limited", "offline"]) && typeof value.detail === "string" &&
    value.indicativeOnly === true && value.locateGuaranteed === false;
}

/**
 * Fail-closed browser boundary for the server-authored Strict MOO status.
 * A malformed last-good payload must never reach readiness or locate logic.
 */
export function isMooSystemStatus(value: unknown, targetDate: string): value is MooSystemStatus {
  if (!objectValue(value) || value.schemaVersion !== "moo-system-status-v2" ||
    value.policyVersion !== "strict-moo-commissioning-v2" || value.targetSession !== targetDate ||
    value.executionMode !== "NOT_COMMISSIONED" || value.decisionAuthority !== "SERVER" ||
    !safeTimestamp(value.evaluatedAt) || !safeTimestamp(value.validUntil) ||
    value.validUntil < value.evaluatedAt || value.validUntil > value.evaluatedAt + 45_000 ||
    !objectValue(value.decisionSnapshot) || !objectValue(value.transport) ||
    !objectValue(value.commissioningEvidence) || !Array.isArray(value.blockers) ||
    ![3, 4].includes(value.blockers.length) || new Set(value.blockers).size !== value.blockers.length || !value.blockers.every((blocker) => member(blocker, [
      "CONSOLIDATED_US_FEED_NOT_ENTITLED", "TRAINED_MODEL_NOT_PROMOTED",
      "IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE", "ACCOUNT_LOCATE_NOT_AVAILABLE",
    ])) || !["TRAINED_MODEL_NOT_PROMOTED", "IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE", "ACCOUNT_LOCATE_NOT_AVAILABLE"]
      .every((blocker) => value.blockers.includes(blocker)) || value.commissioningEvidence.modelPromoted !== false ||
    value.commissioningEvidence.artifactValidated !== false ||
    value.commissioningEvidence.riskPolicyVersion !== null) return false;

  const snapshot = value.decisionSnapshot;
  const numericFields = [
    "predictedOfficialOpenCents", "actualOfficialOpenCents", "predictionErrorCents",
    "confidencePct", "dataQualityScore", "previousRangeCents", "premarketRangeCents",
    "previousEffectiveThirdCents", "premarketEffectiveThirdCents", "majorThirdCents", "minorThirdCents",
  ];
  const snapshotValid = snapshot.schemaVersion === "moo-phase1-v1" &&
    typeof snapshot.snapshotId === "string" && snapshot.snapshotId.length > 0 &&
    snapshot.targetSession === targetDate && snapshot.generatedAt === value.evaluatedAt &&
    snapshot.frozenAt === null &&
    member(snapshot.lifecycle, ["FUTURE_SESSION", "MARKET_CLOSED", "PREPARING", "READY", "FROZEN", "LATE_LOCKED", "ENTRY_CLOSED", "CROSS_COMPLETE"]) &&
    snapshot.decision === "NO_TRADE" && snapshot.decisionReasonCode === "GATE_BLOCKED" &&
    member(snapshot.blockReason, ["MARKET_CLOSED", "ENTRY_WINDOW_CLOSED", "TARGET_SESSION_NOT_STARTED", "DATA_PENDING", "STALE_US_QUOTE", "FEED_NOT_ENTITLED", "MODEL_NOT_TRAINED", "LOW_DATA_QUALITY", "LOW_CONFIDENCE", "SHORTABILITY_UNCONFIRMED"]) &&
    member(snapshot.predictedOpenState, VALUE_STATES) &&
    (snapshot.confidenceState === undefined || member(snapshot.confidenceState, VALUE_STATES)) &&
    (snapshot.dataQualityState === undefined || member(snapshot.dataQualityState, VALUE_STATES)) &&
    numericFields.every((field) => snapshot[field] === null) &&
    snapshot.officialOpenSource === null && snapshot.modelVersion === null &&
    snapshot.featureSnapshotId === null && snapshot.featureSchemaVersion === null &&
    safeTimestamp(snapshot.actionCutoffAt) && [3300, 3333].includes(Number(snapshot.thirdPercentBasisPoints)) &&
    snapshot.tickSizeCents === 1 && typeof snapshot.addOneTick === "boolean" &&
    typeof snapshot.takeProfitCushionCents === "number" && Number.isFinite(snapshot.takeProfitCushionCents) &&
    Array.isArray(snapshot.sources) && snapshot.sources.length === SOURCE_IDS.length &&
    new Set(snapshot.sources.map((source) => objectValue(source) ? source.id : null)).size === SOURCE_IDS.length &&
    SOURCE_IDS.every((id) => snapshot.sources.some((source) => objectValue(source) && source.id === id)) &&
    snapshot.sources.every((source) => objectValue(source) && source.id === "US"
      ? uncommissionedSourcePayload(source) || paidSipUsSourcePayload(source, value.evaluatedAt)
      : uncommissionedSourcePayload(source)) &&
    Array.isArray(snapshot.deadlines) && snapshot.deadlines.every(strictDeadlinePayload) &&
    Array.isArray(snapshot.warnings) && snapshot.warnings.every((warning) => typeof warning === "string") &&
    uncommissionedTicketPayload(snapshot.longTicket, "LONG") && uncommissionedTicketPayload(snapshot.shortTicket, "SHORT") &&
    snapshot.shortLocateProof == null && Array.isArray(snapshot.requiredSourceIds) &&
    snapshot.requiredSourceIds.length === 1 && snapshot.requiredSourceIds[0] === "US";

  const expectedRoles = new Map<string, string>([
    ["US", "REQUIRED"], ["NVD", "OPTIONAL_RESEARCH"], ["FX", "OPTIONAL_RESEARCH"],
    ["FUTURES", "OPTIONAL_RESEARCH"], ["NOII", "POST_FREEZE_MONITORING"],
  ]);

  const usSource = snapshot.sources.find((source) => objectValue(source) && source.id === "US");
  const usReady = isStrictUsSourceReady(usSource as unknown as MooSystemStatus["decisionSnapshot"]["sources"][number], value.evaluatedAt);
  const usTransportConsistent = !usReady || (value.transport.persistentUpstreamSupervisor === true &&
    objectValue(value.transport.stream) && value.transport.stream.state === "LIVE" &&
    value.transport.stream.feed === "sip" && value.transport.stream.coverageScope === "CONSOLIDATED_SIP");
  const feedBlockerConsistent = value.blockers.includes("CONSOLIDATED_US_FEED_NOT_ENTITLED") === !usReady &&
    (!usReady || value.validUntil === (usSource as MooSystemStatus["decisionSnapshot"]["sources"][number]).validUntil);

  return snapshotValid && usTransportConsistent && feedBlockerConsistent && value.transport.browser === "ADAPTIVE_REST_POLLING" &&
    typeof value.transport.persistentUpstreamSupervisor === "boolean" &&
    member(value.transport.noteCode, ["DURABLE_STREAM_SERVICE_NOT_CONFIGURED", "DURABLE_STREAM_SERVICE_UNAVAILABLE", "DURABLE_STREAM_SERVICE_STALE", "DURABLE_STREAM_SERVICE_ENABLED"]) &&
    strictStreamPayload(value.transport.stream, value.transport.persistentUpstreamSupervisor, value.transport.noteCode, value.evaluatedAt) &&
    Array.isArray(value.sourceRoles) && value.sourceRoles.length === expectedRoles.size &&
    new Set(value.sourceRoles.map((role) => objectValue(role) ? role.id : null)).size === expectedRoles.size &&
    value.sourceRoles.every((role) => objectValue(role) && typeof role.id === "string" && role.role === expectedRoles.get(role.id)) &&
    strictBrokerPayload(value.brokerReference);
}
