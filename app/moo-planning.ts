import {
  calculateMooThirds,
  targetMoveCents,
  type MooThirdCalculation,
} from "./moo-strategy.ts";

export type MooPaperPreference = "LONG_FAVORED" | "SHORT_FAVORED" | "UNASSIGNED";
export type MooPlanningSide = "LONG" | "SHORT";
export type MooQuantityMode = "AUTO_RISK" | "MANUAL";
export type MooPlanningFieldState =
  | "READY"
  | "PENDING_MARKET_DATA"
  | "USER_INPUT_REQUIRED"
  | "PREFERENCE_REQUIRED"
  | "INVALID_INPUT";

export type MooPlanningProvenance =
  | "SELECTED_SESSION_RESEARCH"
  | "PREVIOUS_SESSION_MARKET_DATA"
  | "TARGET_PREMARKET_DATA"
  | "USER_RISK_INPUT"
  | "PAPER_PREFERENCE"
  | "LITERAL_0_33_THIRD_RULE"
  | "ROUND_HALF_UP_PLUS_TICK"
  | "TARGET_CUSHION_RULE";

export type MooPlanningField<T> = {
  value: T | null;
  state: MooPlanningFieldState;
  reason: string;
  provenance: MooPlanningProvenance[];
};

export type MooSideRiskInput = {
  stopOffsetCents: number | null;
  slippageAllowanceCents: number | null;
  riskBudgetCents: number | null;
  quantityMode: MooQuantityMode;
  manualQuantity: number | null;
  maxShares: number | null;
  reserveCents: number | null;
  accountLabel?: string | null;
  timeStop?: string | null;
};

export type BuildMooPlanningInput = {
  targetSession: string;
  researchAnchorCents: number | null;
  previousHighCents: number | null;
  previousLowCents: number | null;
  premarketHighCents: number | null;
  premarketLowCents: number | null;
  preference: MooPaperPreference;
  takeProfitCushionCents: number;
  longRisk: MooSideRiskInput;
  shortRisk: MooSideRiskInput;
};

export type MooPlanningTicket = {
  side: MooPlanningSide;
  paperOnly: true;
  actionable: false;
  thirdRole: "MAJOR" | "MINOR" | "UNASSIGNED";
  majorCandidateCents: MooPlanningField<number>;
  minorCandidateCents: MooPlanningField<number>;
  assignedDistanceCents: MooPlanningField<number>;
  estimatedFillCents: MooPlanningField<number>;
  targetOffsetCents: MooPlanningField<number>;
  provisionalTargetCents: MooPlanningField<number>;
  stopOffsetCents: MooPlanningField<number>;
  slippageAllowanceCents: MooPlanningField<number>;
  riskBudgetCents: MooPlanningField<number>;
  quantity: MooPlanningField<number>;
  maximumLossCents: MooPlanningField<number>;
  reserveCents: MooPlanningField<number>;
  accountLabel: MooPlanningField<string>;
  timeStop: MooPlanningField<string>;
};

export type MooPlanningSnapshot = {
  schemaVersion: "moo-planning-v1";
  targetSession: string;
  paperOnly: true;
  actionable: false;
  preference: MooPaperPreference;
  researchAnchorCents: MooPlanningField<number>;
  previousRangeCents: MooPlanningField<number>;
  premarketRangeCents: MooPlanningField<number>;
  previousEffectiveThirdCents: MooPlanningField<number>;
  premarketEffectiveThirdCents: MooPlanningField<number>;
  majorThirdCents: MooPlanningField<number>;
  minorThirdCents: MooPlanningField<number>;
  takeProfitCushionCents: MooPlanningField<number>;
  longTicket: MooPlanningTicket;
  shortTicket: MooPlanningTicket;
};

const THIRD_PROVENANCE: MooPlanningProvenance[] = [
  "LITERAL_0_33_THIRD_RULE",
  "ROUND_HALF_UP_PLUS_TICK",
];

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return nonnegativeInteger(value) && value > 0;
}

function ready<T>(value: T, reason: string, provenance: MooPlanningProvenance[]): MooPlanningField<T> {
  return { value, state: "READY", reason, provenance };
}

function missing<T>(
  state: Exclude<MooPlanningFieldState, "READY">,
  reason: string,
  provenance: MooPlanningProvenance[],
): MooPlanningField<T> {
  return { value: null, state, reason, provenance };
}

function marketValue(
  value: number | null,
  label: string,
  provenance: MooPlanningProvenance[],
): MooPlanningField<number> {
  return nonnegativeInteger(value)
    ? ready(value, `${label} is available for the selected-session paper preview.`, provenance)
    : missing("PENDING_MARKET_DATA", `${label} is pending valid point-in-time market data.`, provenance);
}

function userPositive(value: number | null, label: string): MooPlanningField<number> {
  if (value == null) {
    return missing("USER_INPUT_REQUIRED", `${label} must be configured by the user.`, ["USER_RISK_INPUT"]);
  }
  return positiveInteger(value)
    ? ready(value, `${label} is a user-supplied paper-risk input.`, ["USER_RISK_INPUT"])
    : missing("INVALID_INPUT", `${label} must be a positive whole number.`, ["USER_RISK_INPUT"]);
}

function userNonnegative(value: number | null, label: string): MooPlanningField<number> {
  if (value == null) {
    return missing("USER_INPUT_REQUIRED", `${label} must be configured by the user.`, ["USER_RISK_INPUT"]);
  }
  return nonnegativeInteger(value)
    ? ready(value, `${label} is a user-supplied paper-risk input.`, ["USER_RISK_INPUT"])
    : missing("INVALID_INPUT", `${label} must be a nonnegative whole number.`, ["USER_RISK_INPUT"]);
}

function userText(value: string | null | undefined, label: string): MooPlanningField<string> {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized
    ? ready(normalized, `${label} is a user-supplied paper-risk input.`, ["USER_RISK_INPUT"])
    : missing("USER_INPUT_REQUIRED", `${label} must be configured by the user.`, ["USER_RISK_INPUT"]);
}

function thirdField(
  value: number | null,
  label: string,
  dependency: "previous" | "premarket" | "both",
): MooPlanningField<number> {
  const provenance: MooPlanningProvenance[] = [
    ...(dependency === "previous" || dependency === "both" ? ["PREVIOUS_SESSION_MARKET_DATA" as const] : []),
    ...(dependency === "premarket" || dependency === "both" ? ["TARGET_PREMARKET_DATA" as const] : []),
    ...THIRD_PROVENANCE,
  ];
  return value == null
    ? missing(
        "PENDING_MARKET_DATA",
        `${label} requires valid ${dependency === "both" ? "previous-session and target-premarket" : dependency === "previous" ? "previous-session" : "target-premarket"} high/low inputs.`,
        provenance,
      )
    : ready(value, `${label} uses literal 0.33, ROUND_HALF_UP, and one added tick.`, provenance);
}

function assignedRole(side: MooPlanningSide, preference: MooPaperPreference) {
  if (preference === "UNASSIGNED") return "UNASSIGNED" as const;
  if (preference === "LONG_FAVORED") return side === "LONG" ? "MAJOR" as const : "MINOR" as const;
  return side === "SHORT" ? "MAJOR" as const : "MINOR" as const;
}

function assignedDistance(
  role: "MAJOR" | "MINOR" | "UNASSIGNED",
  thirds: MooThirdCalculation,
): MooPlanningField<number> {
  if (role === "UNASSIGNED") {
    return missing(
      "PREFERENCE_REQUIRED",
      "Select a paper preference to assign the major and minor thirds; both candidates remain visible.",
      ["PAPER_PREFERENCE", ...THIRD_PROVENANCE],
    );
  }
  const value = role === "MAJOR" ? thirds.majorThirdCents : thirds.minorThirdCents;
  return value == null
    ? missing(
        "PENDING_MARKET_DATA",
        `${role === "MAJOR" ? "Major" : "Minor"} assignment requires both completed third calculations.`,
        ["PAPER_PREFERENCE", "PREVIOUS_SESSION_MARKET_DATA", "TARGET_PREMARKET_DATA", ...THIRD_PROVENANCE],
      )
    : ready(
        value,
        `${role === "MAJOR" ? "Major" : "Minor"} third assigned by the selected paper preference.`,
        ["PAPER_PREFERENCE", "PREVIOUS_SESSION_MARKET_DATA", "TARGET_PREMARKET_DATA", ...THIRD_PROVENANCE],
      );
}

function quantityField(risk: MooSideRiskInput): MooPlanningField<number> {
  const stop = userPositive(risk.stopOffsetCents, "Stop offset");
  const slippage = userNonnegative(risk.slippageAllowanceCents, "Slippage allowance");
  const budget = userPositive(risk.riskBudgetCents, "Risk budget");
  const maxShares = userPositive(risk.maxShares, "Maximum shares");
  const perShareRisk = stop.state === "READY" && slippage.state === "READY"
    ? stop.value! + slippage.value!
    : null;
  if (perShareRisk != null && !Number.isSafeInteger(perShareRisk)) {
    return missing("INVALID_INPUT", "Stop plus slippage exceeds safe calculation precision.", ["USER_RISK_INPUT"]);
  }

  if (risk.quantityMode === "MANUAL") {
    const manual = userPositive(risk.manualQuantity, "Manual quantity");
    const firstInvalid = [stop, slippage, budget, manual, maxShares].find((field) => field.state !== "READY");
    if (firstInvalid) return firstInvalid;
    if (manual.value! > maxShares.value!) {
      return missing(
        "INVALID_INPUT",
        "Manual quantity cannot exceed the configured maximum shares.",
        ["USER_RISK_INPUT"],
      );
    }
    const modeledLoss = perShareRisk! * manual.value!;
    if (!Number.isSafeInteger(modeledLoss)) {
      return missing("INVALID_INPUT", "Manual quantity produces a loss value beyond safe calculation precision.", ["USER_RISK_INPUT"]);
    }
    if (modeledLoss > budget.value!) {
      return missing(
        "INVALID_INPUT",
        "Manual quantity exceeds the configured risk budget at the selected stop plus slippage allowance.",
        ["USER_RISK_INPUT"],
      );
    }
    return ready(manual.value!, "Manual paper quantity is within the configured maximum shares.", ["USER_RISK_INPUT"]);
  }

  const firstInvalid = [stop, slippage, budget, maxShares].find((field) => field.state !== "READY");
  if (firstInvalid) return firstInvalid;
  const quantity = Math.min(maxShares.value!, Math.floor(budget.value! / perShareRisk!));
  if (quantity < 1) {
    return missing(
      "INVALID_INPUT",
      "Risk budget is too small for one share at the configured stop plus slippage allowance.",
      ["USER_RISK_INPUT"],
    );
  }
  return ready(
    quantity,
    "Auto paper quantity is floor(risk budget / (stop + slippage)), capped by maximum shares; buying power is not assumed.",
    ["USER_RISK_INPUT"],
  );
}

function buildTicket(
  side: MooPlanningSide,
  input: BuildMooPlanningInput,
  thirds: MooThirdCalculation,
  anchor: MooPlanningField<number>,
  cushion: MooPlanningField<number>,
  risk: MooSideRiskInput,
): MooPlanningTicket {
  const role = assignedRole(side, input.preference);
  const distance = assignedDistance(role, thirds);
  const stop = userPositive(risk.stopOffsetCents, "Stop offset");
  const slippage = userNonnegative(risk.slippageAllowanceCents, "Slippage allowance");
  const riskBudget = userPositive(risk.riskBudgetCents, "Risk budget");
  const quantity = quantityField(risk);
  const reserve = userNonnegative(risk.reserveCents, "Reserve");
  const targetOffset = distance.state !== "READY"
    ? missing<number>(distance.state, distance.reason, [...distance.provenance, "TARGET_CUSHION_RULE"])
    : cushion.state !== "READY"
      ? missing<number>(cushion.state, cushion.reason, [...distance.provenance, "TARGET_CUSHION_RULE"])
      : ready(
          targetMoveCents(distance.value!, cushion.value!),
          "Target offset is the assigned third less the configured inward cushion, with a one-tick minimum.",
          [...distance.provenance, "TARGET_CUSHION_RULE"],
        );
  const provisionalTarget = anchor.state !== "READY"
    ? missing<number>(anchor.state, anchor.reason, [...anchor.provenance, "TARGET_CUSHION_RULE"])
    : targetOffset.state !== "READY"
      ? missing<number>(targetOffset.state, targetOffset.reason, [...targetOffset.provenance])
      : ready(
          side === "LONG"
            ? anchor.value! + targetOffset.value!
            : Math.max(0, anchor.value! - targetOffset.value!),
          "Provisional paper target is anchored to the selected-session research estimate and must be rebased from an actual broker fill.",
          ["SELECTED_SESSION_RESEARCH", ...targetOffset.provenance],
        );

  let maximumLoss: MooPlanningField<number>;
  if (stop.state !== "READY") maximumLoss = missing(stop.state, stop.reason, stop.provenance);
  else if (slippage.state !== "READY") maximumLoss = missing(slippage.state, slippage.reason, slippage.provenance);
  else if (quantity.state !== "READY") maximumLoss = missing(quantity.state, quantity.reason, quantity.provenance);
  else {
    const maximumLossValue = (stop.value! + slippage.value!) * quantity.value!;
    maximumLoss = Number.isSafeInteger(maximumLossValue)
      ? ready(
          maximumLossValue,
          "Maximum modeled paper loss is (stop + slippage allowance) multiplied by quantity; fees, gaps, halts, and failed stops can produce larger losses.",
          ["USER_RISK_INPUT"],
        )
      : missing("INVALID_INPUT", "Maximum loss exceeds safe calculation precision.", ["USER_RISK_INPUT"]);
  }

  return {
    side,
    paperOnly: true,
    actionable: false,
    thirdRole: role,
    majorCandidateCents: thirdField(thirds.majorThirdCents, "Major third candidate", "both"),
    minorCandidateCents: thirdField(thirds.minorThirdCents, "Minor third candidate", "both"),
    assignedDistanceCents: distance,
    estimatedFillCents: anchor,
    targetOffsetCents: targetOffset,
    provisionalTargetCents: provisionalTarget,
    stopOffsetCents: stop,
    slippageAllowanceCents: slippage,
    riskBudgetCents: riskBudget,
    quantity,
    maximumLossCents: maximumLoss,
    reserveCents: reserve,
    accountLabel: userText(risk.accountLabel, "Account label"),
    timeStop: userText(risk.timeStop, "Time stop"),
  };
}

export function buildMooPlanningSnapshot(input: BuildMooPlanningInput): MooPlanningSnapshot {
  const anchor = marketValue(
    input.researchAnchorCents,
    "Selected-session research anchor",
    ["SELECTED_SESSION_RESEARCH"],
  );
  const cushion = nonnegativeInteger(input.takeProfitCushionCents)
    ? ready(
        input.takeProfitCushionCents,
        "Take-profit cushion is a configured paper-planning rule.",
        ["USER_RISK_INPUT", "TARGET_CUSHION_RULE"],
      )
    : missing<number>(
        "INVALID_INPUT",
        "Take-profit cushion must be a nonnegative whole number of cents.",
        ["USER_RISK_INPUT", "TARGET_CUSHION_RULE"],
      );
  const thirds = calculateMooThirds({
    previousHighCents: input.previousHighCents,
    previousLowCents: input.previousLowCents,
    premarketHighCents: input.premarketHighCents,
    premarketLowCents: input.premarketLowCents,
  });

  return {
    schemaVersion: "moo-planning-v1",
    targetSession: input.targetSession,
    paperOnly: true,
    actionable: false,
    preference: input.preference,
    researchAnchorCents: anchor,
    previousRangeCents: thirdField(thirds.previousRangeCents, "Previous-session range", "previous"),
    premarketRangeCents: thirdField(thirds.premarketRangeCents, "Target-premarket range", "premarket"),
    previousEffectiveThirdCents: thirdField(thirds.previousEffectiveThirdCents, "Previous-session effective third", "previous"),
    premarketEffectiveThirdCents: thirdField(thirds.premarketEffectiveThirdCents, "Target-premarket effective third", "premarket"),
    majorThirdCents: thirdField(thirds.majorThirdCents, "Major third candidate", "both"),
    minorThirdCents: thirdField(thirds.minorThirdCents, "Minor third candidate", "both"),
    takeProfitCushionCents: cushion,
    longTicket: buildTicket("LONG", input, thirds, anchor, cushion, input.longRisk),
    shortTicket: buildTicket("SHORT", input, thirds, anchor, cushion, input.shortRisk),
  };
}
