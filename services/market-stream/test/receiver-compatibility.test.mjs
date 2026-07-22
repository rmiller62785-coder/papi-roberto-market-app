import assert from "node:assert/strict";
import test from "node:test";

import { parseIngestionBatch } from "../../../app/market-stream-receiver.ts";
import { normalizeAlpacaMessages } from "../src/ingestor.ts";
import { advanceMarketWatermark, initialMarketStreamState, reduceProviderEvent, setProviderConnectionState } from "../src/reducer.ts";

const at = Date.parse("2026-07-20T13:20:01Z");
const frame = JSON.stringify([{ T: "t", S: "NVDA", i: 7, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:00.000000001Z", z: "C" }]);

function batch(providerEntitlementConfirmed) {
  const [event] = normalizeAlpacaMessages(frame, {
    feed: "sip", receivedAt: at, processedAt: at + 1, providerEntitlementConfirmed,
  });
  const accepted = reduceProviderEvent(initialMarketStreamState("sip", "stream-1"), event);
  return {
    schemaVersion: "aperture-market-stream-v2",
    streamId: "stream-1",
    fromSequence: 1,
    toSequence: 1,
    emissions: accepted.emissions,
  };
}

test("Sites receiver accepts both fail-closed and provider-confirmed coherent SIP tuples", () => {
  const unconfirmed = parseIngestionBatch(batch(false));
  assert.deepEqual([unconfirmed.emissions[0].coverage.researchOnly, unconfirmed.emissions[0].coverage.executionEligible], [true, false]);
  const confirmed = parseIngestionBatch(batch(true));
  assert.deepEqual([confirmed.emissions[0].coverage.researchOnly, confirmed.emissions[0].coverage.executionEligible], [false, true]);
});

test("Sites receiver rejects incoherent SIP execution promotion", () => {
  const value = structuredClone(batch(false));
  value.emissions[0].coverage.executionEligible = true;
  assert.throws(() => parseIngestionBatch(value), /INGESTION_EMISSION_INVALID/);
});

test("Sites receiver rejects REST recovery events carrying execution-eligible coverage", () => {
  const value = structuredClone(batch(true));
  value.emissions[0].sourceEvent.transport = "REST_RECOVERY";
  assert.throws(() => parseIngestionBatch(value), /INGESTION_EMISSION_INVALID/);
});

test("live SIP state retains research-only coverage on REST recovery emissions", () => {
  const live = setProviderConnectionState(initialMarketStreamState("sip", "stream-1"), "LIVE", at - 10);
  const [recovery] = normalizeAlpacaMessages(frame, {
    feed: "sip", receivedAt: at, processedAt: at + 1,
    transport: "REST_RECOVERY", providerEntitlementConfirmed: false,
  });
  const recovered = reduceProviderEvent(live.state, recovery);
  assert.equal(recovered.state.coverage.executionEligible, true, "live stream state remains provider-confirmed");
  assert.equal(recovered.emissions[0].coverage.executionEligible, false, "REST event keeps its own provenance");
  const parsed = parseIngestionBatch({
    schemaVersion: "aperture-market-stream-v2", streamId: "stream-1", fromSequence: 1, toSequence: 2,
    emissions: [...live.emissions, ...recovered.emissions],
  });
  assert.equal(parsed.emissions[1].sourceEvent.transport, "REST_RECOVERY");
  assert.equal(parsed.emissions[1].coverage.executionEligible, false);
});

test("Sites receiver accepts pending, finalized, and corrected immutable minute revisions", () => {
  const [bar] = normalizeAlpacaMessages(JSON.stringify([{ T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 1000, n: 20, vw: 200.2, t: "2026-07-20T13:20:00Z" }]),
    { feed: "iex", receivedAt: Date.parse("2026-07-20T13:21:01Z"), processedAt: Date.parse("2026-07-20T13:21:01.001Z") });
  const pending = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), bar);
  const final = advanceMarketWatermark(pending.state, Date.parse("2026-07-20T13:21:35Z"));
  const [update] = normalizeAlpacaMessages(JSON.stringify([{ T: "u", S: "NVDA", o: 200, h: 201.1, l: 199, c: 200.6, v: 1004, n: 21, vw: 200.21, t: "2026-07-20T13:20:00Z" }]),
    { feed: "iex", receivedAt: Date.parse("2026-07-20T13:21:36Z"), processedAt: Date.parse("2026-07-20T13:21:36.001Z") });
  const corrected = reduceProviderEvent(final.state, update, { existingMinute: final.state.latestCompletedMinute });
  const emissions = [...pending.emissions, ...final.emissions, ...corrected.emissions];
  const parsed = parseIngestionBatch({ schemaVersion: "aperture-market-stream-v2", streamId: "stream-1", fromSequence: 1, toSequence: 3, emissions });
  assert.deepEqual(parsed.emissions.map((emission) => emission.minute?.revision), [1, 2, 3]);
  assert.deepEqual(parsed.emissions.map((emission) => emission.type), ["EVENT", "MINUTE_COMPLETED", "MINUTE_CORRECTED"]);
  assert.deepEqual(parsed.emissions.map((emission) => emission.minute?.sourceTransport), ["WEBSOCKET", "WEBSOCKET", "WEBSOCKET"]);
});

test("Sites receiver rejects a completed minute whose provider bar arrived before minute end", () => {
  const [bar] = normalizeAlpacaMessages(JSON.stringify([{ T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 1000, n: 20, vw: 200.2, t: "2026-07-20T13:20:00Z" }]),
    { feed: "iex", receivedAt: Date.parse("2026-07-20T13:20:30Z"), processedAt: Date.parse("2026-07-20T13:20:30.001Z") });
  const pending = reduceProviderEvent(initialMarketStreamState("iex", "early-bar-stream"), bar);
  const forged = structuredClone(pending.emissions[0]);
  forged.type = "MINUTE_COMPLETED";
  forged.sourceEvent = null;
  forged.processedAt = Date.parse("2026-07-20T13:21:35Z");
  forged.availableAt = forged.processedAt;
  forged.minute.status = "FINAL";
  forged.minute.revision += 1;
  forged.minute.finalizedAt = forged.processedAt;
  forged.minute.processedAt = forged.processedAt;
  forged.minute.availableAt = forged.availableAt;
  assert.throws(() => parseIngestionBatch({
    schemaVersion: "aperture-market-stream-v2", streamId: "early-bar-stream",
    fromSequence: 1, toSequence: 1, emissions: [forged],
  }), /INGESTION_EMISSION_INVALID/);
});

test("Sites receiver accepts the explicit LIVE delta emitted by the first websocket event after recovery", () => {
  const minuteStart = Date.parse("2026-07-20T13:20:00Z");
  const messages = normalizeAlpacaMessages(JSON.stringify([
    { T: "t", S: "NVDA", i: 11, x: "Q", p: 200, s: 10, c: ["@"], t: "2026-07-20T13:20:01.000000001Z", z: "C" },
    { T: "c", S: "NVDA", x: "Q", oi: 11, op: 200, os: 10, oc: ["@"], ci: 12, cp: 200.1, cs: 10, cc: ["@"], t: "2026-07-20T13:20:30.000000001Z", z: "C" },
  ]), { feed: "iex", receivedAt: minuteStart + 61_000, processedAt: minuteStart + 61_001 });
  let state = initialMarketStreamState("iex", "stream-1");
  const tradeAccepted = reduceProviderEvent(state, messages[0]);
  state = tradeAccepted.state;
  const correctionAccepted = reduceProviderEvent(state, messages[1], { affectedMinuteStart: minuteStart });
  state = correctionAccepted.state;

  const [recovery] = normalizeAlpacaMessages(JSON.stringify([
    { T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 999, n: 19, vw: 200.2, t: "2026-07-20T13:20:00Z" },
  ]), { feed: "iex", receivedAt: minuteStart + 62_000, processedAt: minuteStart + 62_001 });
  recovery.transport = "REST_RECOVERY";
  const recovered = reduceProviderEvent(state, recovery);
  assert.equal(recovered.state.barIntegrity.state, "CLEAR");
  assert.equal(recovered.state.providerState, "DEGRADED");

  const [quote] = normalizeAlpacaMessages(JSON.stringify([
    { T: "q", S: "NVDA", bx: "Q", bp: 200, bs: 2, ax: "P", ap: 200.2, as: 3, c: ["R"], t: "2026-07-20T13:20:32.000000001Z", z: "C" },
  ]), { feed: "iex", receivedAt: minuteStart + 63_000, processedAt: minuteStart + 63_001 });
  const live = reduceProviderEvent(recovered.state, quote);
  assert.equal(live.state.providerState, "LIVE");
  assert.equal(live.emissions[0].delta.providerState, "LIVE");

  const emissions = [
    ...tradeAccepted.emissions,
    ...correctionAccepted.emissions,
    ...recovered.emissions,
    ...live.emissions,
  ];
  const parsed = parseIngestionBatch({
    schemaVersion: "aperture-market-stream-v2",
    streamId: "stream-1",
    fromSequence: emissions[0].serviceSequence,
    toSequence: emissions.at(-1).serviceSequence,
    emissions,
  });
  assert.equal(parsed.emissions.at(-1).delta.providerState, "LIVE");
});
