import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMooSystemStatus,
  MOO_STRICT_US_QUOTE_MAX_AGE_MS,
  MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
  readMooStreamHealth,
  readStrictUsSource,
} from "../app/moo-system-status.ts";

const brokerReference = {
  provider: "Alpaca Paper Trading API",
  environment: "paper",
  symbol: "NVDA",
  configured: true,
  assetStatus: "active",
  tradable: true,
  shortable: true,
  borrowStatus: "easy_to_borrow",
  borrowStatusSource: "easy_to_borrow",
  checkedAt: Date.parse("2026-07-20T13:00:00Z"),
  freshness: { state: "fresh", ageMs: 0, maxAgeMs: 60_000 },
  status: "live",
  detail: "Indicative asset metadata.",
  indicativeOnly: true,
  locateGuaranteed: false,
};

test("server commissioning status stays fail closed despite healthy broker metadata", () => {
  const status = buildMooSystemStatus({
    nowMs: Date.parse("2026-07-20T13:00:00Z"),
    targetSession: "2026-07-20",
    brokerReference,
  });

  assert.equal(status.decisionAuthority, "SERVER");
  assert.equal(status.executionMode, "NOT_COMMISSIONED");
  assert.equal(status.decisionSnapshot.decision, "NO_TRADE");
  assert.equal(status.artifactStoreState, "NOT_FOUND");
  assert.notEqual(status.decisionSnapshot.blockReason, "NONE");
  assert.deepEqual(status.decisionSnapshot.requiredSourceIds, ["US"]);
  assert.equal(status.brokerReference.shortable, true);
  assert.equal(status.brokerReference.locateGuaranteed, false);
  assert.ok(status.blockers.includes("ACCOUNT_LOCATE_NOT_AVAILABLE"));
});

test("artifact storage failures remain distinct from a missing frozen artifact", () => {
  const nowMs = Date.parse("2026-07-21T12:00:00Z");
  const unavailable = buildMooSystemStatus({
    nowMs,
    targetSession: "2026-07-21",
    brokerReference,
    artifactStoreState: "UNAVAILABLE",
  });
  assert.equal(unavailable.artifactStoreState, "UNAVAILABLE");
  assert.equal(unavailable.decisionArtifact, null);
  assert.equal(unavailable.commissioningEvidence.artifactValidated, false);

  const invalidClaim = buildMooSystemStatus({
    nowMs,
    targetSession: "2026-07-21",
    brokerReference,
    artifactStoreState: "FOUND",
  });
  assert.equal(invalidClaim.artifactStoreState, "UNAVAILABLE");
  assert.equal(invalidClaim.decisionArtifact, null);
});

test("source policy separates required, optional, and monitoring roles", () => {
  const status = buildMooSystemStatus({
    nowMs: Date.parse("2026-07-21T12:00:00Z"),
    targetSession: "2026-07-21",
    brokerReference,
  });

  assert.deepEqual(status.sourceRoles.filter((source) => source.role === "REQUIRED").map((source) => source.id), ["US"]);
  assert.deepEqual(status.sourceRoles.filter((source) => source.role === "OPTIONAL_RESEARCH").map((source) => source.id), ["NVD", "FX", "FUTURES"]);
  assert.deepEqual(status.sourceRoles.filter((source) => source.role === "POST_FREEZE_MONITORING").map((source) => source.id), ["NOII"]);
  assert.equal(status.transport.browser, "ADAPTIVE_REST_POLLING");
  assert.equal(status.transport.persistentUpstreamSupervisor, false);
  assert.equal(status.transport.stream.state, "UNAVAILABLE");
});

function streamDatabase(stream, source) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          return sql.includes("market_stream_ingest_streams") ? stream : source;
        },
      };
    },
  };
}

test("fresh contiguous D1 stream evidence enables the persistent supervisor indicator", async () => {
  const nowMs = Date.parse("2026-07-21T12:00:00Z");
  const health = await readMooStreamHealth(streamDatabase({
    stream_id: "nvda-iex", provider: "alpaca", feed: "iex", coverage_scope: "SINGLE_EXCHANGE",
    research_only_required: 1, execution_eligible_allowed: 0, service_sequence: 42, heartbeat_at: nowMs - 1_000,
  }, {
    state: "CURRENT", checked_at: nowMs - 1_100, available_at: nowMs - 1_200,
    connection_epoch: "nvda-iex:3", service_sequence: 42, detail_code: "STREAM_EVENT",
  }), nowMs);
  assert.equal(health.state, "LIVE");
  const status = buildMooSystemStatus({ nowMs, targetSession: "2026-07-21", brokerReference, streamHealth: health });
  assert.equal(status.transport.persistentUpstreamSupervisor, true);
  assert.equal(status.transport.noteCode, "DURABLE_STREAM_SERVICE_ENABLED");
  assert.equal(status.decisionSnapshot.sources.find((source) => source.id === "US").entitlement, "NOT_ENTITLED",
    "a live IEX transport cannot satisfy the strict SIP source");
});

test("missing, stale, future, or noncontiguous D1 evidence stays fail closed", async () => {
  const nowMs = Date.parse("2026-07-21T12:00:00Z");
  assert.equal((await readMooStreamHealth(undefined, nowMs)).state, "UNAVAILABLE");
  const stale = await readMooStreamHealth(streamDatabase({
    stream_id: "nvda-sip", provider: "alpaca", feed: "sip", coverage_scope: "CONSOLIDATED_SIP",
    research_only_required: 0, execution_eligible_allowed: 1, service_sequence: 9,
    heartbeat_at: nowMs - MOO_STREAM_HEARTBEAT_MAX_AGE_MS - 1,
  }, {
    state: "CURRENT", checked_at: nowMs - 50_001, available_at: nowMs - 50_002,
    service_sequence: 9, detail_code: "STREAM_EVENT",
  }), nowMs);
  assert.equal(stale.state, "STALE");
  assert.equal(buildMooSystemStatus({ nowMs, targetSession: "2026-07-21", brokerReference, streamHealth: stale })
    .transport.persistentUpstreamSupervisor, false);

  const gap = await readMooStreamHealth(streamDatabase({
    stream_id: "nvda-iex", provider: "alpaca", feed: "iex", coverage_scope: "SINGLE_EXCHANGE",
    research_only_required: 1, execution_eligible_allowed: 0, service_sequence: 10, heartbeat_at: nowMs,
  }, { state: "CURRENT", checked_at: nowMs, available_at: nowMs, service_sequence: 9 }), nowMs);
  assert.notEqual(gap.state, "LIVE");
});

test("runtime stream-health failures are distinct from an unconfigured service", async () => {
  const nowMs = Date.parse("2026-07-21T12:00:00Z");
  const database = { prepare() { throw new Error("D1 unavailable"); } };
  const health = await readMooStreamHealth(database, nowMs);
  const status = buildMooSystemStatus({ nowMs, targetSession: "2026-07-21", brokerReference, streamHealth: health });
  assert.equal(health.detailCode, "D1_STREAM_HEALTH_UNAVAILABLE");
  assert.equal(status.transport.noteCode, "DURABLE_STREAM_SERVICE_UNAVAILABLE");
});

test("a fresh exact-session SIP quote satisfies only the required market-data source", async () => {
  const nowMs = Date.parse("2026-07-21T13:24:00Z");
  const streamHealth = {
    state: "LIVE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:4",
    heartbeatAt: nowMs - 100, sourceAvailableAt: nowMs - 90, heartbeatAgeMs: 100, sourceLagMs: 90,
    maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000, detailCode: "STREAM_EVENT",
  };
  const observedAt = nowMs - 250;
  const source = await readStrictUsSource(streamDatabase(null, {
    provider: "alpaca", feed: "sip", session_date: "2026-07-21", kind: "QUOTE",
    qualification: "STRICT_EXECUTION", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP",
    price: 17_250, size: 10, provider_time: observedAt, received_at: observedAt + 10,
    processed_at: observedAt + 20, available_at: observedAt + 30,
    connection_epoch: "nvda-sip:4", service_sequence: 44,
  }), "2026-07-21", nowMs, streamHealth);

  assert.equal(source.state, "LIVE");
  assert.equal(source.validUntil, observedAt + MOO_STRICT_US_QUOTE_MAX_AGE_MS);
  const status = buildMooSystemStatus({
    nowMs, targetSession: "2026-07-21", brokerReference, streamHealth, strictUsSource: source,
  });
  assert.equal(status.decisionSnapshot.sources.find((item) => item.id === "US").state, "LIVE");
  assert.equal(status.blockers.includes("CONSOLIDATED_US_FEED_NOT_ENTITLED"), false);
  assert.equal(status.validUntil, status.evaluatedAt + 45_000);
  assert.equal(source.validUntil, observedAt + MOO_STRICT_US_QUOTE_MAX_AGE_MS);
  assert.ok(status.validUntil > source.validUntil);
  assert.equal(status.decisionSnapshot.decision, "NO_TRADE");
  assert.ok(status.blockers.includes("TRAINED_MODEL_NOT_PROMOTED"));
});

test("strict SIP quote readiness expires after the bounded transit window while transport stays healthy", async () => {
  const nowMs = Date.parse("2026-07-21T13:24:00Z");
  const streamHealth = {
    state: "LIVE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:4",
    heartbeatAt: nowMs, sourceAvailableAt: nowMs, heartbeatAgeMs: 0, sourceLagMs: 0,
    maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000, detailCode: "STREAM_EVENT",
  };
  const observedAt = nowMs - MOO_STRICT_US_QUOTE_MAX_AGE_MS - 1;
  const source = await readStrictUsSource(streamDatabase(null, {
    provider: "alpaca", feed: "sip", session_date: "2026-07-21", kind: "QUOTE",
    qualification: "STRICT_EXECUTION", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP",
    price: 17_250, size: 10, provider_time: observedAt, received_at: observedAt + 10,
    processed_at: observedAt + 20, available_at: observedAt + 30,
    connection_epoch: "nvda-sip:4", service_sequence: 44,
  }), "2026-07-21", nowMs, streamHealth);

  assert.equal(source.state, "DEGRADED");
  const status = buildMooSystemStatus({
    nowMs, targetSession: "2026-07-21", brokerReference, streamHealth, strictUsSource: source,
  });
  assert.ok(status.blockers.includes("CONSOLIDATED_US_QUOTE_NOT_CURRENT"));
  assert.equal(status.blockers.includes("CONSOLIDATED_US_FEED_NOT_ENTITLED"), false);
});

test("wrong-session or future SIP observations cannot populate the strict source", async () => {
  const nowMs = Date.parse("2026-07-21T13:24:00Z");
  const streamHealth = {
    state: "LIVE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:4",
    heartbeatAt: nowMs, sourceAvailableAt: nowMs, heartbeatAgeMs: 0, sourceLagMs: 0,
    maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000, detailCode: "STREAM_EVENT",
  };
  const source = await readStrictUsSource(streamDatabase(null, {
    provider: "alpaca", feed: "sip", session_date: "2026-07-22", kind: "QUOTE",
    qualification: "STRICT_EXECUTION", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP",
    price: 17_250, size: 10, provider_time: nowMs + 1, received_at: nowMs + 1,
    processed_at: nowMs + 1, available_at: nowMs + 1,
    connection_epoch: "nvda-sip:4", service_sequence: 44,
  }), "2026-07-21", nowMs, streamHealth);
  assert.equal(source.state, "UNAVAILABLE");
});

test("a quote from a prior connection epoch cannot satisfy the current strict source", async () => {
  const nowMs = Date.parse("2026-07-21T13:24:00Z");
  const streamHealth = {
    state: "LIVE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:5",
    heartbeatAt: nowMs, sourceAvailableAt: nowMs, heartbeatAgeMs: 0, sourceLagMs: 0,
    maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000, detailCode: "STREAM_EVENT",
  };
  const source = await readStrictUsSource(streamDatabase(null, {
    provider: "alpaca", feed: "sip", session_date: "2026-07-21", kind: "QUOTE",
    qualification: "STRICT_EXECUTION", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP",
    price: 17_250, size: 10, provider_time: nowMs - 100, received_at: nowMs - 90,
    processed_at: nowMs - 80, available_at: nowMs - 70,
    connection_epoch: "nvda-sip:4", service_sequence: 44,
  }), "2026-07-21", nowMs, streamHealth);
  assert.equal(source.state, "UNAVAILABLE");
});

test("calendar semantics classify weekends and completed early-close sessions as closed", async () => {
  const weekend = await readStrictUsSource(undefined, "2026-07-25", Date.parse("2026-07-25T15:00:00Z"));
  assert.equal(weekend.state, "CLOSED");
  assert.equal(weekend.reasonCode, "MARKET_IS_CLOSED");

  const afterEarlyClose = await readStrictUsSource(undefined, "2026-11-27", Date.parse("2026-11-27T18:00:01Z"));
  assert.equal(afterEarlyClose.state, "CLOSED");

  const beforeEarlyClose = await readStrictUsSource(undefined, "2026-11-27", Date.parse("2026-11-27T17:59:59Z"));
  assert.equal(beforeEarlyClose.state, "UNAVAILABLE");
});

test("a completed session keeps its last verified SIP observation as closed audit evidence", async () => {
  const nowMs = Date.parse("2026-07-21T21:00:00Z");
  const observedAt = Date.parse("2026-07-21T19:59:59Z");
  const source = await readStrictUsSource(streamDatabase(null, {
    provider: "alpaca", feed: "sip", session_date: "2026-07-21", kind: "QUOTE",
    qualification: "STRICT_EXECUTION", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP",
    price: 17_250, size: 10, provider_time: observedAt, received_at: observedAt + 10,
    processed_at: observedAt + 20, available_at: observedAt + 30,
    connection_epoch: "nvda-sip:3", service_sequence: 400,
  }), "2026-07-21", nowMs, {
    state: "STALE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:4", heartbeatAt: nowMs - 60_000, sourceAvailableAt: nowMs - 60_000,
    heartbeatAgeMs: 60_000, sourceLagMs: 60_000, maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000,
    detailCode: "MARKET_CLOSED",
  });
  assert.equal(source.state, "CLOSED");
  assert.equal(source.entitlement, "REALTIME");
  assert.equal(source.observedAt, observedAt);
  assert.equal(source.reasonCode, "MARKET_IS_CLOSED");
});

test("configured but unconfirmed SIP does not claim realtime entitlement", async () => {
  const nowMs = Date.parse("2026-07-21T13:24:00Z");
  const source = await readStrictUsSource(undefined, "2026-07-21", nowMs, {
    state: "STALE", streamId: "nvda-sip", provider: "alpaca", feed: "sip", coverageScope: "CONSOLIDATED_SIP",
    connectionEpoch: "nvda-sip:4", heartbeatAt: nowMs - 46_000, sourceAvailableAt: nowMs - 46_000,
    heartbeatAgeMs: 46_000, sourceLagMs: 46_000, maxHeartbeatAgeMs: 45_000, maxSourceLagMs: 45_000,
    detailCode: "STREAM_RECONNECTING",
  });
  assert.equal(source.state, "UNAVAILABLE");
  assert.equal(source.entitlement, "UNAVAILABLE");
  assert.equal(source.provider, "Alpaca SIP");
});

test("post-freeze uncommissioned evaluations retain the explicit unavailable source topology", () => {
  const nowMs = Date.parse("2026-07-21T14:00:00Z");
  const status = buildMooSystemStatus({ nowMs, targetSession: "2026-07-21", brokerReference });
  assert.equal(status.decisionSnapshot.sources.length, 5);
  assert.deepEqual(status.decisionSnapshot.requiredSourceIds, ["US"]);
  assert.equal(status.decisionSnapshot.decision, "NO_TRADE");
});

test("each commissioning evaluation has a distinct identity and bounded validity", () => {
  const first = buildMooSystemStatus({ nowMs: Date.parse("2026-07-21T12:00:00Z"), targetSession: "2026-07-21", brokerReference });
  const second = buildMooSystemStatus({ nowMs: Date.parse("2026-07-21T12:01:00Z"), targetSession: "2026-07-21", brokerReference });
  assert.notEqual(first.decisionSnapshot.snapshotId, second.decisionSnapshot.snapshotId);
  assert.notEqual(first.evaluatedAt, second.evaluatedAt);
  assert.equal(first.validUntil, first.evaluatedAt + 45_000);
});
