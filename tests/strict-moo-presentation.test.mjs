import assert from "node:assert/strict";
import test from "node:test";

import { deriveStrictMooPresentation } from "../app/strict-moo-presentation.ts";
import { buildMooSystemStatus } from "../app/moo-system-status.ts";

const TARGET = "2026-07-21";
const PREMARKET = Date.parse("2026-07-21T12:00:00Z");

function broker(checkedAt) {
  return {
    provider: "Alpaca Paper Trading API",
    environment: "paper",
    symbol: "NVDA",
    configured: true,
    assetStatus: "active",
    tradable: true,
    shortable: true,
    borrowStatus: "easy_to_borrow",
    borrowStatusSource: "easy_to_borrow",
    checkedAt,
    freshness: { state: "fresh", ageMs: 0, maxAgeMs: 60_000 },
    status: "live",
    detail: "Indicative asset reference",
    indicativeOnly: true,
    locateGuaranteed: false,
  };
}

function liveEvidence(nowMs = PREMARKET) {
  const observedAt = nowMs - 100;
  return {
    streamHealth: {
      state: "LIVE",
      streamId: "nvda-sip",
      provider: "alpaca",
      feed: "sip",
      coverageScope: "CONSOLIDATED_SIP",
      connectionEpoch: "nvda-sip:7",
      heartbeatAt: nowMs - 50,
      sourceAvailableAt: nowMs - 40,
      heartbeatAgeMs: 50,
      sourceLagMs: 40,
      maxHeartbeatAgeMs: 45_000,
      maxSourceLagMs: 45_000,
      detailCode: "STREAM_EVENT",
    },
    strictUsSource: {
      id: "US",
      label: "U.S. NVDA execution quote",
      venue: "U.S. consolidated SIP",
      provider: "Alpaca SIP",
      entitlement: "REALTIME",
      coverage: "CONSOLIDATED_SIP",
      observedAt,
      checkedAt: nowMs,
      ageMs: 100,
      state: "LIVE",
      receivedAt: observedAt + 10,
      processedAt: observedAt + 20,
      availableAt: observedAt + 30,
      validUntil: observedAt + 2_000,
      reasonCode: "VALUE_PRESENT",
    },
  };
}

function status(nowMs = PREMARKET, targetSession = TARGET, evidence = {}) {
  return buildMooSystemStatus({
    nowMs,
    targetSession,
    brokerReference: broker(nowMs),
    ...evidence,
  });
}

function presentation(value, overrides = {}) {
  return deriveStrictMooPresentation({
    snapshot: value.decisionSnapshot,
    transport: value.transport,
    commissioning: { executionMode: value.executionMode, ...value.commissioningEvidence },
    nowMs: value.evaluatedAt,
    ...overrides,
  });
}

test("live SIP and live supervisor complete only the source stage under v2", () => {
  const value = status(PREMARKET, TARGET, liveEvidence());
  const view = presentation(value);
  assert.equal(view.streamState, "live");
  assert.equal(view.quoteState, "live");
  assert.equal(view.sourceStageState, "live");
  assert.equal(view.stages.find((stage) => stage.id === "source")?.state, "live");
  assert.equal(view.stages.find((stage) => stage.id === "model")?.state, "unavailable");
  assert.equal(view.stages.find((stage) => stage.id === "freeze")?.state, "not_applicable");
  assert.equal(view.currentStage, "model");
});

test("a stale strict quote does not make a healthy permanent stream look disconnected", () => {
  const evidence = liveEvidence();
  evidence.strictUsSource = {
    ...evidence.strictUsSource,
    observedAt: PREMARKET - 3_000,
    receivedAt: PREMARKET - 2_990,
    processedAt: PREMARKET - 2_980,
    availableAt: PREMARKET - 2_970,
    validUntil: PREMARKET - 1_000,
    ageMs: 3_000,
    state: "DEGRADED",
    reasonCode: "SOURCE_STALE",
  };
  const value = status(PREMARKET, TARGET, evidence);
  const view = presentation(value);
  assert.equal(view.streamState, "live");
  assert.equal(view.quoteState, "stale");
  assert.equal(view.sourceStageState, "stale");
});

test("future sessions are pending rather than unavailable", () => {
  const nowMs = Date.parse("2026-07-20T16:00:00Z");
  const value = status(nowMs, TARGET);
  const view = presentation(value);
  assert.equal(value.decisionSnapshot.lifecycle, "FUTURE_SESSION");
  assert.equal(view.quoteState, "pending");
  assert.equal(view.sourceStageState, "pending");
});

test("scheduled closure is neutral and does not masquerade as a feed outage", () => {
  const nowMs = Date.parse("2026-07-22T00:00:00Z");
  const value = status(nowMs, TARGET);
  const view = presentation(value);
  assert.equal(value.decisionSnapshot.sources.find((source) => source.id === "US")?.state, "CLOSED");
  assert.equal(view.quoteState, "closed");
  assert.equal(view.sourceStageState, "closed");
});

test("an expired or failed browser status demotes otherwise-live evidence", () => {
  const value = status(PREMARKET, TARGET, liveEvidence());
  const view = presentation(value, { statusUnavailable: true });
  assert.equal(view.browserState, "unavailable");
  assert.equal(view.streamState, "unavailable");
  assert.equal(view.quoteState, "unavailable");
  assert.equal(view.sourceStageState, "unavailable");
  assert.equal(view.ticketReady, false);
  assert.equal(view.fillAuditReady, false);
});

test("promoted model evidence remains ready when the current source later becomes stale", () => {
  const evidence = liveEvidence();
  evidence.strictUsSource = {
    ...evidence.strictUsSource,
    state: "DEGRADED",
    reasonCode: "SOURCE_STALE",
    observedAt: PREMARKET - 3_000,
    ageMs: 3_000,
    validUntil: PREMARKET - 1_000,
  };
  const value = status(PREMARKET, TARGET, evidence);
  const snapshot = {
    ...value.decisionSnapshot,
    modelVersion: "moo-open-v1",
    featureSchemaVersion: "moo-features-v1",
  };
  const view = deriveStrictMooPresentation({
    snapshot,
    transport: value.transport,
    commissioning: {
      executionMode: "NOT_COMMISSIONED",
      modelPromoted: true,
      artifactValidated: false,
      riskPolicyVersion: null,
    },
    nowMs: value.evaluatedAt,
  });

  assert.equal(view.sourceStageState, "stale");
  assert.equal(view.modelReady, true);
  assert.equal(view.stages.find((stage) => stage.id === "model")?.state, "live");
  assert.equal(view.stages.find((stage) => stage.id === "freeze")?.state, "pending");
});

test("a validated artifact survives current transport degradation but cannot unlock an uncommissioned ticket", () => {
  const value = status(PREMARKET, TARGET, liveEvidence());
  const snapshot = {
    ...value.decisionSnapshot,
    frozenAt: PREMARKET - 1_000,
    modelVersion: "moo-open-v1",
    featureSchemaVersion: "moo-features-v1",
    decision: "NO_TRADE",
    decisionReasonCode: "NO_EDGE",
  };
  const commissioning = {
    executionMode: "NOT_COMMISSIONED",
    modelPromoted: true,
    artifactValidated: true,
    riskPolicyVersion: "risk-v1",
  };
  const view = deriveStrictMooPresentation({
    snapshot,
    transport: {
      ...value.transport,
      noteCode: "DURABLE_STREAM_SERVICE_STALE",
      stream: { ...value.transport.stream, state: "STALE" },
    },
    commissioning,
    nowMs: value.evaluatedAt,
  });

  assert.equal(view.sourceStageState, "stale");
  assert.equal(view.stages.find((stage) => stage.id === "model")?.state, "live");
  assert.equal(view.stages.find((stage) => stage.id === "freeze")?.state, "live");
  assert.equal(view.stages.find((stage) => stage.id === "ticket")?.state, "unavailable");
  assert.equal(view.ticketReady, false);
  assert.equal(view.currentStage, "ticket");

  const authorized = deriveStrictMooPresentation({
    snapshot,
    transport: value.transport,
    commissioning: { ...commissioning, executionMode: "PAPER_COMMISSIONED" },
    nowMs: value.evaluatedAt,
  });
  assert.equal(authorized.ticketReady, true);
  assert.equal(authorized.stages.find((stage) => stage.id === "ticket")?.state, "live");
});
