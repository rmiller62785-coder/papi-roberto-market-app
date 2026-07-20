import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMooDecisionSnapshot,
  calculateMooThirds,
  effectiveThirdCents,
  rebaseMooTargetCents,
} from "../app/moo-strategy.ts";

const readyAt = Date.parse("2026-07-20T13:24:00Z");

function liveUs(observedAt = readyAt - 1_000) {
  return {
    id: "US",
    label: "US SIP",
    venue: "NASDAQ/SIP",
    provider: "test",
    entitlement: "REALTIME",
    observedAt,
    checkedAt: observedAt + 100,
    ageMs: 1_000,
    state: "LIVE",
  };
}

function validInput(overrides = {}) {
  return {
    nowMs: readyAt,
    targetSession: "2026-07-20",
    snapshotId: "fixture",
    prediction: {
      predictedOfficialOpenCents: 20_265,
      decision: "SHORT_FAVORED",
      confidencePct: 68,
      generatedAt: readyAt,
      trained: true,
      modelVersion: "test-v1",
      featureSchemaVersion: "features-v1",
    },
    dataQualityScore: 94,
    sources: [liveUs()],
    previousHighCents: 20_665,
    previousLowCents: 19_797,
    premarketHighCents: 20_273,
    premarketLowCents: 20_104,
    shortability: "AVAILABLE",
    ...overrides,
  };
}

test("literal 0.33, half-up rounding, and one tick reproduce handwritten thirds", () => {
  assert.equal(effectiveThirdCents(361), 120);
  assert.equal(effectiveThirdCents(182), 61);
  assert.equal(effectiveThirdCents(150), 51, "49.50 cents rounds half-up to 50, then adds a tick");
  const result = calculateMooThirds({
    previousHighCents: 20_665,
    previousLowCents: 19_797,
    premarketHighCents: 20_273,
    premarketLowCents: 20_104,
  });
  assert.equal(result.previousRangeCents, 868);
  assert.equal(result.previousEffectiveThirdCents, 287);
  assert.equal(result.premarketRangeCents, 169);
  assert.equal(result.premarketEffectiveThirdCents, 57);
  assert.equal(result.majorThirdCents, 287);
  assert.equal(result.minorThirdCents, 57);
});

test("short-favored and long-favored sample targets apply the separate ten-cent cushion", () => {
  const short = buildMooDecisionSnapshot(validInput());
  assert.equal(short.decision, "SHORT_FAVORED");
  assert.equal(short.longTicket.estimatedTargetCents, 20_312);
  assert.equal(short.shortTicket.estimatedTargetCents, 19_988);
  assert.equal(short.longTicket.thirdRole, "MINOR");
  assert.equal(short.shortTicket.thirdRole, "MAJOR");

  const long = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, decision: "LONG_FAVORED" },
  }));
  assert.equal(long.longTicket.estimatedTargetCents, 20_542);
  assert.equal(long.shortTicket.estimatedTargetCents, 20_218);
  assert.equal(long.longTicket.thirdRole, "MAJOR");
  assert.equal(long.shortTicket.thirdRole, "MINOR");
});

test("the second handwritten fixture produces 203.13 and 201.11", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, predictedOfficialOpenCents: 20_274 },
    previousHighCents: 20_520,
    previousLowCents: 20_000,
    premarketHighCents: 20_145,
    premarketLowCents: 20_000,
  }));
  assert.equal(snapshot.majorThirdCents, 173);
  assert.equal(snapshot.minorThirdCents, 49);
  assert.equal(snapshot.longTicket.estimatedTargetCents, 20_313);
  assert.equal(snapshot.shortTicket.estimatedTargetCents, 20_111);
});

test("each broker fill independently rebases its ticket", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    longFillCents: 20_280,
    shortFillCents: 20_270,
    actualOfficialOpenCents: 20_275,
    officialOpenSource: "Nasdaq Opening Cross Q",
  }));
  assert.equal(snapshot.longTicket.rebasedTargetCents, 20_327);
  assert.equal(snapshot.shortTicket.rebasedTargetCents, 19_993);
  assert.equal(snapshot.predictionErrorCents, 10);
  assert.equal(rebaseMooTargetCents("LONG", 20_280, 57), 20_327);
  assert.equal(rebaseMooTargetCents("SHORT", 20_270, 287), 19_993);
});

test("an untrained transparent baseline remains visible but forces NO_TRADE and null confidence", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, trained: false, modelVersion: "transparent-midpoint-baseline" },
  }));
  assert.equal(snapshot.predictedOfficialOpenCents, 20_265);
  assert.equal(snapshot.predictedOpenState, "AVAILABLE");
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "MODEL_NOT_TRAINED");
  assert.equal(snapshot.confidencePct, null);
  assert.equal(snapshot.longTicket.actionable, false);
  assert.equal(snapshot.shortTicket.actionable, false);
});

test("closed, unentitled, stale, low-quality, low-confidence, and missing-borrow gates fail safe", () => {
  const cases = [
    [validInput({ nowMs: Date.parse("2026-07-19T13:24:00Z") }), "MARKET_CLOSED"],
    [validInput({ sources: [{ ...liveUs(), entitlement: "DELAYED", state: "DELAYED" }] }), "FEED_NOT_ENTITLED"],
    [validInput({ sources: [liveUs(readyAt - 10_000)] }), "STALE_US_QUOTE"],
    [validInput({ dataQualityScore: 79 }), "LOW_DATA_QUALITY"],
    [validInput({ prediction: { ...validInput().prediction, confidencePct: 59 } }), "LOW_CONFIDENCE"],
    [validInput({ shortability: "UNCONFIRMED" }), "SHORTABILITY_UNCONFIRMED"],
  ];
  for (const [input, reason] of cases) {
    const snapshot = buildMooDecisionSnapshot(input);
    assert.equal(snapshot.decision, "NO_TRADE", reason);
    assert.equal(snapshot.blockReason, reason);
    assert.equal(snapshot.confidencePct, null);
  }
});

test("post-cutoff inputs cannot replace the frozen prediction", () => {
  const frozenAt = Date.parse("2026-07-20T13:24:20Z");
  const nowMs = Date.parse("2026-07-20T13:26:00Z");
  const frozenPrediction = {
    ...validInput().prediction,
    predictedOfficialOpenCents: 20_265,
    generatedAt: frozenAt,
  };
  const snapshot = buildMooDecisionSnapshot(validInput({
    nowMs,
    frozenAt,
    frozenPrediction,
    prediction: {
      ...frozenPrediction,
      predictedOfficialOpenCents: 99_999,
      generatedAt: Date.parse("2026-07-20T13:25:30Z"),
    },
    sources: [liveUs(frozenAt - 1_000)],
    lateOrderAcknowledged: false,
  }));
  assert.equal(snapshot.predictedOfficialOpenCents, 20_265);
  assert.equal(snapshot.lifecycle, "LATE_LOCKED");
  assert.equal(snapshot.longTicket.actionable, false);
  assert.match(snapshot.warnings.join(" "), /acknowledgement/i);
});

