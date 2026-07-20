import { deepFreezeMoo, mooCanonicalDigest, type MooDeepReadonly } from "./moo-contract.ts";
import type { MooStrategyConfiguration, MooTicketConfiguration } from "./moo-strategy.ts";

export const MOO_RISK_POLICY_SCHEMA = "moo-risk-policy-v1" as const;

export type MooRiskPolicyStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type MooRiskPurpose = "PAPER" | "STRICT" | "LIVE";

export type MooTimeStop = {
  hour: number;
  minute: number;
  timeZone: "America/New_York";
  action: "CANCEL_OPEN_ORDERS" | "EXIT_POSITION";
};

export type MooSideRiskPolicy = {
  orderType: "MOO";
  sizingMode: "FIXED_QUANTITY";
  reserveMode: "FIXED_CASH";
  lossModel: "STOP_PLUS_SLIPPAGE";
  accountAlias: string;
  stopOffsetCents: number;
  slippageAllowanceCents: number;
  quantity: number;
  reserveCents: number;
  riskBudgetCents: number;
  maximumLossCents: number;
  timeStop: MooTimeStop;
};

export type MooStrictRiskPolicy = {
  schemaVersion: typeof MOO_RISK_POLICY_SCHEMA;
  policyVersion: string;
  status: MooRiskPolicyStatus;
  environment: "paper" | "live";
  executionScope: MooRiskPurpose;
  effectiveFrom: number;
  effectiveUntil: number | null;
  long: MooSideRiskPolicy;
  short: MooSideRiskPolicy;
  portfolioMaximumLossCents: number;
  minimumConfidencePct: number;
  minimumDataQualityScore: number;
  contentHash: string;
  approvedAt: number | null;
  approvedBy: string | null;
  retiredAt: number | null;
};

export type MooRiskPolicyValidation = { valid: boolean; errors: string[] };
export type MooRiskResolutionContext = { environment: "paper" | "live"; purpose: MooRiskPurpose };

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimeStop(value: MooTimeStop | null | undefined) {
  if (!value || typeof value !== "object") return false;
  if (!Number.isSafeInteger(value.hour) || !Number.isSafeInteger(value.minute)) return false;
  if (value.minute < 0 || value.minute > 59 || value.hour < 0 || value.hour > 23) return false;
  const minuteOfDay = value.hour * 60 + value.minute;
  return minuteOfDay >= 570 && minuteOfDay < 960 &&
    value.timeZone === "America/New_York" &&
    ["CANCEL_OPEN_ORDERS", "EXIT_POSITION"].includes(value.action);
}

function sideErrors(side: "LONG" | "SHORT", policy: MooSideRiskPolicy, errors: string[]) {
  if (!policy || typeof policy !== "object") return errors.push(`${side}_POLICY_MISSING`);
  if (policy.orderType !== "MOO") errors.push(`${side}_ORDER_TYPE_INVALID`);
  if (policy.sizingMode !== "FIXED_QUANTITY") errors.push(`${side}_SIZING_MODE_INVALID`);
  if (policy.reserveMode !== "FIXED_CASH") errors.push(`${side}_RESERVE_MODE_INVALID`);
  if (policy.lossModel !== "STOP_PLUS_SLIPPAGE") errors.push(`${side}_LOSS_MODEL_INVALID`);
  if (!nonempty(policy.accountAlias)) errors.push(`${side}_ACCOUNT_ALIAS_MISSING`);
  if (!positiveInteger(policy.stopOffsetCents)) errors.push(`${side}_STOP_INVALID`);
  if (!nonnegativeInteger(policy.slippageAllowanceCents)) errors.push(`${side}_SLIPPAGE_INVALID`);
  if (!positiveInteger(policy.quantity)) errors.push(`${side}_QUANTITY_INVALID`);
  if (!nonnegativeInteger(policy.reserveCents)) errors.push(`${side}_RESERVE_INVALID`);
  if (!positiveInteger(policy.riskBudgetCents)) errors.push(`${side}_RISK_BUDGET_INVALID`);
  if (!positiveInteger(policy.maximumLossCents)) errors.push(`${side}_MAXIMUM_LOSS_INVALID`);
  if (!validTimeStop(policy.timeStop)) errors.push(`${side}_TIME_STOP_INVALID`);
  if (positiveInteger(policy.stopOffsetCents) && nonnegativeInteger(policy.slippageAllowanceCents) && positiveInteger(policy.quantity)) {
    const modeledLoss = (policy.stopOffsetCents + policy.slippageAllowanceCents) * policy.quantity;
    if (!Number.isSafeInteger(modeledLoss)) errors.push(`${side}_LOSS_PRECISION_INVALID`);
    else {
      if (policy.maximumLossCents < modeledLoss) errors.push(`${side}_MAXIMUM_LOSS_TOO_LOW`);
      if (policy.riskBudgetCents < policy.maximumLossCents || policy.riskBudgetCents < modeledLoss) {
        errors.push(`${side}_RISK_BUDGET_EXCEEDED`);
      }
    }
  }
}

export function computeMooRiskPolicyDigest(policy: Omit<MooStrictRiskPolicy, "contentHash"> | MooStrictRiskPolicy) {
  return mooCanonicalDigest(policy as unknown as Record<string, unknown>);
}

export function validateMooRiskPolicy(policy: MooStrictRiskPolicy): MooRiskPolicyValidation {
  const errors: string[] = [];
  if (!policy || typeof policy !== "object") return { valid: false, errors: ["RISK_POLICY_INVALID"] };
  if (policy.schemaVersion !== MOO_RISK_POLICY_SCHEMA) errors.push("SCHEMA_VERSION_INVALID");
  if (!["DRAFT", "ACTIVE", "RETIRED"].includes(policy.status)) errors.push("POLICY_STATUS_INVALID");
  if (!nonempty(policy.policyVersion)) errors.push("POLICY_VERSION_MISSING");
  if (!["paper", "live"].includes(policy.environment)) errors.push("ENVIRONMENT_INVALID");
  if (!["PAPER", "STRICT", "LIVE"].includes(policy.executionScope)) errors.push("EXECUTION_SCOPE_INVALID");
  if (policy.environment === "paper" && policy.executionScope !== "PAPER") errors.push("PAPER_SCOPE_INVALID");
  if (policy.environment === "live" && policy.executionScope === "PAPER") errors.push("LIVE_SCOPE_INVALID");
  if (!timestamp(policy.effectiveFrom)) errors.push("EFFECTIVE_FROM_INVALID");
  if (policy.effectiveUntil != null && (!timestamp(policy.effectiveUntil) || policy.effectiveUntil <= policy.effectiveFrom)) {
    errors.push("EFFECTIVE_UNTIL_INVALID");
  }
  sideErrors("LONG", policy.long, errors);
  sideErrors("SHORT", policy.short, errors);
  if (nonempty(policy.long?.accountAlias) && nonempty(policy.short?.accountAlias) &&
    policy.long.accountAlias.trim().toLowerCase() === policy.short.accountAlias.trim().toLowerCase()) {
    errors.push("ACCOUNT_ALIASES_NOT_DISTINCT");
  }
  if (!positiveInteger(policy.portfolioMaximumLossCents)) errors.push("PORTFOLIO_MAXIMUM_LOSS_INVALID");
  const combinedMaximumLoss = (policy.long?.maximumLossCents ?? NaN) + (policy.short?.maximumLossCents ?? NaN);
  if (!Number.isSafeInteger(combinedMaximumLoss)) errors.push("PORTFOLIO_LOSS_PRECISION_INVALID");
  else if (combinedMaximumLoss > policy.portfolioMaximumLossCents) errors.push("PORTFOLIO_CAP_EXCEEDED");
  if (!percent(policy.minimumConfidencePct)) errors.push("MINIMUM_CONFIDENCE_INVALID");
  if (!percent(policy.minimumDataQualityScore)) errors.push("MINIMUM_DATA_QUALITY_INVALID");
  if (policy.status === "ACTIVE") {
    if (!timestamp(policy.approvedAt) || policy.approvedAt > policy.effectiveFrom) errors.push("APPROVAL_TIME_INVALID");
    if (!nonempty(policy.approvedBy)) errors.push("APPROVER_MISSING");
    if (policy.retiredAt != null) errors.push("ACTIVE_POLICY_HAS_RETIREMENT_TIME");
  }
  if (policy.status === "DRAFT" && policy.approvedAt != null) errors.push("DRAFT_POLICY_HAS_APPROVAL_TIME");
  if (policy.status === "RETIRED") {
    if (!timestamp(policy.retiredAt)) errors.push("RETIRED_AT_MISSING");
    if (policy.retiredAt != null && policy.retiredAt < policy.effectiveFrom) errors.push("RETIREMENT_PRECEDES_EFFECTIVE_TIME");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(policy.contentHash)) errors.push("CONTENT_HASH_INVALID");
  else {
    try {
      if (computeMooRiskPolicyDigest(policy) !== policy.contentHash) errors.push("CONTENT_HASH_MISMATCH");
    } catch { errors.push("CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

export function mooRiskPolicyUsableAt(policy: MooStrictRiskPolicy, at: number) {
  return timestamp(at) && validateMooRiskPolicy(policy).valid && policy.status === "ACTIVE" &&
    policy.effectiveFrom <= at && (policy.effectiveUntil == null || at < policy.effectiveUntil);
}

function contextMatches(policy: MooStrictRiskPolicy, context: MooRiskResolutionContext) {
  if (policy.environment !== context.environment || policy.executionScope !== context.purpose) return false;
  if ((context.purpose === "STRICT" || context.purpose === "LIVE") && context.environment !== "live") return false;
  return true;
}

export function resolveMooRiskPolicy(
  policy: MooStrictRiskPolicy,
  at: number,
  context: MooRiskResolutionContext,
): { config: MooStrategyConfiguration; longTicket: MooTicketConfiguration; shortTicket: MooTicketConfiguration } | null {
  if (!mooRiskPolicyUsableAt(policy, at) || !contextMatches(policy, context)) return null;
  const ticket = (side: MooSideRiskPolicy): MooTicketConfiguration => ({
    stopOffsetCents: side.stopOffsetCents,
    quantity: side.quantity,
    accountLabel: side.accountAlias,
    reserveCents: side.reserveCents,
    maximumLossCents: side.maximumLossCents,
    timeStop: `${String(side.timeStop.hour).padStart(2, "0")}:${String(side.timeStop.minute).padStart(2, "0")} ET`,
  });
  return {
    config: {
      portfolioMaximumLossCents: policy.portfolioMaximumLossCents,
      minimumConfidencePct: policy.minimumConfidencePct,
      minimumDataQualityScore: policy.minimumDataQualityScore,
    },
    longTicket: ticket(policy.long),
    shortTicket: ticket(policy.short),
  };
}

export function sealMooRiskPolicy(
  policy: Omit<MooStrictRiskPolicy, "contentHash">,
): MooDeepReadonly<MooStrictRiskPolicy> {
  const value: MooStrictRiskPolicy = { ...policy, contentHash: computeMooRiskPolicyDigest(policy) };
  const validation = validateMooRiskPolicy(value);
  if (!validation.valid) throw new TypeError(`Invalid MOO risk policy: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}
