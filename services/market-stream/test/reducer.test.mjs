import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAlpacaMessages } from "../src/ingestor.ts";
import {
  advanceMarketWatermark,
  beginConnectionEpoch,
  initialMarketStreamState,
  reconcileRecoveredSessionIntegrity,
  reduceProviderEvent,
  setProviderConnectionState,
} from "../src/reducer.ts";

const base = Date.parse("2026-07-20T13:20:00Z");

function one(message, receivedAt = base + 61_000, processedAt = receivedAt + 1, feed = "iex") {
  const result = normalizeAlpacaMessages(JSON.stringify([message]), { feed, receivedAt, processedAt });
  assert.equal(result.length, 1);
  return result[0];
}

function trade(id, timestamp, price = 200) {
  return one({ T: "t", S: "NVDA", i: id, x: "Q", p: price, s: 10, c: ["@"], t: timestamp, z: "C" });
}

function quote(timestamp, bid, ask, receivedAt = base + 61_000) {
  return one({ T: "q", S: "NVDA", bx: "Q", bp: bid, bs: 2, ax: "P", ap: ask, as: 3, c: ["R"], t: timestamp, z: "C" }, receivedAt);
}

function bar(type = "b", close = 200.5, receivedAt = base + 61_000) {
  return one({ T: type, S: "NVDA", o: 200, h: 201, l: 199, c: close, v: type === "u" ? 1010 : 1000, n: type === "u" ? 21 : 20, vw: 200.2, t: "2026-07-20T13:20:00Z" }, receivedAt);
}

test("connection transitions share one monotonic service sequence without duplicate LIVE emissions", () => {
  const initial = initialMarketStreamState("iex", "stream-1");
  const connected = beginConnectionEpoch(initial, base);
  assert.equal(connected.state.connectionEpoch, 1);
  assert.equal(connected.emissions[0].serviceSequence, 1);
  const live = setProviderConnectionState(connected.state, "LIVE", base + 1);
  assert.equal(live.emissions[0].serviceSequence, 2);
  const duplicate = setProviderConnectionState(live.state, "LIVE", base + 2);
  assert.equal(duplicate.emissions.length, 0);
  assert.equal(duplicate.state.serviceSequence, 2);
});

test("accepted out-of-order observations never regress latest quote or trade", () => {
  let state = initialMarketStreamState("iex", "stream-1");
  state = reduceProviderEvent(state, trade(1, "2026-07-20T13:20:02.000000001Z", 201)).state;
  state = reduceProviderEvent(state, trade(2, "2026-07-20T13:20:01.000000001Z", 199)).state;
  assert.equal(state.latestTrade.priceCents, 20_100);
  state = reduceProviderEvent(state, quote("2026-07-20T13:20:02.000000001Z", 200, 201)).state;
  state = reduceProviderEvent(state, quote("2026-07-20T13:20:01.000000001Z", 190, 191)).state;
  assert.equal(state.latestQuote.bidCents, 20_000);
  assert.equal(state.serviceSequence, 4);
});

test("authoritative bars remain pending until watermark and updated bars create versions", () => {
  let state = initialMarketStreamState("iex", "stream-1");
  const first = reduceProviderEvent(state, bar());
  assert.equal(first.disposition, "ACCEPTED");
  assert.equal(first.state.pendingMinutes[0].status, "PENDING");
  assert.equal(first.state.pendingMinutes[0].sourceTransport, "WEBSOCKET");
  assert.equal(first.emissions[0].type, "EVENT");
  const early = advanceMarketWatermark(first.state, base + 60_000 + 34_999);
  assert.equal(early.emissions.length, 0);
  const completed = advanceMarketWatermark(first.state, base + 60_000 + 35_000);
  assert.equal(completed.emissions[0].type, "MINUTE_COMPLETED");
  assert.equal(completed.state.latestCompletedMinute.status, "FINAL");
  assert.equal(completed.state.pendingMinutes.length, 0);

  const update = bar("u", 200.75, base + 95_100);
  const corrected = reduceProviderEvent(completed.state, update, { existingMinute: completed.state.latestCompletedMinute });
  assert.equal(corrected.emissions[0].type, "MINUTE_CORRECTED");
  assert.equal(corrected.emissions[0].minute.revision, 3);
  assert.equal(corrected.emissions[0].minute.closeCents, 20_075);
  assert.equal(corrected.emissions[0].minute.status, "CORRECTED");
});

test("duplicates and future-skewed observations fail closed", () => {
  const event = trade(1, "2026-07-20T13:20:01.000000001Z");
  const accepted = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), event);
  assert.equal(reduceProviderEvent(accepted.state, event).disposition, "DUPLICATE");
  const future = { ...event, eventKey: `${event.eventKey}:future`, sourceObservedAt: event.receivedAt + 2_001,
    sourceTimestamp: { ...event.sourceTimestamp, epochMs: event.receivedAt + 2_001, epochNanos: `${BigInt(event.receivedAt + 2_001) * 1_000_000n}` } };
  assert.equal(reduceProviderEvent(accepted.state, future).disposition, "FUTURE_SKEW");
});

test("IEX remains explicitly research-only and trades are not used to invent official bars", () => {
  const accepted = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), trade(1, "2026-07-20T13:20:01.000000001Z"));
  assert.equal(accepted.state.coverage.researchOnly, true);
  assert.equal(accepted.state.coverage.executionEligible, false);
  assert.equal(accepted.state.pendingMinutes.length, 0);
  assert.equal(accepted.emissions[0].minute, null);
});

test("bar revisions reject regressive base bars and lower cumulative updates", () => {
  let state = initialMarketStreamState("iex", "stream-1");
  const newest = reduceProviderEvent(state, bar("u", 200.75, base + 95_100));
  assert.equal(newest.disposition, "ACCEPTED");
  const staleBase = reduceProviderEvent(newest.state, bar("b", 200.5, base + 95_200));
  assert.equal(staleBase.disposition, "STALE_REVISION");
  assert.equal(staleBase.state.pendingMinutes[0].closeCents, 20_075);
  const lowerUpdate = one({ T: "u", S: "NVDA", o: 200, h: 201, l: 199, c: 200.6, v: 1005, n: 20, vw: 200.2, t: "2026-07-20T13:20:00Z" }, base + 95_300);
  assert.equal(reduceProviderEvent(newest.state, lowerUpdate).disposition, "STALE_REVISION");
});

test("corrections and cancels degrade bar integrity until an authoritative recovered minute reconciles", () => {
  let state = initialMarketStreamState("iex", "stream-1");
  state = reduceProviderEvent(state, trade(11, "2026-07-20T13:20:01.000000001Z")).state;
  state = reduceProviderEvent(state, bar()).state;
  const correction = one({ T: "c", S: "NVDA", x: "Q", oi: 11, op: 200, os: 10, oc: ["@"], ci: 12, cp: 200.1, cs: 10, cc: ["@"], t: "2026-07-20T13:20:30.000000001Z", z: "C" });
  const degraded = reduceProviderEvent(state, correction, { affectedMinuteStart: base });
  assert.equal(degraded.state.providerState, "DEGRADED");
  assert.equal(degraded.state.barIntegrity.reason, "CORRECTION");
  assert.equal(degraded.state.latestTrade, null);
  assert.equal(advanceMarketWatermark(degraded.state, base + 95_000).emissions.length, 0);

  const canonical = one({ T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 999, n: 19, vw: 200.2, t: "2026-07-20T13:20:00Z" }, base + 96_000);
  canonical.transport = "REST_RECOVERY";
  const reconciled = reduceProviderEvent(degraded.state, canonical);
  assert.equal(reconciled.disposition, "ACCEPTED");
  assert.equal(reconciled.state.barIntegrity.state, "CLEAR");
  assert.equal(reconciled.state.pendingMinutes[0].revision, 2);
  assert.equal(reconciled.state.pendingMinutes[0].volume, 999);
  assert.equal(reconciled.state.pendingMinutes[0].sourceTransport, "REST_RECOVERY");
  assert.equal(reconciled.state.providerState, "DEGRADED");
  const live = setProviderConnectionState(reconciled.state, "LIVE", base + 96_001);
  assert.equal(live.state.providerState, "LIVE");
  assert.equal(advanceMarketWatermark(live.state, base + 96_002).emissions[0].type, "MINUTE_COMPLETED");
});

test("an unresolvable cancel globally blocks minute finalization", () => {
  let state = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), bar()).state;
  const cancel = one({ T: "x", S: "NVDA", i: 999, x: "Q", p: 200, s: 1, a: "C", t: "2026-07-20T13:20:31.000000001Z", z: "C" });
  state = reduceProviderEvent(state, cancel, { affectedMinuteStart: null }).state;
  assert.equal(state.barIntegrity.state, "DEGRADED");
  assert.deepEqual(state.barIntegrity.affectedMinuteStarts, []);
  assert.equal(advanceMarketWatermark(state, base + 100_000).emissions.length, 0);
  const reconciled = reconcileRecoveredSessionIntegrity(state, base + 101_000);
  assert.equal(reconciled.state.barIntegrity.state, "CLEAR");
  assert.equal(reconciled.emissions[0].delta.barIntegrity.state, "CLEAR");
});
