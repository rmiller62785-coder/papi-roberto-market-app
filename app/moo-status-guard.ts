import {
  MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
  MOO_STREAM_SOURCE_LAG_MAX_MS,
  type MooSystemStatus,
} from "./moo-system-status.ts";

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
    value.validUntil === undefined && value.reasonCode === undefined && value.state === "UNAVAILABLE";
}

function strictStreamPayload(value: unknown, persistent: boolean, noteCode: unknown) {
  if (!objectValue(value) || !member(value.state, ["LIVE", "STALE", "UNAVAILABLE"]) ||
    nullableText(value.streamId) === false || nullableText(value.provider) === false ||
    !(value.feed == null || member(value.feed, ["iex", "sip"])) ||
    !(value.coverageScope == null || member(value.coverageScope, ["SINGLE_EXCHANGE", "CONSOLIDATED_SIP"])) ||
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
      safeTimestamp(value.heartbeatAt) && safeTimestamp(value.sourceAvailableAt) &&
      safeTimestamp(value.heartbeatAgeMs) && safeTimestamp(value.sourceLagMs) &&
      value.heartbeatAgeMs <= value.maxHeartbeatAgeMs && value.sourceLagMs <= value.maxSourceLagMs;
  }
  if (value.state === "STALE") {
    return !persistent && noteCode === "DURABLE_STREAM_SERVICE_STALE";
  }
  return !persistent && noteCode === "DURABLE_STREAM_SERVICE_NOT_CONFIGURED" &&
    value.streamId === null && value.provider === null && value.feed === null && value.coverageScope === null &&
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
  if (!objectValue(value) || value.schemaVersion !== "moo-system-status-v1" ||
    value.policyVersion !== "strict-moo-commissioning-v1" || value.targetSession !== targetDate ||
    value.executionMode !== "NOT_COMMISSIONED" || value.decisionAuthority !== "SERVER" ||
    !safeTimestamp(value.evaluatedAt) || value.validUntil !== value.evaluatedAt + 45_000 ||
    !objectValue(value.decisionSnapshot) || !objectValue(value.transport) ||
    !objectValue(value.commissioningEvidence) || !Array.isArray(value.blockers) ||
    value.blockers.length !== 4 || new Set(value.blockers).size !== 4 || !value.blockers.every((blocker) => member(blocker, [
      "CONSOLIDATED_US_FEED_NOT_ENTITLED", "TRAINED_MODEL_NOT_PROMOTED",
      "IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE", "ACCOUNT_LOCATE_NOT_AVAILABLE",
    ])) || value.commissioningEvidence.modelPromoted !== false ||
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
    member(snapshot.blockReason, ["MARKET_CLOSED", "TARGET_SESSION_NOT_STARTED", "DATA_PENDING", "STALE_US_QUOTE", "FEED_NOT_ENTITLED", "MODEL_NOT_TRAINED", "LOW_DATA_QUALITY", "LOW_CONFIDENCE", "SHORTABILITY_UNCONFIRMED"]) &&
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
    snapshot.sources.every(uncommissionedSourcePayload) &&
    Array.isArray(snapshot.deadlines) && snapshot.deadlines.every(strictDeadlinePayload) &&
    Array.isArray(snapshot.warnings) && snapshot.warnings.every((warning) => typeof warning === "string") &&
    uncommissionedTicketPayload(snapshot.longTicket, "LONG") && uncommissionedTicketPayload(snapshot.shortTicket, "SHORT") &&
    snapshot.shortLocateProof == null && Array.isArray(snapshot.requiredSourceIds) &&
    snapshot.requiredSourceIds.length === 1 && snapshot.requiredSourceIds[0] === "US";

  const expectedRoles = new Map<string, string>([
    ["US", "REQUIRED"], ["NVD", "OPTIONAL_RESEARCH"], ["FX", "OPTIONAL_RESEARCH"],
    ["FUTURES", "OPTIONAL_RESEARCH"], ["NOII", "POST_FREEZE_MONITORING"],
  ]);

  return snapshotValid && value.transport.browser === "ADAPTIVE_REST_POLLING" &&
    typeof value.transport.persistentUpstreamSupervisor === "boolean" &&
    member(value.transport.noteCode, ["DURABLE_STREAM_SERVICE_NOT_CONFIGURED", "DURABLE_STREAM_SERVICE_STALE", "DURABLE_STREAM_SERVICE_ENABLED"]) &&
    strictStreamPayload(value.transport.stream, value.transport.persistentUpstreamSupervisor, value.transport.noteCode) &&
    Array.isArray(value.sourceRoles) && value.sourceRoles.length === expectedRoles.size &&
    new Set(value.sourceRoles.map((role) => objectValue(role) ? role.id : null)).size === expectedRoles.size &&
    value.sourceRoles.every((role) => objectValue(role) && typeof role.id === "string" && role.role === expectedRoles.get(role.id)) &&
    strictBrokerPayload(value.brokerReference);
}
