import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMooDecisionSnapshot,
  calculateMooThirds,
  effectiveThirdCents,
  rebaseMooTargetCents,
  sealMooFrozenDecisionContext,
} from "../app/moo-strategy.ts";
import { sealMooLocateProof } from "../app/moo-contract.ts";
import { summarizeMooReadiness } from "../app/moo-readiness.ts";

const readyAt = Date.parse("2026-07-20T13:24:00Z");

function liveUs(observedAt = readyAt - 1_000) {
  return {
    id: "US",
    label: "US SIP",
    venue: "NASDAQ/SIP",
    provider: "test",
    entitlement: "REALTIME",
    coverage: "CONSOLIDATED_SIP",
    observedAt,
    checkedAt: observedAt + 100,
    ageMs: 1_000,
    state: "LIVE",
  };
}

function locateProof(accountAlias, quantity, availableAt = readyAt) {
  return sealMooLocateProof({
    schemaVersion: "moo-locate-proof-v1",
    broker: "fixture-broker",
    accountAlias,
    symbol: "NVDA",
    targetSession: "2026-07-20",
    quantity,
    locateId: `locate-${accountAlias}-${quantity}`,
    availableAt,
    validUntil: Date.parse("2026-07-20T13:29:00Z"),
    guaranteed: true,
  });
}

function validInput(overrides = {}) {
  return {
    nowMs: readyAt,
    targetSession: "2026-07-20",
    snapshotId: "fixture",
    prediction: {
      targetSession: "2026-07-20",
      featureSnapshotId: "feature-snapshot-2026-07-20-t5",
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

function persistedContext(overrides = {}) {
  const base = validInput();
  const frozenAt = Date.parse("2026-07-20T13:24:20Z");
  return sealMooFrozenDecisionContext({
    schemaVersion: "moo-phase1-v1",
    snapshotId: "frozen-2026-07-20-t5",
    targetSession: "2026-07-20",
    frozenAt,
    prediction: { ...base.prediction, generatedAt: frozenAt },
    dataQualityScore: base.dataQualityScore,
    sources: [liveUs(frozenAt - 1_000)],
    requiredSourceIds: ["US"],
    previousHighCents: base.previousHighCents,
    previousLowCents: base.previousLowCents,
    premarketHighCents: base.premarketHighCents,
    premarketLowCents: base.premarketLowCents,
    shortability: base.shortability,
    config: {},
    ...overrides,
  });
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
    nowMs: Date.parse("2026-07-20T13:30:01Z"),
    frozenContext: persistedContext(),
    longFillCents: 20_280,
    shortFillCents: 20_270,
    actualOfficialOpenCents: 20_275,
    officialOpenSource: "NASDAQ_OFFICIAL_CROSS",
  }));
  assert.equal(snapshot.longTicket.rebasedTargetCents, 20_327);
  assert.equal(snapshot.shortTicket.rebasedTargetCents, 19_993);
  assert.equal(snapshot.predictionErrorCents, 10);
  assert.equal(rebaseMooTargetCents("LONG", 20_280, 57), 20_327);
  assert.equal(rebaseMooTargetCents("SHORT", 20_270, 287), 19_993);
});

test("opening-cross outcomes are ignored before the cross completes", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    longFillCents: 20_280,
    actualOfficialOpenCents: 20_275,
    officialOpenSource: "NASDAQ_OFFICIAL_CROSS",
  }));
  assert.equal(snapshot.actualOfficialOpenCents, null);
  assert.equal(snapshot.longTicket.actualFillCents, null);
  assert.match(snapshot.warnings.join(" "), /ignored before/i);
});

test("the final-entry and Opening Cross boundaries report a closed MOO entry window", () => {
  const stillOpen = buildMooDecisionSnapshot(validInput({
    nowMs: Date.parse("2026-07-20T13:27:59Z"),
    frozenContext: persistedContext(),
    lateOrderAcknowledged: true,
  }));
  assert.notEqual(summarizeMooReadiness(stillOpen).dominantBlockerCode, "ENTRY_WINDOW_CLOSED");

  for (const nowMs of [Date.parse("2026-07-20T13:28:00Z"), Date.parse("2026-07-20T13:30:00Z")]) {
    const snapshot = buildMooDecisionSnapshot(validInput({ nowMs, frozenContext: persistedContext() }));
    assert.equal(summarizeMooReadiness(snapshot).dominantBlockerCode, "ENTRY_WINDOW_CLOSED");
    assert.equal(snapshot.longTicket.actionable, false);
    assert.equal(snapshot.shortTicket.actionable, false);
  }
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
  assert.equal(snapshot.longTicket.thirdRole, "UNASSIGNED");
  assert.equal(snapshot.shortTicket.thirdRole, "UNASSIGNED");
});

test("strict tickets remain non-actionable until every risk control is configured", () => {
  const incomplete = buildMooDecisionSnapshot(validInput());
  assert.equal(incomplete.decision, "SHORT_FAVORED");
  assert.equal(incomplete.longTicket.actionable, false);
  assert.equal(incomplete.shortTicket.actionable, false);

  const longConfiguration = {
    stopOffsetCents: 25,
    quantity: 2,
    accountLabel: "Private paper long",
    reserveCents: 1_000,
    maximumLossCents: 50,
    timeStop: "10:30 ET",
  };
  const shortConfiguration = { ...longConfiguration, accountLabel: "Private paper short" };
  const complete = buildMooDecisionSnapshot(validInput({
    longTicket: longConfiguration,
    shortTicket: shortConfiguration,
    shortLocateProof: locateProof(shortConfiguration.accountLabel, shortConfiguration.quantity),
    config: { portfolioMaximumLossCents: 100 },
  }));
  assert.equal(complete.longTicket.actionable, false);
  assert.equal(complete.shortTicket.actionable, true);

  const missingLocate = buildMooDecisionSnapshot(validInput({
    longTicket: longConfiguration,
    shortTicket: shortConfiguration,
    config: { portfolioMaximumLossCents: 100 },
  }));
  assert.equal(missingLocate.shortTicket.actionable, false);
  assert.match(missingLocate.warnings.join(" "), /account-specific NVDA locate/);

  for (const invalid of [
    { ...longConfiguration, quantity: 0 },
    { ...longConfiguration, stopOffsetCents: 0 },
    { ...longConfiguration, maximumLossCents: 49 },
    { ...longConfiguration, accountLabel: "" },
    { ...longConfiguration, timeStop: "" },
  ]) {
    const snapshot = buildMooDecisionSnapshot(validInput({
      longTicket: invalid,
      shortTicket: shortConfiguration,
      config: { portfolioMaximumLossCents: 100 },
    }));
    assert.equal(snapshot.longTicket.actionable, false);
    assert.equal(snapshot.shortTicket.actionable, false);
  }

  const sameAccount = buildMooDecisionSnapshot(validInput({
    longTicket: longConfiguration,
    shortTicket: { ...shortConfiguration, accountLabel: longConfiguration.accountLabel },
    config: { portfolioMaximumLossCents: 100 },
  }));
  assert.equal(sameAccount.longTicket.actionable, false);
  assert.equal(sameAccount.shortTicket.actionable, false);

  const overPortfolioCap = buildMooDecisionSnapshot(validInput({
    longTicket: longConfiguration,
    shortTicket: shortConfiguration,
    config: { portfolioMaximumLossCents: 99 },
  }));
  assert.equal(overPortfolioCap.longTicket.actionable, false);
  assert.equal(overPortfolioCap.shortTicket.actionable, false);
});

test("closed, unentitled, stale, low-quality, low-confidence, and missing-borrow gates fail safe", () => {
  const cases = [
    [validInput({ nowMs: Date.parse("2026-07-21T13:24:00Z") }), "MARKET_CLOSED"],
    [validInput({ sources: [] }), "FEED_NOT_ENTITLED"],
    [validInput({ sources: [{ ...liveUs(), entitlement: "DELAYED", state: "DELAYED" }] }), "FEED_NOT_ENTITLED"],
    [validInput({ sources: [liveUs(readyAt - 10_000)] }), "STALE_US_QUOTE"],
    [validInput({ sources: [liveUs(readyAt + 5_000)] }), "STALE_US_QUOTE"],
    [validInput({ dataQualityScore: 79 }), "LOW_DATA_QUALITY"],
    [validInput({ prediction: { ...validInput().prediction, confidencePct: 59 } }), "LOW_CONFIDENCE"],
    [validInput({ shortability: "UNCONFIRMED" }), "SHORTABILITY_UNCONFIRMED"],
  ];
  for (const [input, reason] of cases) {
    const snapshot = buildMooDecisionSnapshot(input);
    assert.equal(snapshot.decision, "NO_TRADE", reason);
    assert.equal(snapshot.blockReason, reason);
    if (reason === "LOW_CONFIDENCE") assert.equal(snapshot.confidencePct, 59);
    else if (reason === "SHORTABILITY_UNCONFIRMED") assert.equal(snapshot.confidencePct, 68);
    else assert.equal(snapshot.confidencePct, null);
  }
});

test("a real-time IEX-only quote cannot satisfy the consolidated U.S. execution gate", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    sources: [{ ...liveUs(), venue: "IEX", coverage: "IEX_SINGLE_EXCHANGE" }],
  }));
  assert.equal(snapshot.blockReason, "FEED_NOT_ENTITLED");
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.match(snapshot.warnings.join(" "), /CONSOLIDATED_SIP/);
});

test("a calibrated model NO_TRADE is preserved as NO_EDGE with confidence and prediction", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, decision: "NO_TRADE", confidencePct: 73 },
  }));

  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "NO_EDGE");
  assert.equal(snapshot.decisionReasonCode, "NO_EDGE");
  assert.equal(snapshot.predictedOfficialOpenCents, 20_265);
  assert.equal(snapshot.confidencePct, 73);
  assert.equal(snapshot.confidenceState, "AVAILABLE");
  assert.equal(snapshot.longTicket.actionable, false);
  assert.equal(snapshot.shortTicket.actionable, false);
});

test("required source data received after evaluation is rejected despite an earlier provider timestamp", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    sources: [{
      ...liveUs(readyAt - 1_000),
      receivedAt: readyAt + 1,
      processedAt: readyAt + 1,
      availableAt: readyAt + 1,
    }],
  }));

  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "STALE_US_QUOTE");
  assert.match(snapshot.warnings.join(" "), /not available to the application/i);
});

test("required-source policy cannot be empty, duplicated, unknown, or omit US SIP", () => {
  for (const requiredSourceIds of [[], ["US", "US"], ["NOII"], ["US", "BOGUS"]]) {
    const snapshot = buildMooDecisionSnapshot(validInput({ requiredSourceIds }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "FEED_NOT_ENTITLED");
    assert.match(snapshot.warnings.join(" "), /policy is invalid/i);
  }
});

test("a mutated frozen context cannot be replayed after cutoff even when timestamps are backdated", () => {
  const context = structuredClone(persistedContext());
  context.prediction.predictedOfficialOpenCents = 99_999;
  const snapshot = buildMooDecisionSnapshot(validInput({
    nowMs: Date.parse("2026-07-20T13:26:00Z"),
    frozenContext: context,
    lateOrderAcknowledged: true,
  }));
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "DATA_PENDING");
  assert.match(snapshot.warnings.join(" "), /schema or snapshot identity is invalid/i);
});

test("a live prediction cannot be replayed into another target session", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, targetSession: "2026-07-21" },
  }));
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "DATA_PENDING");
  assert.equal(snapshot.predictedOfficialOpenCents, null);
  assert.match(snapshot.warnings.join(" "), /different session|runtime identity/i);
});

test("a trained prediction requires an immutable feature snapshot identity", () => {
  const snapshot = buildMooDecisionSnapshot(validInput({
    prediction: { ...validInput().prediction, featureSnapshotId: null },
  }));
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "DATA_PENDING");
  assert.match(snapshot.warnings.join(" "), /runtime identity/i);
});

test("a source check cannot materially predate its observation", () => {
  const observedAt = readyAt - 500;
  const snapshot = buildMooDecisionSnapshot(validInput({
    sources: [{ ...liveUs(observedAt), checkedAt: observedAt - 2_000 }],
  }));
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "STALE_US_QUOTE");
  assert.match(snapshot.warnings.join(" "), /predates its observation/i);
});

test("required source timestamps even slightly after evaluation are rejected", () => {
  for (const offsetMs of [1, 999]) {
    const snapshot = buildMooDecisionSnapshot(validInput({
      sources: [{ ...liveUs(readyAt), observedAt: readyAt + offsetMs, checkedAt: readyAt + offsetMs }],
    }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "STALE_US_QUOTE");
    assert.match(snapshot.warnings.join(" "), /post-evaluation|clock-skewed/i);
  }
});

test("feature snapshot identity is preserved in the audit contract", () => {
  const snapshot = buildMooDecisionSnapshot(validInput());
  assert.equal(snapshot.featureSnapshotId, "feature-snapshot-2026-07-20-t5");
});

test("required source timestamps and age must be finite and auditable", () => {
  const cases = [
    { checkedAt: null },
    { checkedAt: Number.NaN },
    { observedAt: Number.NaN },
    { ageMs: Number.NaN },
  ];
  for (const override of cases) {
    const snapshot = buildMooDecisionSnapshot(validInput({ sources: [{ ...liveUs(), ...override }] }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "STALE_US_QUOTE");
  }
});

test("duplicate required source records fail closed regardless of order", () => {
  for (const sources of [
    [liveUs(), { ...liveUs(), state: "DELAYED" }],
    [{ ...liveUs(), state: "DELAYED" }, liveUs()],
  ]) {
    const snapshot = buildMooDecisionSnapshot(validInput({ sources }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "FEED_NOT_ENTITLED");
    assert.match(snapshot.warnings.join(" "), /duplicate source-health/i);
  }
});

test("trained prediction identity requires model, schema, feature snapshot, and finite generation time", () => {
  const cases = [
    { modelVersion: null },
    { modelVersion: "" },
    { featureSchemaVersion: null },
    { featureSchemaVersion: "" },
    { featureSnapshotId: null },
    { generatedAt: Number.NaN },
  ];
  for (const override of cases) {
    const snapshot = buildMooDecisionSnapshot(validInput({ prediction: { ...validInput().prediction, ...override } }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "DATA_PENDING");
    assert.match(snapshot.warnings.join(" "), /runtime identity/i);
  }
});

test("an invalid frozen timestamp cannot activate a persisted decision context", () => {
  const nowMs = Date.parse("2026-07-20T13:26:00Z");
  for (const frozenAt of [Number.NaN, 0, Date.parse("2026-07-20T13:24:31Z")]) {
    const frozenContext = structuredClone(persistedContext());
    frozenContext.frozenAt = frozenAt;
    frozenContext.prediction.generatedAt = 0;
    const snapshot = buildMooDecisionSnapshot(validInput({
      nowMs,
      frozenContext,
      lateOrderAcknowledged: true,
    }));
    assert.equal(snapshot.decision, "NO_TRADE");
    assert.equal(snapshot.blockReason, "DATA_PENDING");
    assert.equal(snapshot.frozenAt, null);
    assert.equal(snapshot.sources.length, 0);
  }
});

test("a selected future session is visible but cannot become actionable", () => {
  const nowMs = Date.parse("2026-07-19T16:00:00Z");
  const snapshot = buildMooDecisionSnapshot(validInput({
    nowMs,
    prediction: {
      ...validInput().prediction,
      generatedAt: nowMs,
    },
  }));

  assert.equal(snapshot.lifecycle, "FUTURE_SESSION");
  assert.equal(snapshot.blockReason, "TARGET_SESSION_NOT_STARTED");
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.predictedOfficialOpenCents, 20_265);
  assert.equal(snapshot.predictedOpenState, "AVAILABLE");
  assert.equal(snapshot.longTicket.actionable, false);
  assert.equal(snapshot.shortTicket.actionable, false);
  assert.match(snapshot.warnings.join(" "), /target session has not started/i);
});

test("a future session with missing prediction remains pending rather than claiming an available trade", () => {
  const nowMs = Date.parse("2026-07-19T16:00:00Z");
  const snapshot = buildMooDecisionSnapshot(validInput({ nowMs, prediction: null }));

  assert.equal(snapshot.lifecycle, "FUTURE_SESSION");
  assert.equal(snapshot.blockReason, "TARGET_SESSION_NOT_STARTED");
  assert.equal(snapshot.predictedOfficialOpenCents, null);
  assert.equal(snapshot.predictedOpenState, "PENDING");
  assert.equal(snapshot.decision, "NO_TRADE");
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
    frozenContext: persistedContext({ prediction: frozenPrediction }),
    prediction: {
      ...frozenPrediction,
      predictedOfficialOpenCents: 99_999,
      generatedAt: Date.parse("2026-07-20T13:25:30Z"),
    },
    // Current monitoring data is newer than the immutable decision. It remains
    // visible to the caller but cannot replace the frozen source snapshot.
    sources: [liveUs(nowMs)],
    lateOrderAcknowledged: false,
  }));
  assert.equal(snapshot.predictedOfficialOpenCents, 20_265);
  assert.equal(snapshot.lifecycle, "LATE_LOCKED");
  assert.equal(snapshot.longTicket.actionable, false);
  assert.equal(snapshot.sources[0].observedAt, frozenAt - 1_000);
  assert.match(snapshot.warnings.join(" "), /acknowledgement/i);
});

test("all post-cutoff decision math and gates come from the complete frozen context", () => {
  const nowMs = Date.parse("2026-07-20T13:26:00Z");
  const context = persistedContext({
    longTicket: { quantity: 2, stopOffsetCents: 25 },
    shortTicket: { quantity: 3, stopOffsetCents: 30 },
  });
  const baseline = buildMooDecisionSnapshot(validInput({
    nowMs,
    frozenContext: context,
    lateOrderAcknowledged: true,
  }));
  const mutatedLiveInputs = buildMooDecisionSnapshot(validInput({
    nowMs,
    frozenContext: context,
    prediction: {
      ...validInput().prediction,
      predictedOfficialOpenCents: 99_999,
      decision: "LONG_FAVORED",
      generatedAt: nowMs,
    },
    sources: [{ ...liveUs(nowMs), entitlement: "DELAYED", state: "DELAYED" }],
    requiredSourceIds: ["US", "NVD", "FX", "FUTURES", "NOII"],
    dataQualityScore: 0,
    previousHighCents: 90_000,
    previousLowCents: 10,
    premarketHighCents: 80_000,
    premarketLowCents: 20,
    shortability: "UNAVAILABLE",
    config: {
      thirdPercentBasisPoints: 3333,
      addOneTick: false,
      takeProfitCushionCents: 999,
      minimumConfidencePct: 99,
      minimumDataQualityScore: 99,
    },
    longTicket: { quantity: 999, stopOffsetCents: 999 },
    shortTicket: { quantity: 999, stopOffsetCents: 999 },
    lateOrderAcknowledged: true,
  }));

  for (const field of [
    "decision", "blockReason", "predictedOfficialOpenCents", "dataQualityScore",
    "previousRangeCents", "premarketRangeCents", "majorThirdCents", "minorThirdCents",
    "thirdPercentBasisPoints", "takeProfitCushionCents",
  ]) {
    assert.equal(mutatedLiveInputs[field], baseline[field], field);
  }
  assert.deepEqual(mutatedLiveInputs.sources, baseline.sources);
  assert.deepEqual(mutatedLiveInputs.longTicket, baseline.longTicket);
  assert.deepEqual(mutatedLiveInputs.shortTicket, baseline.shortTicket);
  assert.equal(mutatedLiveInputs.blockReason, "NONE");
});

test("a backdated current prediction is not accepted as a persisted freeze", () => {
  const nowMs = Date.parse("2026-07-20T13:26:00Z");
  const snapshot = buildMooDecisionSnapshot(validInput({
    nowMs,
    prediction: {
      ...validInput().prediction,
      generatedAt: Date.parse("2026-07-20T13:24:20Z"),
    },
    frozenPrediction: null,
    frozenAt: null,
    sources: [liveUs(nowMs)],
  }));

  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "DATA_PENDING");
  assert.equal(snapshot.predictedOfficialOpenCents, null);
  assert.match(snapshot.warnings.join(" "), /no valid prediction was frozen/i);
});

test("a persisted context cannot be replayed into another target session", () => {
  const nowMs = Date.parse("2026-07-20T13:26:00Z");
  const snapshot = buildMooDecisionSnapshot(validInput({
    nowMs,
    frozenContext: persistedContext({
      targetSession: "2026-07-21",
      snapshotId: "frozen-2026-07-21-t5",
    }),
    lateOrderAcknowledged: true,
  }));

  assert.equal(snapshot.targetSession, "2026-07-20");
  assert.equal(snapshot.snapshotId, "fixture");
  assert.equal(snapshot.decision, "NO_TRADE");
  assert.equal(snapshot.blockReason, "DATA_PENDING");
  assert.equal(snapshot.predictedOfficialOpenCents, null);
  assert.equal(snapshot.majorThirdCents, null);
  assert.equal(snapshot.sources.length, 0);
  assert.match(snapshot.warnings.join(" "), /cannot be replayed/i);
});
