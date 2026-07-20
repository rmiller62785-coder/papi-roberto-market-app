import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMooReadiness } from "../app/moo-readiness.ts";

const at = Date.parse("2026-07-20T13:24:00Z");

function source(id, overrides = {}) {
  return {
    id,
    label: id,
    venue: id,
    provider: "fixture",
    entitlement: "REALTIME",
    observedAt: at - 500,
    checkedAt: at - 250,
    ageMs: 500,
    state: "LIVE",
    ...overrides,
  };
}

function ticket(side, overrides = {}) {
  return {
    side,
    orderType: "MOO",
    favored: side === "SHORT",
    actionable: true,
    thirdRole: side === "SHORT" ? "MAJOR" : "MINOR",
    assignedDistanceCents: side === "SHORT" ? 287 : 57,
    targetMoveCents: side === "SHORT" ? 277 : 47,
    estimatedFillCents: 20_265,
    estimatedTargetCents: side === "SHORT" ? 19_988 : 20_312,
    actualFillCents: null,
    rebasedTargetCents: null,
    stopOffsetCents: 100,
    quantity: 25,
    accountLabel: `${side} paper`,
    reserveCents: 0,
    maximumLossCents: 2_500,
    timeStop: "10:00 ET",
    shortability: side === "SHORT" ? "AVAILABLE" : "NOT_APPLICABLE",
    ...overrides,
  };
}

function readySnapshot(overrides = {}) {
  return {
    schemaVersion: "moo-phase1-v1",
    snapshotId: "fixture",
    targetSession: "2026-07-20",
    generatedAt: at,
    frozenAt: at,
    lifecycle: "FROZEN",
    decision: "SHORT_FAVORED",
    blockReason: "NONE",
    predictedOfficialOpenCents: 20_265,
    predictedOpenState: "AVAILABLE",
    actualOfficialOpenCents: null,
    officialOpenSource: null,
    predictionErrorCents: null,
    confidencePct: 68,
    dataQualityScore: 94,
    modelVersion: "test-v1",
    featureSchemaVersion: "features-v1",
    actionCutoffAt: at + 30_000,
    deadlines: [],
    previousRangeCents: 868,
    premarketRangeCents: 169,
    previousEffectiveThirdCents: 287,
    premarketEffectiveThirdCents: 57,
    majorThirdCents: 287,
    minorThirdCents: 57,
    thirdPercentBasisPoints: 3300,
    tickSizeCents: 1,
    addOneTick: true,
    takeProfitCushionCents: 10,
    longTicket: ticket("LONG"),
    shortTicket: ticket("SHORT"),
    sources: [source("US"), source("NVD"), source("FX"), source("FUTURES"), source("NOII")],
    warnings: [],
    ...overrides,
  };
}

const guaranteedBroker = {
  shortable: true,
  borrowStatus: "easy_to_borrow",
  locateGuaranteed: true,
};

test("the required denominator contains only the current strict source policy", () => {
  const summary = summarizeMooReadiness(readySnapshot(), guaranteedBroker);

  assert.equal(summary.requiredReady, 1);
  assert.equal(summary.requiredTotal, 1);
  assert.deepEqual(summary.sourceGroups.requiredNow.items.map((item) => item.id), ["US"]);
  assert.equal(summary.optionalAvailable, 3);
  assert.equal(summary.optionalTotal, 3);
  assert.deepEqual(summary.sourceGroups.postFreezeMonitoring.items.map((item) => item.id), ["NOII"]);
  assert.equal(summary.connectionMode, "REST_POLLING");
});

test("the required denominator follows the snapshot policy instead of a UI constant", () => {
  const summary = summarizeMooReadiness(readySnapshot({
    requiredSourceIds: ["US", "FUTURES"],
  }), guaranteedBroker);

  assert.equal(summary.requiredReady, 2);
  assert.equal(summary.requiredTotal, 2);
  assert.deepEqual(summary.sourceGroups.requiredNow.items.map((item) => item.id), ["US", "FUTURES"]);
  assert.deepEqual(summary.sourceGroups.optionalResearch.items.map((item) => item.id), ["NVD", "FX"]);
});

test("a missing or duplicated required source keeps a stable one-source denominator and fails closed", () => {
  const missing = summarizeMooReadiness(readySnapshot({ sources: [] }), guaranteedBroker);
  assert.equal(missing.requiredReady, 0);
  assert.equal(missing.requiredTotal, 1);
  assert.equal(missing.sourceGroups.requiredNow.items[0].state, "MISSING");
  assert.equal(missing.dominantBlockerCode, "FEED_NOT_ENTITLED");

  const duplicated = summarizeMooReadiness(
    readySnapshot({ sources: [source("US"), source("US")] }),
    guaranteedBroker,
  );
  assert.equal(duplicated.requiredReady, 0);
  assert.equal(duplicated.requiredTotal, 1);
  assert.equal(duplicated.sourceGroups.requiredNow.items[0].duplicate, true);
  assert.equal(duplicated.dominantBlockerCode, "FEED_NOT_ENTITLED");
});

test("optional research outages degrade research without blocking strict commission", () => {
  const snapshot = readySnapshot({
    sources: [
      source("US"),
      source("NVD", { state: "UNAVAILABLE", entitlement: "NOT_ENTITLED" }),
      source("FX", { state: "UNAVAILABLE", entitlement: "NOT_ENTITLED" }),
      source("FUTURES", { state: "UNAVAILABLE", entitlement: "NOT_ENTITLED" }),
      source("NOII", { state: "UNAVAILABLE", entitlement: "NOT_ENTITLED" }),
    ],
  });
  const summary = summarizeMooReadiness(snapshot, guaranteedBroker);

  assert.equal(summary.requiredReady, 1);
  assert.equal(summary.requiredTotal, 1);
  assert.equal(summary.optionalAvailable, 0);
  assert.equal(summary.optionalTotal, 3);
  assert.equal(summary.researchOperationalState, "RESEARCH_DEGRADED");
  assert.equal(summary.dominantBlockerCode, "NONE");
  assert.equal(summary.strictCommissionState, "COMMISSIONED_READY");
});

test("indicative shortable and easy-to-borrow metadata never substitutes for a guaranteed locate", () => {
  const summary = summarizeMooReadiness(readySnapshot(), {
    shortable: true,
    borrowStatus: "easy_to_borrow",
    locateGuaranteed: false,
  });

  assert.equal(summary.broker.indicativeShortable, true);
  assert.equal(summary.broker.indicativeBorrowStatusCode, "EASY_TO_BORROW");
  assert.equal(summary.broker.indicativeEasyToBorrow, true);
  assert.equal(summary.broker.guaranteedLocateConfirmed, false);
  assert.equal(summary.broker.strictLocateReady, false);
  assert.equal(summary.dominantBlockerCode, "SHORTABILITY_UNCONFIRMED");
  assert.equal(summary.strictCommissionState, "COMMISSIONED_BLOCKED");
});

test("a long-favored decision does not require a short locate", () => {
  const snapshot = readySnapshot({
    decision: "LONG_FAVORED",
    longTicket: ticket("LONG", { favored: true }),
    shortTicket: ticket("SHORT", { favored: false, shortability: "UNCONFIRMED" }),
  });
  const summary = summarizeMooReadiness(snapshot, {
    shortable: true,
    borrowStatus: "easy_to_borrow",
    locateGuaranteed: false,
  });

  assert.equal(summary.broker.strictLocateReady, false);
  assert.equal(summary.dominantBlockerCode, "NONE");
  assert.equal(summary.strictCommissionState, "COMMISSIONED_READY");
});

test("an untrained NO_TRADE snapshot is explicitly not commissioned while paper math can remain operational", () => {
  const snapshot = readySnapshot({
    decision: "NO_TRADE",
    blockReason: "MODEL_NOT_TRAINED",
    confidencePct: null,
    modelVersion: "transparent-research-baseline-v1",
    featureSchemaVersion: null,
    longTicket: ticket("LONG", { favored: false, actionable: false, thirdRole: "UNASSIGNED" }),
    shortTicket: ticket("SHORT", { favored: false, actionable: false, thirdRole: "UNASSIGNED" }),
  });
  const summary = summarizeMooReadiness(snapshot, {
    shortable: true,
    borrowStatus: "easy_to_borrow",
    locateGuaranteed: false,
  });

  assert.equal(summary.dominantBlockerCode, "MODEL_NOT_TRAINED");
  assert.equal(summary.strictCommissionState, "NOT_COMMISSIONED");
  assert.equal(summary.paperOperationalState, "PAPER_OPERATIONAL");
});

test("an internally inconsistent NONE snapshot still fails closed when model identity is missing", () => {
  const summary = summarizeMooReadiness(readySnapshot({
    modelVersion: null,
    featureSchemaVersion: null,
  }), guaranteedBroker);

  assert.equal(summary.dominantBlockerCode, "MODEL_NOT_TRAINED");
  assert.equal(summary.strictCommissionState, "NOT_COMMISSIONED");
});

test("all-ready input reports operational research and paper states without weakening strict gates", () => {
  const summary = summarizeMooReadiness(readySnapshot(), guaranteedBroker);

  assert.equal(summary.requiredReady, 1);
  assert.equal(summary.requiredTotal, 1);
  assert.equal(summary.optionalAvailable, 3);
  assert.equal(summary.optionalTotal, 3);
  assert.equal(summary.dominantBlockerCode, "NONE");
  assert.equal(summary.strictCommissionState, "COMMISSIONED_READY");
  assert.equal(summary.researchOperationalState, "RESEARCH_OPERATIONAL");
  assert.equal(summary.paperOperationalState, "PAPER_OPERATIONAL");
  assert.equal(summary.broker.strictLocateReady, true);
});
