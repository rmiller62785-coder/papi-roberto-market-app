import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMooSystemStatus,
  MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
  readMooStreamHealth,
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
  assert.notEqual(status.decisionSnapshot.blockReason, "NONE");
  assert.deepEqual(status.decisionSnapshot.requiredSourceIds, ["US"]);
  assert.equal(status.brokerReference.shortable, true);
  assert.equal(status.brokerReference.locateGuaranteed, false);
  assert.ok(status.blockers.includes("ACCOUNT_LOCATE_NOT_AVAILABLE"));
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
    service_sequence: 42, detail_code: "STREAM_EVENT",
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
