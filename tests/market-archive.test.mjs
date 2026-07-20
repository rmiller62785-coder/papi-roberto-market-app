import assert from "node:assert/strict";
import test from "node:test";

import { frozenEnvelopeFromArchive } from "../app/market-archive.ts";
import { marketValue, unavailableMarketValue } from "../app/market-contract.ts";

const cutoff = Date.parse("2026-07-20T13:24:30Z");

function available(value, observedAt = cutoff - 30_000) {
  return marketValue({
    value,
    freshness: "LIVE",
    provenance: {
      sourceId: "alpaca_iex",
      provider: "Alpaca IEX",
      coverage: "single exchange",
      sourceObservedAt: observedAt,
      receivedAt: observedAt + 100,
      processedAt: observedAt + 200,
      availableAt: observedAt + 200,
      checkedAt: observedAt + 200,
      persistedAt: null,
      ageMs: 200,
    },
  });
}

function missing(reasonCode) {
  return unavailableMarketValue({ availability: "NOT_STARTED", reasonCode, freshness: "MARKET_CLOSED" });
}

function fixture() {
  const number = available(202.81);
  const unavailable = missing("NOT_STARTED");
  const envelope = {
    schemaVersion: "target-market-v1",
    symbol: "NVDA",
    targetDate: "2026-07-20",
    relation: "CURRENT",
    requestedAt: cutoff - 10_000,
    effectiveAsOf: cutoff - 10_000,
    view: "LATEST",
    schedule: {
      premarketOpenAt: Date.parse("2026-07-20T08:00:00Z"),
      regularOpenAt: Date.parse("2026-07-20T13:30:00Z"),
      regularCloseAt: Date.parse("2026-07-20T20:00:00Z"),
      earlyClose: false,
    },
    archive: { status: "UNAVAILABLE", latestPersistedAt: null, latestCompletedBarAt: null },
    quote: number,
    previousSession: { date: "2026-07-17", open: number, high: number, low: number, close: number, volume: available(1_000) },
    targetSession: {
      premarket: { high: number, low: number, current: number, volume: available(2_000) },
      regular: { open: unavailable, high: unavailable, low: unavailable, close: unavailable, volume: unavailable },
      firstMinute: { high: unavailable, low: unavailable, close: unavailable, volume: unavailable, complete: false },
    },
  };
  return {
    id: "snapshot:test",
    targetDate: "2026-07-20",
    checkpoint: "T-5M",
    provider: "aperture",
    feed: "normalized",
    symbol: "NVDA",
    capturedAt: cutoff - 5_000,
    sourceWatermarkAt: cutoff - 30_000,
    receivedAt: cutoff - 5_000,
    processedAt: cutoff - 5_000,
    availableAt: cutoff - 5_000,
    qualityState: "RESEARCH_ONLY",
    payload: {
      envelope,
      completedAnalysisBars: [{ time: cutoff - 90_000 }],
    },
    payloadHash: "fixture-hash",
    createdAt: cutoff - 5_000,
  };
}

test("an archived checkpoint is relabeled frozen and bound to its persisted time", () => {
  const result = frozenEnvelopeFromArchive({
    snapshot: fixture(),
    targetDate: "2026-07-20",
    requestedAt: cutoff + 60_000,
    cutoff,
  });
  assert.ok(result);
  assert.equal(result.view, "DECISION_FREEZE");
  assert.equal(result.quote.freshness, "FROZEN");
  assert.equal(result.quote.provenance.persistedAt, cutoff - 5_000);
  assert.equal(result.archive.status, "CURRENT");
  assert.equal(result.archive.latestCompletedBarAt, cutoff - 30_000);
});

test("an earlier valid checkpoint remains visible but is explicitly stale", () => {
  const snapshot = fixture();
  snapshot.checkpoint = "T-30M";
  const result = frozenEnvelopeFromArchive({ snapshot, targetDate: "2026-07-20", requestedAt: cutoff + 60_000, cutoff });
  assert.ok(result);
  assert.equal(result.archive.status, "STALE");
  assert.equal(result.quote.freshness, "FROZEN");
});

test("an archived value first available after the cutoff invalidates the artifact", () => {
  const snapshot = fixture();
  snapshot.payload.envelope.quote = available(204, cutoff + 1_000);
  assert.equal(frozenEnvelopeFromArchive({
    snapshot,
    targetDate: "2026-07-20",
    requestedAt: cutoff + 60_000,
    cutoff,
  }), null);
});

test("cross-session and post-cutoff snapshots fail closed", () => {
  const snapshot = fixture();
  assert.equal(frozenEnvelopeFromArchive({ snapshot, targetDate: "2026-07-21", requestedAt: cutoff, cutoff }), null);
  snapshot.availableAt = cutoff + 1;
  assert.equal(frozenEnvelopeFromArchive({ snapshot, targetDate: "2026-07-20", requestedAt: cutoff, cutoff }), null);
});
