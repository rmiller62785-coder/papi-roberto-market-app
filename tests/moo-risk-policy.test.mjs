import assert from "node:assert/strict";
import test from "node:test";

import {
  mooRiskPolicyUsableAt,
  resolveMooRiskPolicy,
  sealMooRiskPolicy,
  validateMooRiskPolicy,
} from "../app/moo-risk-policy.ts";

function side(alias) {
  return {
    orderType: "MOO",
    sizingMode: "FIXED_QUANTITY",
    reserveMode: "FIXED_CASH",
    lossModel: "STOP_PLUS_SLIPPAGE",
    accountAlias: alias,
    stopOffsetCents: 100,
    slippageAllowanceCents: 10,
    quantity: 5,
    reserveCents: 1_000,
    riskBudgetCents: 600,
    maximumLossCents: 550,
    timeStop: { hour: 10, minute: 0, timeZone: "America/New_York", action: "EXIT_POSITION" },
  };
}

function policyInput(overrides = {}) {
  return {
    schemaVersion: "moo-risk-policy-v1",
    policyVersion: "risk-v1",
    status: "ACTIVE",
    environment: "paper",
    executionScope: "PAPER",
    effectiveFrom: 200,
    effectiveUntil: null,
    long: side("Paper long"),
    short: side("Paper short"),
    portfolioMaximumLossCents: 1_200,
    minimumConfidencePct: 60,
    minimumDataQualityScore: 80,
    approvedAt: 100,
    approvedBy: "risk-reviewer",
    retiredAt: null,
    ...overrides,
  };
}

function policy(overrides = {}) {
  return sealMooRiskPolicy(policyInput(overrides));
}

test("an active paper policy resolves only in its paper environment and purpose", () => {
  const value = policy();
  assert.deepEqual(validateMooRiskPolicy(value), { valid: true, errors: [] });
  assert.equal(mooRiskPolicyUsableAt(value, 250), true);
  const resolved = resolveMooRiskPolicy(value, 250, { environment: "paper", purpose: "PAPER" });
  assert.equal(resolved.config.portfolioMaximumLossCents, 1_200);
  assert.equal(resolved.longTicket.timeStop, "10:00 ET");
  assert.equal(resolveMooRiskPolicy(value, 250, { environment: "paper", purpose: "STRICT" }), null);
  assert.equal(resolveMooRiskPolicy(value, 250, { environment: "live", purpose: "STRICT" }), null);
});

test("a live strict policy cannot resolve in paper or live-trading scope", () => {
  const value = policy({ environment: "live", executionScope: "STRICT" });
  assert.ok(resolveMooRiskPolicy(value, 250, { environment: "live", purpose: "STRICT" }));
  assert.equal(resolveMooRiskPolicy(value, 250, { environment: "paper", purpose: "STRICT" }), null);
  assert.equal(resolveMooRiskPolicy(value, 250, { environment: "live", purpose: "LIVE" }), null);
});

test("same accounts, inconsistent caps, and invalid enums or parsed time stops fail closed", () => {
  const input = policyInput({
    short: side("paper LONG"),
    portfolioMaximumLossCents: 1_000,
    long: { ...side("Paper long"), orderType: "LIMIT", timeStop: { ...side("x").timeStop, hour: 8 } },
  });
  input.contentHash = "sha256:" + "0".repeat(64);
  const result = validateMooRiskPolicy(input);
  assert.ok(result.errors.includes("ACCOUNT_ALIASES_NOT_DISTINCT"));
  assert.ok(result.errors.includes("PORTFOLIO_CAP_EXCEEDED"));
  assert.ok(result.errors.includes("LONG_ORDER_TYPE_INVALID"));
  assert.ok(result.errors.includes("LONG_TIME_STOP_INVALID"));
});

test("draft, future, expired, and retired policies are never usable", () => {
  assert.equal(mooRiskPolicyUsableAt(policy({ status: "DRAFT", approvedAt: null, approvedBy: null }), 250), false);
  assert.equal(mooRiskPolicyUsableAt(policy(), 199), false);
  assert.equal(mooRiskPolicyUsableAt(policy({ effectiveUntil: 240 }), 250), false);
  assert.equal(mooRiskPolicyUsableAt(policy({ status: "RETIRED", retiredAt: 240 }), 250), false);
});

test("risk budget must cover declared maximum loss including slippage", () => {
  const input = policyInput({ long: { ...side("Paper long"), riskBudgetCents: 549 } });
  input.contentHash = "sha256:" + "0".repeat(64);
  const result = validateMooRiskPolicy(input);
  assert.ok(result.errors.includes("LONG_RISK_BUDGET_EXCEEDED"));
});

test("canonical risk-policy hashes detect nested mutation", () => {
  const mutable = structuredClone(policy());
  mutable.long.quantity = 4;
  assert.ok(validateMooRiskPolicy(mutable).errors.includes("CONTENT_HASH_MISMATCH"));
});
