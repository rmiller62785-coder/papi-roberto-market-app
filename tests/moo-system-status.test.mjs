import assert from "node:assert/strict";
import test from "node:test";

import { buildMooSystemStatus } from "../app/moo-system-status.ts";

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
});

test("each commissioning evaluation has a distinct identity and bounded validity", () => {
  const first = buildMooSystemStatus({ nowMs: Date.parse("2026-07-21T12:00:00Z"), targetSession: "2026-07-21", brokerReference });
  const second = buildMooSystemStatus({ nowMs: Date.parse("2026-07-21T12:01:00Z"), targetSession: "2026-07-21", brokerReference });
  assert.notEqual(first.decisionSnapshot.snapshotId, second.decisionSnapshot.snapshotId);
  assert.notEqual(first.evaluatedAt, second.evaluatedAt);
  assert.equal(first.validUntil, first.evaluatedAt + 45_000);
});
