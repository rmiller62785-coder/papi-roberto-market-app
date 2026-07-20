import assert from "node:assert/strict";
import test from "node:test";

import { isMooSystemStatus } from "../app/moo-status-guard.ts";
import { buildMooSystemStatus } from "../app/moo-system-status.ts";

const TARGET = "2026-07-21";
const NOW = Date.parse("2026-07-20T16:00:00Z");

function status() {
  return buildMooSystemStatus({
    nowMs: NOW,
    targetSession: TARGET,
    brokerReference: {
      provider: "Alpaca Paper Trading API",
      environment: "paper",
      symbol: "NVDA",
      configured: false,
      assetStatus: null,
      tradable: null,
      shortable: null,
      borrowStatus: null,
      borrowStatusSource: "unavailable",
      checkedAt: NOW,
      freshness: { state: "unavailable", ageMs: null, maxAgeMs: 60_000 },
      status: "offline",
      detail: "Not configured",
      indicativeOnly: true,
      locateGuaranteed: false,
    },
  });
}

test("accepts the complete server-authored not-commissioned payload", () => {
  assert.equal(isMooSystemStatus(status(), TARGET), true);
});

test("rejects arbitrary execution modes and commissioning overclaims", () => {
  const mode = structuredClone(status());
  mode.executionMode = "LIVE";
  assert.equal(isMooSystemStatus(mode, TARGET), false);

  const evidence = structuredClone(status());
  evidence.commissioningEvidence.modelPromoted = true;
  assert.equal(isMooSystemStatus(evidence, TARGET), false);

  const actionable = structuredClone(status());
  actionable.decisionSnapshot.longTicket.actionable = true;
  assert.equal(isMooSystemStatus(actionable, TARGET), false);

  const favored = structuredClone(status());
  favored.decisionSnapshot.decision = "LONG_FAVORED";
  favored.decisionSnapshot.decisionReasonCode = "DIRECTIONAL_EDGE";
  favored.decisionSnapshot.blockReason = "NONE";
  favored.decisionSnapshot.modelVersion = "forged-model";
  favored.decisionSnapshot.featureSnapshotId = "forged-feature";
  favored.decisionSnapshot.featureSchemaVersion = "forged-schema";
  favored.decisionSnapshot.predictedOfficialOpenCents = 20_000;
  assert.equal(isMooSystemStatus(favored, TARGET), false);
});

test("rejects incomplete nested broker metadata before rendering", () => {
  const value = structuredClone(status());
  value.brokerReference = {};
  assert.equal(isMooSystemStatus(value, TARGET), false);
});

test("rejects malformed locate evidence before readiness validation", () => {
  const value = structuredClone(status());
  value.decisionSnapshot.shortLocateProof = {
    schemaVersion: "moo-locate-proof-v1",
    broker: "Example",
    accountAlias: 42,
    symbol: "NVDA",
    targetSession: TARGET,
    quantity: 10,
    locateId: "locate-1",
    availableAt: NOW,
    validUntil: NOW + 60_000,
    guaranteed: true,
    contentHash: `sha256:${"0".repeat(64)}`,
  };
  assert.equal(isMooSystemStatus(value, TARGET), false);

  const wrongSession = structuredClone(status());
  wrongSession.decisionSnapshot.shortLocateProof = {
    schemaVersion: "moo-locate-proof-v1",
    broker: "Example",
    accountAlias: "short-account",
    symbol: "NVDA",
    targetSession: "2026-07-22",
    quantity: 10,
    locateId: "locate-2",
    availableAt: NOW,
    validUntil: NOW + 60_000,
    guaranteed: true,
    contentHash: `sha256:${"0".repeat(64)}`,
  };
  assert.equal(isMooSystemStatus(wrongSession, TARGET), false);
});

test("rejects target mismatches and invalid transport enums", () => {
  assert.equal(isMooSystemStatus(status(), "2026-07-22"), false);
  const value = structuredClone(status());
  value.transport.noteCode = "CONNECTED";
  assert.equal(isMooSystemStatus(value, TARGET), false);
});

test("rejects malformed required-source topology and risk scalars", () => {
  const sources = structuredClone(status());
  sources.decisionSnapshot.requiredSourceIds = ["NOII"];
  assert.equal(isMooSystemStatus(sources, TARGET), false);

  const roles = structuredClone(status());
  roles.sourceRoles = [{ id: "NOII", role: "REQUIRED" }];
  assert.equal(isMooSystemStatus(roles, TARGET), false);

  const quantity = structuredClone(status());
  quantity.decisionSnapshot.longTicket.quantity = -3.5;
  quantity.decisionSnapshot.longTicket.maximumLossCents = -100;
  assert.equal(isMooSystemStatus(quantity, TARGET), false);
});

test("rejects a contradictory live SIP source inside a not-commissioned status", () => {
  const value = structuredClone(status());
  const source = value.decisionSnapshot.sources.find((item) => item.id === "US");
  Object.assign(source, {
    provider: "forged-sip",
    entitlement: "REALTIME",
    coverage: "CONSOLIDATED_SIP",
    observedAt: NOW - 100,
    checkedAt: NOW,
    ageMs: 100,
    receivedAt: NOW - 90,
    processedAt: NOW - 80,
    availableAt: NOW - 70,
    reasonCode: "VALUE_PRESENT",
    state: "LIVE",
  });
  assert.equal(isMooSystemStatus(value, TARGET), false);
});

test("transport boolean cannot disagree with server-owned stream evidence", () => {
  const value = structuredClone(status());
  value.transport.persistentUpstreamSupervisor = true;
  value.transport.noteCode = "DURABLE_STREAM_SERVICE_ENABLED";
  assert.equal(isMooSystemStatus(value, TARGET), false);

  const stale = structuredClone(status());
  stale.transport.stream = {
    state: "STALE",
    streamId: "nvda-iex",
    provider: "alpaca",
    feed: "iex",
    coverageScope: "SINGLE_EXCHANGE",
    heartbeatAt: NOW - 60_000,
    sourceAvailableAt: NOW - 60_000,
    heartbeatAgeMs: 60_000,
    sourceLagMs: 60_000,
    maxHeartbeatAgeMs: 45_000,
    maxSourceLagMs: 45_000,
    detailCode: "STREAM_EVIDENCE_STALE",
  };
  stale.transport.noteCode = "DURABLE_STREAM_SERVICE_STALE";
  assert.equal(isMooSystemStatus(stale, TARGET), true);
});
