import type {
  MooBlockReason,
  MooDecision,
  MooDecisionSnapshot,
  MooSide,
  MooSourceHealth,
  MooTicket,
} from "./moo-contract.ts";
import { mooDeadlines, mooLifecycleAt, nasdaqSessionSchedule } from "./market-session.ts";

export type MooPredictionInput = {
  targetSession: string;
  featureSnapshotId?: string | null;
  predictedOfficialOpenCents: number | null;
  decision: MooDecision;
  confidencePct: number | null;
  generatedAt: number;
  trained: boolean;
  modelVersion: string | null;
  featureSchemaVersion: string | null;
};

export type MooTicketConfiguration = {
  stopOffsetCents?: number | null;
  quantity?: number | null;
  accountLabel?: string | null;
  reserveCents?: number | null;
  maximumLossCents?: number | null;
  timeStop?: string | null;
};

export type MooStrategyConfiguration = {
  thirdPercentBasisPoints?: 3300 | 3333;
  addOneTick?: boolean;
  takeProfitCushionCents?: number;
  minimumConfidencePct?: number;
  minimumDataQualityScore?: number;
  maximumClockSkewMs?: number;
  maximumSourceAgeMs?: Partial<Record<MooSourceHealth["id"], number>>;
  portfolioMaximumLossCents?: number;
};

/**
 * Complete point-in-time decision state persisted at the actionable cutoff.
 * Outcome-only fields (official open and broker fills) intentionally remain
 * outside this context so they can be attached later without rewriting the
 * forecast.
 */
export type MooFrozenDecisionContext = {
  schemaVersion: "moo-phase1-v1";
  snapshotId: string;
  targetSession: string;
  frozenAt: number;
  prediction: MooPredictionInput;
  dataQualityScore: number | null;
  sources: MooSourceHealth[];
  requiredSourceIds: MooSourceHealth["id"][];
  previousHighCents: number | null;
  previousLowCents: number | null;
  premarketHighCents: number | null;
  premarketLowCents: number | null;
  shortability: MooTicket["shortability"];
  longTicket?: MooTicketConfiguration;
  shortTicket?: MooTicketConfiguration;
  config?: MooStrategyConfiguration;
};

export type BuildMooDecisionInput = {
  nowMs: number;
  targetSession: string;
  currentSession?: string | null;
  snapshotId?: string;
  prediction?: MooPredictionInput | null;
  frozenContext?: MooFrozenDecisionContext | null;
  /** @deprecated Persist and pass frozenContext after the cutoff. */
  frozenPrediction?: MooPredictionInput | null;
  /** @deprecated Persist and pass frozenContext after the cutoff. */
  frozenAt?: number | null;
  /** @deprecated Persist and pass frozenContext after the cutoff. */
  frozenSources?: MooSourceHealth[];
  dataQualityScore?: number | null;
  sources?: MooSourceHealth[];
  requiredSourceIds?: MooSourceHealth["id"][];
  previousHighCents?: number | null;
  previousLowCents?: number | null;
  premarketHighCents?: number | null;
  premarketLowCents?: number | null;
  actualOfficialOpenCents?: number | null;
  officialOpenSource?: string | null;
  longFillCents?: number | null;
  shortFillCents?: number | null;
  shortability?: MooTicket["shortability"];
  lateOrderAcknowledged?: boolean;
  longTicket?: MooTicketConfiguration;
  shortTicket?: MooTicketConfiguration;
  config?: MooStrategyConfiguration;
};

export type MooThirdCalculation = {
  previousRangeCents: number | null;
  premarketRangeCents: number | null;
  previousEffectiveThirdCents: number | null;
  premarketEffectiveThirdCents: number | null;
  majorThirdCents: number | null;
  minorThirdCents: number | null;
};

const DEFAULT_SOURCE_AGE_MS: Record<MooSourceHealth["id"], number> = {
  US: 2_000,
  NVD: 10_000,
  FX: 60_000,
  FUTURES: 10_000,
  NOII: 2_000,
};

function safeNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function safePercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function predictionRuntimeIdentityValid(prediction: MooPredictionInput, targetSession: string) {
  const basic = prediction.targetSession === targetSession &&
    safeNonnegativeInteger(prediction.generatedAt) &&
    (prediction.predictedOfficialOpenCents == null || safeNonnegativeInteger(prediction.predictedOfficialOpenCents)) &&
    (prediction.confidencePct == null || safePercent(prediction.confidencePct)) &&
    ["LONG_FAVORED", "SHORT_FAVORED", "NO_TRADE"].includes(prediction.decision) &&
    typeof prediction.trained === "boolean";
  if (!basic) return false;
  if (!prediction.trained) return true;
  return nonemptyString(prediction.modelVersion) &&
    nonemptyString(prediction.featureSchemaVersion) &&
    nonemptyString(prediction.featureSnapshotId);
}

function roundPositiveRatioHalfUp(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator <= 0) {
    throw new RangeError("fixed-point ratio exceeds safe integer precision");
  }
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/** Exact fixed-point third math. Inputs and output are integer cents. */
export function effectiveThirdCents(
  rangeCents: number,
  thirdPercentBasisPoints: 3300 | 3333 = 3300,
  addOneTick = true,
) {
  if (!safeNonnegativeInteger(rangeCents)) throw new RangeError("rangeCents must be a nonnegative integer");
  const rounded = roundPositiveRatioHalfUp(rangeCents * thirdPercentBasisPoints, 10_000);
  return rounded + (addOneTick ? 1 : 0);
}

function rangeCents(high: number | null | undefined, low: number | null | undefined) {
  return safeNonnegativeInteger(high) && safeNonnegativeInteger(low) && high >= low
    ? high - low
    : null;
}

export function calculateMooThirds(input: {
  previousHighCents?: number | null;
  previousLowCents?: number | null;
  premarketHighCents?: number | null;
  premarketLowCents?: number | null;
  thirdPercentBasisPoints?: 3300 | 3333;
  addOneTick?: boolean;
}): MooThirdCalculation {
  const previousRangeCents = rangeCents(input.previousHighCents, input.previousLowCents);
  const premarketRangeCents = rangeCents(input.premarketHighCents, input.premarketLowCents);
  const factor = input.thirdPercentBasisPoints ?? 3300;
  const addOneTick = input.addOneTick !== false;
  const previousEffectiveThirdCents = previousRangeCents == null
    ? null
    : effectiveThirdCents(previousRangeCents, factor, addOneTick);
  const premarketEffectiveThirdCents = premarketRangeCents == null
    ? null
    : effectiveThirdCents(premarketRangeCents, factor, addOneTick);
  const complete = previousEffectiveThirdCents != null && premarketEffectiveThirdCents != null;
  return {
    previousRangeCents,
    premarketRangeCents,
    previousEffectiveThirdCents,
    premarketEffectiveThirdCents,
    majorThirdCents: complete ? Math.max(previousEffectiveThirdCents, premarketEffectiveThirdCents) : null,
    minorThirdCents: complete ? Math.min(previousEffectiveThirdCents, premarketEffectiveThirdCents) : null,
  };
}

export function assignedThirdDistanceCents(
  side: MooSide,
  decision: MooDecision,
  majorThirdCents: number | null,
  minorThirdCents: number | null,
) {
  if (decision === "NO_TRADE" || majorThirdCents == null || minorThirdCents == null) return null;
  if (decision === "LONG_FAVORED") return side === "LONG" ? majorThirdCents : minorThirdCents;
  return side === "SHORT" ? majorThirdCents : minorThirdCents;
}

export function targetMoveCents(distanceCents: number, takeProfitCushionCents = 10) {
  if (!safeNonnegativeInteger(distanceCents) || !safeNonnegativeInteger(takeProfitCushionCents)) {
    throw new RangeError("distance and cushion must be nonnegative integer cents");
  }
  return Math.max(1, distanceCents - takeProfitCushionCents);
}

export function rebaseMooTargetCents(
  side: MooSide,
  fillCents: number | null | undefined,
  assignedDistanceCents: number | null | undefined,
  takeProfitCushionCents = 10,
) {
  if (!safeNonnegativeInteger(fillCents) || !safeNonnegativeInteger(assignedDistanceCents)) return null;
  const move = targetMoveCents(assignedDistanceCents, takeProfitCushionCents);
  return side === "LONG" ? fillCents + move : Math.max(0, fillCents - move);
}

function sourceGate(
  sources: MooSourceHealth[],
  requiredIds: MooSourceHealth["id"][],
  evaluatedAt: number,
  config: MooStrategyConfiguration,
  warnings: string[],
): MooBlockReason | null {
  const maxSkew = safeNonnegativeInteger(config.maximumClockSkewMs) ? config.maximumClockSkewMs : 1_000;
  for (const id of requiredIds) {
    const matchingSources = sources.filter((candidate) => candidate.id === id);
    if (matchingSources.length === 0) {
      warnings.push(`${id} source is unavailable.`);
      return "FEED_NOT_ENTITLED";
    }
    if (matchingSources.length !== 1) {
      warnings.push(`${id} has duplicate source-health records; the snapshot is ambiguous.`);
      return "FEED_NOT_ENTITLED";
    }
    const source = matchingSources[0];
    if (source.entitlement !== "REALTIME") {
      warnings.push(`${source.label} is ${source.entitlement.toLowerCase().replaceAll("_", " ")}; real-time entitlement is required.`);
      return "FEED_NOT_ENTITLED";
    }
    if (source.state === "UNAVAILABLE" || source.state === "CLOSED") {
      warnings.push(`${source.label} has no actionable observation.`);
      return "DATA_PENDING";
    }
    if (source.state !== "LIVE") {
      warnings.push(`${source.label} is ${source.state.toLowerCase()}.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (!safeNonnegativeInteger(source.observedAt) || !safeNonnegativeInteger(source.checkedAt)) {
      warnings.push(`${source.label} requires finite observation and API-check timestamps.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (source.observedAt > evaluatedAt + maxSkew || source.checkedAt > evaluatedAt + maxSkew) {
      warnings.push(`${source.label} has a future or clock-skewed timestamp.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (source.checkedAt < source.observedAt - maxSkew) {
      warnings.push(`${source.label} has an API check time that predates its observation.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    const derivedAge = Math.max(0, evaluatedAt - source.observedAt);
    if (source.ageMs != null && !safeNonnegativeInteger(source.ageMs)) {
      warnings.push(`${source.label} has an invalid source-age value.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    const age = source.ageMs == null ? derivedAge : Math.max(source.ageMs, derivedAge);
    const configuredMaximumAge = config.maximumSourceAgeMs?.[id];
    const maximumAge = safeNonnegativeInteger(configuredMaximumAge) ? configuredMaximumAge : DEFAULT_SOURCE_AGE_MS[id];
    if (age > maximumAge) {
      warnings.push(`${source.label} is stale by ${age} ms; limit is ${maximumAge} ms.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
  }
  return null;
}

function ticket(
  side: MooSide,
  decision: MooDecision,
  predictedOpenCents: number | null,
  actualFillCents: number | null | undefined,
  majorThirdCents: number | null,
  minorThirdCents: number | null,
  cushionCents: number,
  actionable: boolean,
  shortability: MooTicket["shortability"],
  configuration: MooTicketConfiguration | undefined,
): MooTicket {
  const assignedDistance = assignedThirdDistanceCents(side, decision, majorThirdCents, minorThirdCents);
  const move = assignedDistance == null ? null : targetMoveCents(assignedDistance, cushionCents);
  const favored = decision === `${side}_FAVORED`;
  const riskConfigured = ticketRiskConfigurationValid(configuration);
  return {
    side,
    orderType: "MOO",
    favored,
    actionable: actionable && riskConfigured,
    thirdRole: decision === "NO_TRADE" ? "UNASSIGNED" : favored ? "MAJOR" : "MINOR",
    assignedDistanceCents: assignedDistance,
    targetMoveCents: move,
    estimatedFillCents: predictedOpenCents,
    estimatedTargetCents: predictedOpenCents == null || move == null
      ? null
      : side === "LONG"
        ? predictedOpenCents + move
        : Math.max(0, predictedOpenCents - move),
    actualFillCents: safeNonnegativeInteger(actualFillCents) ? actualFillCents : null,
    rebasedTargetCents: rebaseMooTargetCents(side, actualFillCents, assignedDistance, cushionCents),
    stopOffsetCents: safeNonnegativeInteger(configuration?.stopOffsetCents) ? configuration!.stopOffsetCents! : null,
    quantity: safeNonnegativeInteger(configuration?.quantity) ? configuration!.quantity! : null,
    accountLabel: configuration?.accountLabel ?? null,
    reserveCents: safeNonnegativeInteger(configuration?.reserveCents) ? configuration!.reserveCents! : null,
    maximumLossCents: safeNonnegativeInteger(configuration?.maximumLossCents) ? configuration!.maximumLossCents! : null,
    timeStop: configuration?.timeStop ?? null,
    shortability: side === "LONG" ? "NOT_APPLICABLE" : shortability,
  };
}

function ticketRiskConfigurationValid(configuration: MooTicketConfiguration | undefined) {
  const basic = safeNonnegativeInteger(configuration?.stopOffsetCents) && configuration!.stopOffsetCents! > 0 &&
    safeNonnegativeInteger(configuration?.quantity) && configuration!.quantity! > 0 &&
    nonemptyString(configuration?.accountLabel) &&
    safeNonnegativeInteger(configuration?.reserveCents) &&
    safeNonnegativeInteger(configuration?.maximumLossCents) && configuration!.maximumLossCents! > 0 &&
    nonemptyString(configuration?.timeStop);
  if (!basic) return false;
  const baseMaximumLoss = configuration!.stopOffsetCents! * configuration!.quantity!;
  return Number.isSafeInteger(baseMaximumLoss) && configuration!.maximumLossCents! >= baseMaximumLoss;
}

function portfolioRiskConfigurationValid(
  longConfiguration: MooTicketConfiguration | undefined,
  shortConfiguration: MooTicketConfiguration | undefined,
  config: MooStrategyConfiguration,
) {
  if (!ticketRiskConfigurationValid(longConfiguration) || !ticketRiskConfigurationValid(shortConfiguration)) return false;
  if (longConfiguration!.accountLabel!.trim().toLowerCase() === shortConfiguration!.accountLabel!.trim().toLowerCase()) return false;
  if (!safeNonnegativeInteger(config.portfolioMaximumLossCents) || config.portfolioMaximumLossCents! <= 0) return false;
  const combinedMaximumLoss = longConfiguration!.maximumLossCents! + shortConfiguration!.maximumLossCents!;
  return Number.isSafeInteger(combinedMaximumLoss) && combinedMaximumLoss <= config.portfolioMaximumLossCents!;
}

export function buildMooDecisionSnapshot(input: BuildMooDecisionInput): MooDecisionSnapshot {
  const schedule = nasdaqSessionSchedule(input.targetSession);
  const lifecycle = mooLifecycleAt(input.targetSession, input.nowMs);
  // The cutoff instant itself is inclusive. Any later evaluation must use an
  // explicitly persisted frozen prediction and its matching source snapshot;
  // a merely backdated current prediction is not proof of point-in-time state.
  const afterFreeze = input.nowMs > schedule.decisionFreezeAt;
  const warnings: string[] = [];
  const frozenContext = input.frozenContext ?? null;
  const frozenIdentityValid = frozenContext != null &&
    frozenContext.schemaVersion === "moo-phase1-v1" &&
    frozenContext.targetSession === input.targetSession &&
    nonemptyString(frozenContext.snapshotId) &&
    safeNonnegativeInteger(frozenContext.frozenAt) &&
    frozenContext.frozenAt >= schedule.premarketOpenAt &&
    frozenContext.frozenAt <= schedule.decisionFreezeAt &&
    predictionRuntimeIdentityValid(frozenContext.prediction, input.targetSession) &&
    frozenContext.prediction.generatedAt >= schedule.premarketOpenAt &&
    frozenContext.prediction.generatedAt <= frozenContext.frozenAt;
  const activeFrozenContext = afterFreeze && frozenIdentityValid ? frozenContext : null;
  if (afterFreeze && frozenContext && frozenContext.targetSession !== input.targetSession) {
    warnings.push(`Frozen context targets ${frozenContext.targetSession}; it cannot be replayed for ${input.targetSession}.`);
  } else if (afterFreeze && frozenContext && !frozenIdentityValid) {
    warnings.push("Frozen context schema or snapshot identity is invalid.");
  }
  const unavailableDecisionInputs = {
    dataQualityScore: null,
    sources: [] as MooSourceHealth[],
    requiredSourceIds: ["US"] as MooSourceHealth["id"][],
    previousHighCents: null,
    previousLowCents: null,
    premarketHighCents: null,
    premarketLowCents: null,
    shortability: "UNCONFIRMED" as const,
    longTicket: undefined,
    shortTicket: undefined,
  };
  const frozenAt = safeNonnegativeInteger(activeFrozenContext?.frozenAt)
    ? activeFrozenContext.frozenAt
    : null;
  const config = afterFreeze
    ? (activeFrozenContext?.config ?? {})
    : (input.config ?? {});
  const decisionInputs = afterFreeze ? (activeFrozenContext ?? unavailableDecisionInputs) : input;
  let prediction = afterFreeze ? (activeFrozenContext?.prediction ?? null) : (input.prediction ?? null);
  if (afterFreeze && !prediction) warnings.push("No valid prediction was frozen by the actionable cutoff.");
  if (afterFreeze && !frozenContext && (input.frozenPrediction || input.frozenSources?.length || input.frozenAt != null)) {
    warnings.push("Legacy partial freeze fields were rejected; a complete frozen decision context is required.");
  }
  if (
    prediction &&
    afterFreeze &&
    (
      prediction.generatedAt > schedule.decisionFreezeAt ||
      frozenAt! > schedule.decisionFreezeAt ||
      prediction.generatedAt > frozenAt!
    )
  ) {
    warnings.push("The persisted prediction or freeze timestamp is outside the actionable cutoff and was rejected.");
    prediction = null;
  }
  if (prediction && !predictionRuntimeIdentityValid(prediction, input.targetSession)) {
    warnings.push("Prediction runtime identity is incomplete or targets a different session; it was rejected.");
    prediction = null;
  }
  const evaluationTime = afterFreeze && prediction
    ? frozenAt!
    : input.nowMs;
  const maximumClockSkewMs = safeNonnegativeInteger(config.maximumClockSkewMs) ? config.maximumClockSkewMs : 1_000;
  if (prediction && prediction.generatedAt > evaluationTime + maximumClockSkewMs) {
    warnings.push("Prediction timestamp is in the future and was rejected.");
    prediction = null;
  }
  const thirds = calculateMooThirds({
    previousHighCents: decisionInputs.previousHighCents,
    previousLowCents: decisionInputs.previousLowCents,
    premarketHighCents: decisionInputs.premarketHighCents,
    premarketLowCents: decisionInputs.premarketLowCents,
    thirdPercentBasisPoints: config.thirdPercentBasisPoints,
    addOneTick: config.addOneTick,
  });
  const sources = decisionInputs.sources ?? [];
  if (afterFreeze && prediction && !activeFrozenContext?.sources.length) {
    warnings.push("The frozen prediction has no persisted source-health snapshot.");
  }
  const requiredSourceIds = decisionInputs.requiredSourceIds ?? ["US"];
  const requiredSourcePolicyValid = requiredSourceIds.length > 0 && new Set(requiredSourceIds).size === requiredSourceIds.length;
  let blockReason: MooBlockReason = "NONE";
  if (!requiredSourcePolicyValid) {
    blockReason = "FEED_NOT_ENTITLED";
    warnings.push("Required-source policy must contain at least one unique source identifier.");
  } else if (lifecycle === "FUTURE_SESSION") {
    blockReason = "TARGET_SESSION_NOT_STARTED";
    warnings.push("The selected target session has not started; execution remains blocked until that session's premarket window.");
  } else if (lifecycle === "MARKET_CLOSED" || (input.currentSession != null && input.currentSession !== input.targetSession)) {
    blockReason = "MARKET_CLOSED";
  } else if (lifecycle === "PREPARING") {
    blockReason = "DATA_PENDING";
  } else if (!prediction || !safeNonnegativeInteger(prediction.predictedOfficialOpenCents)) {
    blockReason = "DATA_PENDING";
  } else {
    blockReason = sourceGate(sources, requiredSourceIds, evaluationTime, config, warnings) ?? "NONE";
  }
  if (blockReason === "NONE" && prediction && !prediction.trained) blockReason = "MODEL_NOT_TRAINED";
  const quality = safePercent(decisionInputs.dataQualityScore) ? decisionInputs.dataQualityScore : null;
  if (blockReason === "NONE" && quality == null) blockReason = "DATA_PENDING";
  if (blockReason === "NONE" && quality! < (config.minimumDataQualityScore ?? 80)) blockReason = "LOW_DATA_QUALITY";
  const confidence = prediction && safePercent(prediction.confidencePct) ? prediction.confidencePct : null;
  if (
    blockReason === "NONE" &&
    (prediction?.decision === "NO_TRADE" || confidence == null || confidence < (config.minimumConfidencePct ?? 60))
  ) blockReason = "LOW_CONFIDENCE";
  if (blockReason === "NONE" && (thirds.majorThirdCents == null || thirds.minorThirdCents == null)) blockReason = "DATA_PENDING";
  const shortability = decisionInputs.shortability ?? "UNCONFIRMED";
  if (blockReason === "NONE" && shortability !== "AVAILABLE") blockReason = "SHORTABILITY_UNCONFIRMED";

  const decision = blockReason === "NONE" && prediction ? prediction.decision : "NO_TRADE";
  const sourceBlocked = ["FEED_NOT_ENTITLED", "STALE_US_QUOTE", "DATA_PENDING", "MARKET_CLOSED"].includes(blockReason);
  const predictedOpenCents = !prediction || sourceBlocked ? null : prediction.predictedOfficialOpenCents;
  const predictedOpenState = predictedOpenCents != null
    ? "AVAILABLE"
    : blockReason === "DATA_PENDING" || blockReason === "STALE_US_QUOTE" || blockReason === "TARGET_SESSION_NOT_STARTED"
      ? "PENDING"
      : "UNAVAILABLE";
  const lifecycleActionable = lifecycle === "READY" || lifecycle === "FROZEN" || (lifecycle === "LATE_LOCKED" && input.lateOrderAcknowledged === true);
  const riskPolicyConfigured = portfolioRiskConfigurationValid(decisionInputs.longTicket, decisionInputs.shortTicket, config);
  const actionable = decision !== "NO_TRADE" && lifecycleActionable && riskPolicyConfigured;
  if (decision !== "NO_TRADE" && lifecycleActionable && !riskPolicyConfigured) {
    warnings.push("Both strict ticket risk configurations, distinct account labels, internally consistent loss limits, and a combined portfolio loss cap are required.");
  }
  if (lifecycle === "LATE_LOCKED" && !input.lateOrderAcknowledged) warnings.push("A new MOO is late and locked; explicit acknowledgement is required.");
  if (lifecycle === "ENTRY_CLOSED") warnings.push("Final MOO entry deadline has passed; monitoring only.");
  if (lifecycle === "CROSS_COMPLETE") warnings.push("Opening Cross window has passed; estimates are preserved for audit.");

  const actualOfficialOpenCents = safeNonnegativeInteger(input.actualOfficialOpenCents)
    ? input.actualOfficialOpenCents
    : null;
  const cushionCents = safeNonnegativeInteger(config.takeProfitCushionCents)
    ? config.takeProfitCushionCents
    : 10;
  const longTicket = ticket(
    "LONG", decision, predictedOpenCents, input.longFillCents,
    thirds.majorThirdCents, thirds.minorThirdCents, cushionCents,
    actionable, shortability, decisionInputs.longTicket,
  );
  const shortTicket = ticket(
    "SHORT", decision, predictedOpenCents, input.shortFillCents,
    thirds.majorThirdCents, thirds.minorThirdCents, cushionCents,
    actionable, shortability, decisionInputs.shortTicket,
  );

  return {
    schemaVersion: "moo-phase1-v1",
    snapshotId: activeFrozenContext?.snapshotId ?? input.snapshotId ?? `moo-${input.targetSession}-${prediction?.generatedAt ?? input.nowMs}`,
    targetSession: input.targetSession,
    generatedAt: input.nowMs,
    frozenAt: afterFreeze && prediction ? frozenAt : null,
    lifecycle,
    decision,
    blockReason,
    predictedOfficialOpenCents: predictedOpenCents,
    predictedOpenState,
    actualOfficialOpenCents,
    officialOpenSource: actualOfficialOpenCents == null ? null : (input.officialOpenSource ?? null),
    predictionErrorCents: predictedOpenCents == null || actualOfficialOpenCents == null
      ? null
      : actualOfficialOpenCents - predictedOpenCents,
    confidencePct: decision === "NO_TRADE" ? null : confidence,
    dataQualityScore: quality,
    modelVersion: prediction?.modelVersion ?? null,
    featureSchemaVersion: prediction?.featureSchemaVersion ?? null,
    actionCutoffAt: schedule.decisionFreezeAt,
    deadlines: mooDeadlines(input.targetSession, input.nowMs),
    ...thirds,
    thirdPercentBasisPoints: config.thirdPercentBasisPoints ?? 3300,
    tickSizeCents: 1,
    addOneTick: config.addOneTick !== false,
    takeProfitCushionCents: cushionCents,
    longTicket,
    shortTicket,
    sources,
    warnings,
  };
}
