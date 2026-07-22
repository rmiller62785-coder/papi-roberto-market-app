import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { marketValue, unavailableMarketValue } from "../app/market-contract.ts";
import { nasdaqSessionSchedule } from "../app/market-session.ts";
import { isSelectedMarketPayload, isUnavailableDecisionFreezeResponse, selectedSessionOpeningEstimate } from "../app/selected-market-research.ts";

const at = Date.parse("2026-07-21T13:20:00Z");

function value(number) {
  return marketValue({
    value: number,
    freshness: "LIVE",
    provenance: {
      sourceId: "selected",
      provider: "Selected provider",
      coverage: "research",
      sourceObservedAt: at - 1_000,
      receivedAt: at - 900,
      processedAt: at - 800,
      availableAt: at - 800,
      checkedAt: at - 800,
      persistedAt: null,
      ageMs: 800,
    },
  });
}

const pending = unavailableMarketValue({ availability: "NOT_STARTED", reasonCode: "NOT_STARTED" });

function contract(targetDate = "2026-07-21") {
  return {
    schemaVersion: "target-market-v1",
    symbol: "NVDA",
    targetDate,
    relation: "CURRENT",
    requestedAt: at,
    effectiveAsOf: at,
    view: "LATEST",
    schedule: { premarketOpenAt: at - 10_000, regularOpenAt: at + 600_000, regularCloseAt: at + 24_000_000, earlyClose: false },
    archive: { status: "UNAVAILABLE", latestPersistedAt: null, latestCompletedBarAt: null },
    quote: value(101),
    previousSession: { date: "2026-07-20", open: value(99), high: value(102), low: value(98), close: value(100), volume: value(1_000) },
    targetSession: {
      premarket: { high: value(102), low: value(100), current: value(101), volume: value(500) },
      regular: { open: pending, high: pending, low: pending, close: pending, volume: pending },
      firstMinute: { high: pending, low: pending, close: pending, volume: pending, complete: false },
    },
  };
}

test("selected research refuses a payload from another session", () => {
  const payload = { targetDate: "2026-07-20", daily: [] };
  assert.equal(selectedSessionOpeningEstimate(payload, contract()), null);
});

test("selected research is computed from the exact contract without main-dashboard fallback", () => {
  const result = selectedSessionOpeningEstimate({ targetDate: "2026-07-21" }, contract());
  assert.ok(result);
  assert.ok(result.median > 100 && result.median < 102);
  assert.ok(result.low < result.median && result.high > result.median);
});

test("target-day and later daily rows cannot contaminate a selected-session estimate", () => {
  const result = selectedSessionOpeningEstimate({
    targetDate: "2026-07-21",
    daily: [
      { date: "2026-07-18", open: 98, high: 101, low: 97, close: 100 },
      { date: "2026-07-21", open: 999, high: 1_100, low: 900, close: 1_000 },
      { date: "2026-07-22", open: 2_000, high: 2_100, low: 1_900, close: 2_000 },
    ],
  }, contract());
  assert.ok(result);
  assert.ok(result.median < 200);
});

function selectedPayload() {
  const marketContract = contract();
  marketContract.schedule = nasdaqSessionSchedule("2026-07-21");
  return {
    symbol: "NVDA",
    targetDate: "2026-07-21",
    session: "PREMARKET",
    source: "Selected provider",
    checkedAt: new Date(at).toISOString(),
    realtime: true,
    marketContract,
    daily: [{ date: "2026-07-20", dateKey: "2026-07-20", open: 99, high: 102, low: 98, close: 100 }],
    bars: [{ time: at - 120_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }],
    analysisBars: [{ time: at - 120_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }],
    firstMinuteHistory: [{ date: "2026-07-20", range: 1, volume: 100, close: 100 }],
  };
}

test("selected-market runtime guard accepts a coherent exact-session response", () => {
  assert.equal(isSelectedMarketPayload(selectedPayload(), "2026-07-21"), true);
});

function unavailableFreezeResponse() {
  const marketContract = selectedPayload().marketContract;
  const schedule = nasdaqSessionSchedule("2026-07-21");
  const missing = () => unavailableMarketValue({
    availability: "MISSING",
    freshness: "FROZEN",
    reasonCode: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE",
  });
  marketContract.view = "DECISION_FREEZE";
  marketContract.requestedAt = schedule.decisionFreezeAt + 60_000;
  marketContract.effectiveAsOf = schedule.decisionFreezeAt;
  marketContract.archive = { status: "UNAVAILABLE", latestPersistedAt: null, latestCompletedBarAt: null };
  marketContract.quote = missing();
  for (const key of ["open", "high", "low", "close", "volume"]) marketContract.previousSession[key] = missing();
  for (const key of ["high", "low", "current", "volume"]) marketContract.targetSession.premarket[key] = missing();
  for (const key of ["open", "high", "low", "close", "volume"]) marketContract.targetSession.regular[key] = missing();
  for (const key of ["high", "low", "close", "volume"]) marketContract.targetSession.firstMinute[key] = missing();
  marketContract.targetSession.firstMinute.complete = false;
  return { error: "DECISION_FREEZE_ARCHIVE_UNAVAILABLE", targetDate: "2026-07-21", marketContract };
}

test("freeze-unavailable guard accepts only a complete fail-closed cutoff envelope", () => {
  const valid = unavailableFreezeResponse();
  assert.equal(isUnavailableDecisionFreezeResponse(valid, "2026-07-21"), true);

  const wrongTarget = structuredClone(valid);
  wrongTarget.targetDate = "2026-07-22";
  assert.equal(isUnavailableDecisionFreezeResponse(wrongTarget, "2026-07-21"), false);

  const leakedValue = structuredClone(valid);
  leakedValue.marketContract.quote = value(101);
  assert.equal(isUnavailableDecisionFreezeResponse(leakedValue, "2026-07-21"), false);

  const wrongArchiveState = structuredClone(valid);
  wrongArchiveState.marketContract.archive.status = "EMPTY";
  assert.equal(isUnavailableDecisionFreezeResponse(wrongArchiveState, "2026-07-21"), false);
});

test("selected-market runtime guard rejects malformed rows and unfinished or cross-session bars", () => {
  const nullRow = structuredClone(selectedPayload());
  nullRow.daily = [null];
  assert.equal(isSelectedMarketPayload(nullRow, "2026-07-21"), false);

  const unfinished = structuredClone(selectedPayload());
  unfinished.analysisBars[0].time = at - 30_000;
  assert.equal(isSelectedMarketPayload(unfinished, "2026-07-21"), false);

  const crossSession = structuredClone(selectedPayload());
  crossSession.analysisBars[0].time = nasdaqSessionSchedule("2026-07-21").premarketOpenAt - 60_000;
  assert.equal(isSelectedMarketPayload(crossSession, "2026-07-21"), false);
});

test("selected-market runtime guard rejects contradictory value state and availability chronology", () => {
  const unavailableWithValue = structuredClone(selectedPayload());
  unavailableWithValue.marketContract.quote.availability = "MISSING";
  unavailableWithValue.marketContract.quote.reasonCode = "MISSING";
  assert.equal(isSelectedMarketPayload(unavailableWithValue, "2026-07-21"), false);

  const postAsOf = structuredClone(selectedPayload());
  postAsOf.marketContract.quote.provenance.availableAt = at + 1;
  assert.equal(isSelectedMarketPayload(postAsOf, "2026-07-21"), false);

  const wrongPrior = structuredClone(selectedPayload());
  wrongPrior.marketContract.previousSession.date = "2026-07-17";
  assert.equal(isSelectedMarketPayload(wrongPrior, "2026-07-21"), false);
});

test("selected-market runtime guard rejects malformed UI aliases before React rendering", () => {
  const objectSource = structuredClone(selectedPayload());
  objectSource.source = { label: "untrusted object" };
  assert.equal(isSelectedMarketPayload(objectSource, "2026-07-21"), false);

  const malformedCases = [
    ["session", { state: "CLOSED" }],
    ["checkedAt", { iso: new Date(at).toISOString() }],
    ["checkedAt", "not-a-date"],
    ["realtime", "true"],
  ];
  for (const [key, replacement] of malformedCases) {
    const candidate = structuredClone(selectedPayload());
    candidate[key] = replacement;
    assert.equal(isSelectedMarketPayload(candidate, "2026-07-21"), false, `${key} must be runtime validated`);
  }

  const guardedSource = isSelectedMarketPayload(objectSource, "2026-07-21")
    ? objectSource.source
    : "Market data API";
  assert.equal(renderToStaticMarkup(createElement("span", null, guardedSource)), "<span>Market data API</span>");
});

test("selected-market runtime guard validates optional display and freshness aliases", () => {
  const valid = selectedPayload();
  valid.displaySession = {
    date: "2026-07-21",
    relation: "target_session",
    provider: "aperture_durable_stream+yahoo_minute",
    barCount: 1,
    latestObservedAt: new Date(at - 60_000).toISOString(),
  };
  valid.freshness = {
    quote: {
      provider: "aperture_stream",
      observedAt: new Date(at - 1_000).toISOString(),
      fetchedAt: new Date(at - 900).toISOString(),
      ageMs: 1_000,
      stale: false,
      marketClosed: false,
      state: "current",
      currentForSession: true,
      futureSkew: false,
    },
    history: {
      dailyProvider: "alpaca_sip",
      latestMinuteObservedAt: new Date(at - 60_000).toISOString(),
      latestDailyObservedAt: new Date(at - 86_400_000).toISOString(),
      dailyError: null,
      minuteError: null,
    },
  };
  assert.equal(isSelectedMarketPayload(valid, "2026-07-21"), true);

  for (const mutate of [
    (candidate) => { candidate.displaySession.provider = { id: "provider" }; },
    (candidate) => { candidate.displaySession.barCount = -1; },
    (candidate) => { candidate.freshness.quote.provider = { id: "provider" }; },
    (candidate) => { candidate.freshness.quote.stale = "false"; },
    (candidate) => { candidate.freshness.history.latestMinuteObservedAt = {}; },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.equal(isSelectedMarketPayload(candidate, "2026-07-21"), false);
  }
});
