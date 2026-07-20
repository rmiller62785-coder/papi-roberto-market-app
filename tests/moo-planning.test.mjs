import assert from "node:assert/strict";
import test from "node:test";

import { buildMooPlanningSnapshot } from "../app/moo-planning.ts";

function risk(overrides = {}) {
  return {
    stopOffsetCents: 25,
    slippageAllowanceCents: 5,
    riskBudgetCents: 300,
    quantityMode: "AUTO_RISK",
    manualQuantity: null,
    maxShares: 8,
    reserveCents: 2_500_00,
    accountLabel: "Paper long",
    timeStop: "10:30 ET",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    targetSession: "2026-07-20",
    researchAnchorCents: 20_265,
    previousHighCents: 20_665,
    previousLowCents: 19_797,
    premarketHighCents: 20_273,
    premarketLowCents: 20_104,
    preference: "UNASSIGNED",
    takeProfitCushionCents: 10,
    longRisk: risk(),
    shortRisk: risk({ accountLabel: "Paper short" }),
    ...overrides,
  };
}

test("unassigned paper planning exposes both third candidates without inventing targets", () => {
  const snapshot = buildMooPlanningSnapshot(input());

  assert.equal(snapshot.paperOnly, true);
  assert.equal(snapshot.actionable, false);
  assert.equal(snapshot.majorThirdCents.value, 287);
  assert.equal(snapshot.minorThirdCents.value, 57);
  for (const ticket of [snapshot.longTicket, snapshot.shortTicket]) {
    assert.equal(ticket.thirdRole, "UNASSIGNED");
    assert.equal(ticket.majorCandidateCents.value, 287);
    assert.equal(ticket.minorCandidateCents.value, 57);
    assert.equal(ticket.assignedDistanceCents.value, null);
    assert.equal(ticket.assignedDistanceCents.state, "PREFERENCE_REQUIRED");
    assert.equal(ticket.estimatedFillCents.value, 20_265);
    assert.equal(ticket.provisionalTargetCents.value, null);
    assert.equal(ticket.provisionalTargetCents.state, "PREFERENCE_REQUIRED");
    assert.equal(ticket.actionable, false);
  }
});

test("long paper preference assigns major/minor and reproduces provisional targets", () => {
  const snapshot = buildMooPlanningSnapshot(input({ preference: "LONG_FAVORED" }));

  assert.equal(snapshot.longTicket.thirdRole, "MAJOR");
  assert.equal(snapshot.longTicket.assignedDistanceCents.value, 287);
  assert.equal(snapshot.longTicket.targetOffsetCents.value, 277);
  assert.equal(snapshot.longTicket.provisionalTargetCents.value, 20_542);
  assert.equal(snapshot.shortTicket.thirdRole, "MINOR");
  assert.equal(snapshot.shortTicket.targetOffsetCents.value, 47);
  assert.equal(snapshot.shortTicket.provisionalTargetCents.value, 20_218);
});

test("short paper preference reproduces the image-derived provisional targets", () => {
  const snapshot = buildMooPlanningSnapshot(input({ preference: "SHORT_FAVORED" }));

  assert.equal(snapshot.longTicket.thirdRole, "MINOR");
  assert.equal(snapshot.longTicket.provisionalTargetCents.value, 20_312);
  assert.equal(snapshot.shortTicket.thirdRole, "MAJOR");
  assert.equal(snapshot.shortTicket.provisionalTargetCents.value, 19_988);
});

test("auto quantity floors risk budget per share and caps at maximum shares", () => {
  const uncapped = buildMooPlanningSnapshot(input({
    preference: "LONG_FAVORED",
    longRisk: risk({ riskBudgetCents: 301, stopOffsetCents: 25, slippageAllowanceCents: 5, maxShares: 99 }),
  }));
  assert.equal(uncapped.longTicket.quantity.value, 10);
  assert.match(uncapped.longTicket.quantity.reason, /floor\(risk budget/i);

  const capped = buildMooPlanningSnapshot(input({
    preference: "LONG_FAVORED",
    longRisk: risk({ riskBudgetCents: 1_000, stopOffsetCents: 25, slippageAllowanceCents: 5, maxShares: 8 }),
  }));
  assert.equal(capped.longTicket.quantity.value, 8);
  assert.match(capped.longTicket.quantity.reason, /buying power is not assumed/i);
});

test("maximum modeled loss uses stop plus slippage times quantity", () => {
  const snapshot = buildMooPlanningSnapshot(input({
    preference: "LONG_FAVORED",
    longRisk: risk({ riskBudgetCents: 301, stopOffsetCents: 25, slippageAllowanceCents: 5, maxShares: 99 }),
  }));

  assert.equal(snapshot.longTicket.quantity.value, 10);
  assert.equal(snapshot.longTicket.maximumLossCents.value, 300);
  assert.match(snapshot.longTicket.maximumLossCents.reason, /fees, gaps, halts/i);
});

test("an auto budget too small for one share fails explicitly", () => {
  const snapshot = buildMooPlanningSnapshot(input({
    longRisk: risk({ riskBudgetCents: 29, stopOffsetCents: 25, slippageAllowanceCents: 5, maxShares: 8 }),
  }));

  assert.equal(snapshot.longTicket.quantity.value, null);
  assert.equal(snapshot.longTicket.quantity.state, "INVALID_INPUT");
  assert.match(snapshot.longTicket.quantity.reason, /too small for one share/i);
  assert.equal(snapshot.longTicket.maximumLossCents.value, null);
});

test("manual quantity must be positive and cannot exceed maximum shares", () => {
  const valid = buildMooPlanningSnapshot(input({
    longRisk: risk({ quantityMode: "MANUAL", manualQuantity: 4, maxShares: 5 }),
  }));
  assert.equal(valid.longTicket.quantity.value, 4);
  assert.equal(valid.longTicket.maximumLossCents.value, 120);

  const zero = buildMooPlanningSnapshot(input({
    longRisk: risk({ quantityMode: "MANUAL", manualQuantity: 0, maxShares: 5 }),
  }));
  assert.equal(zero.longTicket.quantity.state, "INVALID_INPUT");

  const aboveCap = buildMooPlanningSnapshot(input({
    longRisk: risk({ quantityMode: "MANUAL", manualQuantity: 6, maxShares: 5 }),
  }));
  assert.equal(aboveCap.longTicket.quantity.state, "INVALID_INPUT");
  assert.match(aboveCap.longTicket.quantity.reason, /cannot exceed/i);

  const aboveRiskBudget = buildMooPlanningSnapshot(input({
    longRisk: risk({ quantityMode: "MANUAL", manualQuantity: 4, maxShares: 5, riskBudgetCents: 100 }),
  }));
  assert.equal(aboveRiskBudget.longTicket.quantity.state, "INVALID_INPUT");
  assert.match(aboveRiskBudget.longTicket.quantity.reason, /exceeds the configured risk budget/i);
});

test("zero stop, zero risk budget, and zero maximum shares are invalid", () => {
  const snapshot = buildMooPlanningSnapshot(input({
    longRisk: risk({ stopOffsetCents: 0, riskBudgetCents: 0, maxShares: 0 }),
  }));

  assert.equal(snapshot.longTicket.stopOffsetCents.state, "INVALID_INPUT");
  assert.equal(snapshot.longTicket.riskBudgetCents.state, "INVALID_INPUT");
  assert.equal(snapshot.longTicket.quantity.state, "INVALID_INPUT");
  assert.equal(snapshot.longTicket.maximumLossCents.state, "INVALID_INPUT");
});

test("missing market and user inputs retain structured reasons and provenance", () => {
  const missingRisk = risk({
    stopOffsetCents: null,
    slippageAllowanceCents: null,
    riskBudgetCents: null,
    maxShares: null,
    reserveCents: null,
    accountLabel: null,
    timeStop: null,
  });
  const snapshot = buildMooPlanningSnapshot(input({
    researchAnchorCents: null,
    premarketHighCents: null,
    premarketLowCents: null,
    preference: "LONG_FAVORED",
    longRisk: missingRisk,
  }));

  assert.equal(snapshot.researchAnchorCents.state, "PENDING_MARKET_DATA");
  assert.deepEqual(snapshot.researchAnchorCents.provenance, ["SELECTED_SESSION_RESEARCH"]);
  assert.equal(snapshot.premarketRangeCents.state, "PENDING_MARKET_DATA");
  assert.ok(snapshot.premarketRangeCents.provenance.includes("TARGET_PREMARKET_DATA"));
  assert.equal(snapshot.longTicket.provisionalTargetCents.state, "PENDING_MARKET_DATA");
  assert.equal(snapshot.longTicket.stopOffsetCents.state, "USER_INPUT_REQUIRED");
  assert.equal(snapshot.longTicket.quantity.state, "USER_INPUT_REQUIRED");
  assert.equal(snapshot.longTicket.reserveCents.state, "USER_INPUT_REQUIRED");
  assert.equal(snapshot.longTicket.accountLabel.state, "USER_INPUT_REQUIRED");
  assert.equal(snapshot.longTicket.timeStop.state, "USER_INPUT_REQUIRED");
});

test("reserve stays a user input and is never inferred from account buying power", () => {
  const configured = buildMooPlanningSnapshot(input({
    longRisk: risk({ reserveCents: 123_45 }),
  }));
  assert.equal(configured.longTicket.reserveCents.value, 123_45);
  assert.deepEqual(configured.longTicket.reserveCents.provenance, ["USER_RISK_INPUT"]);

  const absent = buildMooPlanningSnapshot(input({
    longRisk: risk({ reserveCents: null }),
  }));
  assert.equal(absent.longTicket.reserveCents.state, "USER_INPUT_REQUIRED");
});

test("invalid cushion blocks target offsets without affecting third candidates", () => {
  const snapshot = buildMooPlanningSnapshot(input({
    preference: "SHORT_FAVORED",
    takeProfitCushionCents: -1,
  }));

  assert.equal(snapshot.takeProfitCushionCents.state, "INVALID_INPUT");
  assert.equal(snapshot.majorThirdCents.value, 287);
  assert.equal(snapshot.shortTicket.targetOffsetCents.state, "INVALID_INPUT");
  assert.equal(snapshot.shortTicket.provisionalTargetCents.state, "INVALID_INPUT");
});

test("risk sums and products outside safe integer precision are rejected", () => {
  const unsafeSum = buildMooPlanningSnapshot(input({
    longRisk: risk({
      stopOffsetCents: Number.MAX_SAFE_INTEGER,
      slippageAllowanceCents: 1,
      riskBudgetCents: Number.MAX_SAFE_INTEGER,
      maxShares: 1,
    }),
  }));
  assert.equal(unsafeSum.longTicket.quantity.state, "INVALID_INPUT");

  const unsafeProduct = buildMooPlanningSnapshot(input({
    longRisk: risk({
      quantityMode: "MANUAL",
      stopOffsetCents: 2_000_000_000,
      slippageAllowanceCents: 0,
      riskBudgetCents: Number.MAX_SAFE_INTEGER,
      manualQuantity: 5_000_000,
      maxShares: 5_000_000,
    }),
  }));
  assert.equal(unsafeProduct.longTicket.quantity.state, "INVALID_INPUT");
  assert.equal(unsafeProduct.longTicket.maximumLossCents.state, "INVALID_INPUT");
});
