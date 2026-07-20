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
};

export type BuildMooDecisionInput = {
  nowMs: number;
  targetSession: string;
  currentSession?: string | null;
  snapshotId?: string;
  prediction?: MooPredictionInput | null;
  frozenPrediction?: MooPredictionInput | null;
  frozenAt?: number | null;
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
  const maxSkew = config.maximumClockSkewMs ?? 1_000;
  for (const id of requiredIds) {
    const source = sources.find((candidate) => candidate.id === id);
    if (!source) {
      warnings.push(`${id} source is unavailable.`);
      return "FEED_NOT_ENTITLED";
    }
    if (source.entitlement !== "REALTIME") {
      warnings.push(`${source.label} is ${source.entitlement.toLowerCase().replaceAll("_", " ")}; real-time entitlement is required.`);
      return "FEED_NOT_ENTITLED";
    }
    if (source.state === "UNAVAILABLE" || source.state === "CLOSED" || source.observedAt == null) {
      warnings.push(`${source.label} has no actionable observation.`);
      return "DATA_PENDING";
    }
    if (source.state !== "LIVE") {
      warnings.push(`${source.label} is ${source.state.toLowerCase()}.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    if (source.observedAt > evaluatedAt + maxSkew || (source.checkedAt != null && source.checkedAt > evaluatedAt + maxSkew)) {
      warnings.push(`${source.label} has a future or clock-skewed timestamp.`);
      return id === "US" ? "STALE_US_QUOTE" : "DATA_PENDING";
    }
    const derivedAge = Math.max(0, evaluatedAt - source.observedAt);
    const age = source.ageMs == null ? derivedAge : Math.max(source.ageMs, derivedAge);
    const maximumAge = config.maximumSourceAgeMs?.[id] ?? DEFAULT_SOURCE_AGE_MS[id];
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
  return {
    side,
    orderType: "MOO",
    favored,
    actionable,
    thirdRole: favored ? "MAJOR" : "MINOR",
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

export function buildMooDecisionSnapshot(input: BuildMooDecisionInput): MooDecisionSnapshot {
  const config = input.config ?? {};
  const schedule = nasdaqSessionSchedule(input.targetSession);
  const lifecycle = mooLifecycleAt(input.targetSession, input.nowMs);
  const afterFreeze = input.nowMs >= schedule.decisionFreezeAt;
  const warnings: string[] = [];
  const frozenCandidate = input.frozenPrediction ??
    (input.prediction && input.prediction.generatedAt <= schedule.decisionFreezeAt ? input.prediction : null);
  let prediction = afterFreeze ? frozenCandidate : (input.prediction ?? null);
  if (afterFreeze && !prediction) warnings.push("No valid prediction was frozen by the actionable cutoff.");
  if (prediction && afterFreeze && prediction.generatedAt > schedule.decisionFreezeAt) {
    warnings.push("Prediction was generated after the actionable cutoff and was rejected.");
    prediction = null;
  }
  const evaluationTime = afterFreeze && prediction
    ? Math.min(input.frozenAt ?? prediction.generatedAt, schedule.decisionFreezeAt)
    : input.nowMs;
  if (prediction && prediction.generatedAt > evaluationTime + (config.maximumClockSkewMs ?? 1_000)) {
    warnings.push("Prediction timestamp is in the future and was rejected.");
    prediction = null;
  }

  const thirds = calculateMooThirds({
    previousHighCents: input.previousHighCents,
    previousLowCents: input.previousLowCents,
    premarketHighCents: input.premarketHighCents,
    premarketLowCents: input.premarketLowCents,
    thirdPercentBasisPoints: config.thirdPercentBasisPoints,
    addOneTick: config.addOneTick,
  });
  const sources = input.sources ?? [];
  const requiredSourceIds = input.requiredSourceIds ?? ["US"];
  let blockReason: MooBlockReason = "NONE";
  if (lifecycle === "MARKET_CLOSED" || (input.currentSession != null && input.currentSession !== input.targetSession)) {
    blockReason = "MARKET_CLOSED";
  } else if (lifecycle === "PREPARING") {
    blockReason = "DATA_PENDING";
  } else if (!prediction || !safeNonnegativeInteger(prediction.predictedOfficialOpenCents)) {
    blockReason = "DATA_PENDING";
  } else {
    blockReason = sourceGate(sources, requiredSourceIds, evaluationTime, config, warnings) ?? "NONE";
  }
  if (blockReason === "NONE" && prediction && !prediction.trained) blockReason = "MODEL_NOT_TRAINED";
  const quality = safePercent(input.dataQualityScore) ? input.dataQualityScore : null;
  if (blockReason === "NONE" && quality == null) blockReason = "DATA_PENDING";
  if (blockReason === "NONE" && quality! < (config.minimumDataQualityScore ?? 80)) blockReason = "LOW_DATA_QUALITY";
  const confidence = prediction && safePercent(prediction.confidencePct) ? prediction.confidencePct : null;
  if (
    blockReason === "NONE" &&
    (prediction?.decision === "NO_TRADE" || confidence == null || confidence < (config.minimumConfidencePct ?? 60))
  ) blockReason = "LOW_CONFIDENCE";
  if (blockReason === "NONE" && (thirds.majorThirdCents == null || thirds.minorThirdCents == null)) blockReason = "DATA_PENDING";
  const shortability = input.shortability ?? "UNCONFIRMED";
  if (blockReason === "NONE" && shortability !== "AVAILABLE") blockReason = "SHORTABILITY_UNCONFIRMED";

  const decision = blockReason === "NONE" && prediction ? prediction.decision : "NO_TRADE";
  const sourceBlocked = ["FEED_NOT_ENTITLED", "STALE_US_QUOTE", "DATA_PENDING", "MARKET_CLOSED"].includes(blockReason);
  const predictedOpenCents = !prediction || sourceBlocked ? null : prediction.predictedOfficialOpenCents;
  const predictedOpenState = predictedOpenCents != null
    ? "AVAILABLE"
    : blockReason === "DATA_PENDING" || blockReason === "STALE_US_QUOTE"
      ? "PENDING"
      : "UNAVAILABLE";
  const lifecycleActionable = lifecycle === "READY" || lifecycle === "FROZEN" || (lifecycle === "LATE_LOCKED" && input.lateOrderAcknowledged === true);
  const actionable = decision !== "NO_TRADE" && lifecycleActionable;
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
    actionable, shortability, input.longTicket,
  );
  const shortTicket = ticket(
    "SHORT", decision, predictedOpenCents, input.shortFillCents,
    thirds.majorThirdCents, thirds.minorThirdCents, cushionCents,
    actionable, shortability, input.shortTicket,
  );

  return {
    schemaVersion: "moo-phase1-v1",
    snapshotId: input.snapshotId ?? `moo-${input.targetSession}-${prediction?.generatedAt ?? input.nowMs}`,
    targetSession: input.targetSession,
    generatedAt: input.nowMs,
    frozenAt: afterFreeze && prediction ? (input.frozenAt ?? prediction.generatedAt) : null,
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
