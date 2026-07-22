import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";

import { ensureMarketPersistenceSchema } from "../app/d1-schema.ts";
import { handleMarketStreamPost } from "../app/api/internal/market-stream/handler.ts";
import { createMarketStore } from "../app/market-store.ts";
import { ingestMarketStreamBatch, parseIngestionBatch } from "../app/market-stream-receiver.ts";
import { readMooStreamHealth } from "../app/moo-system-status.ts";
import { signSitesIngestion } from "../services/market-stream/src/auth.ts";
import { normalizeAlpacaMessages } from "../services/market-stream/src/ingestor.ts";
import { advanceMarketWatermark, beginConnectionEpoch, initialMarketStreamState, reduceProviderEvent, setProviderConnectionState } from "../services/market-stream/src/reducer.ts";

const BASE = Date.parse("2026-07-20T13:20:00Z");

function fixture(streamId = "stream-1") {
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", streamId), BASE);
  const [event] = normalizeAlpacaMessages(JSON.stringify([{
    T: "t", S: "NVDA", i: 101, x: "Q", p: 200.25, s: 10,
    c: ["@"], t: "2026-07-20T13:20:01.000000001Z", z: "C",
  }]), { feed: "iex", receivedAt: BASE + 1_100, processedAt: BASE + 1_101 });
  const accepted = reduceProviderEvent(connected.state, event);
  const emissions = [...connected.emissions, ...accepted.emissions];
  return {
    schemaVersion: "aperture-market-stream-v2",
    streamId,
    fromSequence: 1,
    toSequence: 2,
    emissions,
  };
}

function singleEventFixture(streamId, message, receivedAt) {
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", streamId), BASE);
  const [event] = normalizeAlpacaMessages(JSON.stringify([message]), {
    feed: "iex", receivedAt, processedAt: receivedAt + 1,
  });
  const accepted = reduceProviderEvent(connected.state, event);
  const emissions = [...connected.emissions, ...accepted.emissions];
  return { schemaVersion: "aperture-market-stream-v2", streamId, fromSequence: 1, toSequence: emissions.length, emissions };
}

test("accepts a contiguous immutable IEX research batch", () => {
  const value = fixture();
  const parsed = parseIngestionBatch(value);
  assert.equal(parsed.emissions.length, 2);
  assert.equal(parsed.emissions[1].coverage.researchOnly, true);
  assert.equal(parsed.emissions[1].coverage.executionEligible, false);
});

test("rejects IEX coverage promoted to execution eligibility", () => {
  const value = structuredClone(fixture());
  value.emissions[1].coverage.executionEligible = true;
  assert.throws(() => parseIngestionBatch(value), /INGESTION_EMISSION_INVALID/);
});

test("allows fail-closed SIP coverage but rejects contradictory SIP claims", () => {
  const value = structuredClone(fixture());
  for (const emission of value.emissions) {
    emission.feed = "sip";
    emission.coverage = { provider: "alpaca", feed: "sip", scope: "CONSOLIDATED_SIP", researchOnly: true, executionEligible: false };
    if (emission.sourceEvent) {
      emission.sourceEvent.feed = "sip";
      emission.sourceEvent.coverage = structuredClone(emission.coverage);
    }
  }
  assert.equal(parseIngestionBatch(value).emissions[1].coverage.executionEligible, false);

  value.emissions[1].coverage = { ...value.emissions[1].coverage, researchOnly: true, executionEligible: true };
  assert.throws(() => parseIngestionBatch(value), /INGESTION_EMISSION_INVALID/);
});

test("rejects execution-eligible SIP events delivered by REST recovery", () => {
  const [event] = normalizeAlpacaMessages(JSON.stringify([{
    T: "t", S: "NVDA", i: 202, x: "Q", p: 200.5, s: 5,
    c: ["@"], t: "2026-07-20T13:20:02.000000001Z", z: "C",
  }]), {
    feed: "sip", receivedAt: BASE + 2_100, processedAt: BASE + 2_101,
    providerEntitlementConfirmed: true,
  });
  const accepted = reduceProviderEvent(initialMarketStreamState("sip", "sip-rest-boundary"), event);
  const value = {
    schemaVersion: "aperture-market-stream-v2",
    streamId: "sip-rest-boundary",
    fromSequence: 1,
    toSequence: 1,
    emissions: accepted.emissions,
  };
  value.emissions[0].sourceEvent.transport = "REST_RECOVERY";
  assert.throws(() => parseIngestionBatch(value), /INGESTION_EMISSION_INVALID/);
});

test("rejects sequence gaps, reordered IDs, and mixed feeds", () => {
  const gap = structuredClone(fixture());
  gap.toSequence = 3;
  assert.throws(() => parseIngestionBatch(gap), /INGESTION_BATCH_INVALID/);

  const id = structuredClone(fixture());
  id.emissions[1].emissionId = "stream-1:999";
  assert.throws(() => parseIngestionBatch(id), /INGESTION_EMISSION_INVALID/);

  const feed = structuredClone(fixture());
  feed.emissions[1].feed = "sip";
  assert.throws(() => parseIngestionBatch(feed), /INGESTION_EMISSION_INVALID/);
});

test("rejects malformed timestamps and unrecognized provider states", () => {
  const time = structuredClone(fixture());
  time.emissions[1].sourceEvent.sourceTimestamp.epochMs += 5_000;
  assert.throws(() => parseIngestionBatch(time), /INGESTION_EMISSION_INVALID/);

  const nanos = structuredClone(fixture());
  nanos.emissions[1].sourceEvent.sourceTimestamp.epochNanos = "1";
  assert.throws(() => parseIngestionBatch(nanos), /INGESTION_EMISSION_INVALID/);

  const state = structuredClone(fixture());
  state.emissions[0].delta.providerState = "READY";
  assert.throws(() => parseIngestionBatch(state), /INGESTION_EMISSION_INVALID/);
});

test("rejects detached bar minutes and incoherent status timestamps", () => {
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", "bar-stream"), BASE);
  const [event] = normalizeAlpacaMessages(JSON.stringify([{
    T: "b", S: "NVDA", o: 200, h: 201, l: 199.5, c: 200.5, v: 1000, n: 50,
    vw: 200.25, t: "2026-07-20T13:20:00.000000001Z",
  }]), { feed: "iex", receivedAt: BASE + 60_100, processedAt: BASE + 60_101 });
  const accepted = reduceProviderEvent(connected.state, event);
  const value = {
    schemaVersion: "aperture-market-stream-v2",
    streamId: "bar-stream",
    fromSequence: 1,
    toSequence: 2,
    emissions: [...connected.emissions, ...accepted.emissions],
  };
  assert.equal(parseIngestionBatch(value).emissions[1].minute.status, "PENDING");

  const detached = structuredClone(value);
  detached.emissions[1].minute.sourceEventKey = "different-event";
  assert.throws(() => parseIngestionBatch(detached), /INGESTION_EMISSION_INVALID/);

  const mismatched = structuredClone(value);
  mismatched.emissions[1].minute.closeCents += 1;
  assert.throws(() => parseIngestionBatch(mismatched), /INGESTION_EMISSION_INVALID/);

  const timestamp = structuredClone(value);
  timestamp.emissions[1].minute.finalizedAt = timestamp.emissions[1].processedAt;
  assert.throws(() => parseIngestionBatch(timestamp), /INGESTION_EMISSION_INVALID/);
});

test("accepts a forming provider bar as pending evidence without completing the candle", () => {
  const value = singleEventFixture("forming-bar-stream", {
    T: "u", S: "NVDA", o: 200, h: 201, l: 199.5, c: 200.5, v: 1000, n: 50,
    vw: 200.25, t: "2026-07-20T13:20:00.000000001Z",
  }, BASE + 30_000);
  const parsed = parseIngestionBatch(value);
  const emission = parsed.emissions.at(-1);
  assert.equal(emission.type, "EVENT");
  assert.equal(emission.minute.status, "PENDING");
  assert.equal(emission.minute.availableAt < emission.minute.minuteEnd, true);
});

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response(); } }",
  d1Databases: { DB: "receiver-integration" },
});
const database = await mf.getD1Database("DB");
await ensureMarketPersistenceSchema(database);
test.after(async () => mf.dispose());

async function scalar(sql, ...values) {
  const row = await database.prepare(sql).bind(...values).first();
  return Number(row?.value ?? 0);
}

test("D1 receiver makes duplicate delivery idempotent", async () => {
  const value = fixture("duplicate-stream");
  assert.deepEqual(await ingestMarketStreamBatch(database, value, BASE + 10_000), {
    ok: true, streamId: "duplicate-stream", highestContiguousSequence: 2,
  });
  assert.deepEqual(await ingestMarketStreamBatch(database, structuredClone(value), BASE + 20_000), {
    ok: true, streamId: "duplicate-stream", highestContiguousSequence: 2,
  });
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_emissions WHERE stream_id=?", "duplicate-stream"), 2);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_source_state_events WHERE connection_epoch LIKE ?", "duplicate-stream:%"), 2);
  assert.equal(await scalar("SELECT highest_contiguous_sequence AS value FROM market_stream_ingest_cursors WHERE stream_id=?", "duplicate-stream"), 2);
});

test("D1 receiver advances a large backlog in bounded pages and replays an old page without gaps", async () => {
  const streamId = "bounded-backlog-stream";
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", streamId), BASE);
  let state = connected.state;
  const emissions = [...connected.emissions];
  for (let id = 1; id <= 25; id += 1) {
    const receivedAt = BASE + id * 100;
    const [event] = normalizeAlpacaMessages(JSON.stringify([{
      T: "t", S: "NVDA", i: 500 + id, x: "Q", p: 200 + id / 100, s: 1,
      c: ["@"], t: new Date(receivedAt - 10).toISOString(), z: "C",
    }]), { feed: "iex", receivedAt, processedAt: receivedAt + 1 });
    const accepted = reduceProviderEvent(state, event);
    state = accepted.state;
    emissions.push(...accepted.emissions);
  }

  const pages = [];
  for (let index = 0; index < emissions.length; index += 12) {
    const pageEmissions = emissions.slice(index, index + 12);
    const page = {
      schemaVersion: "aperture-market-stream-v2",
      streamId,
      fromSequence: pageEmissions[0].serviceSequence,
      toSequence: pageEmissions.at(-1).serviceSequence,
      emissions: pageEmissions,
    };
    pages.push(page);
    await ingestMarketStreamBatch(database, page, BASE + 20_000 + index);
  }
  await ingestMarketStreamBatch(database, structuredClone(pages[1]), BASE + 30_000);

  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_emissions WHERE stream_id=?", streamId), emissions.length);
  assert.equal(await scalar("SELECT highest_contiguous_sequence AS value FROM market_stream_ingest_cursors WHERE stream_id=?", streamId), emissions.length);
  const sequences = await database.prepare(`SELECT service_sequence FROM market_stream_ingest_emissions
    WHERE stream_id=? ORDER BY service_sequence`).bind(streamId).all();
  assert.deepEqual(sequences.results.map((row) => row.service_sequence),
    Array.from({ length: emissions.length }, (_, index) => index + 1));
});

test("D1 receiver requires current-epoch LIVE proof before strict SIP websocket qualification", async () => {
  const streamId = "sip-websocket-strict-stream";
  const priorEpochLive = setProviderConnectionState(initialMarketStreamState("sip", streamId), "LIVE", BASE - 100);
  const connecting = beginConnectionEpoch(priorEpochLive.state, BASE);
  const events = normalizeAlpacaMessages(JSON.stringify([{
    T: "t", S: "NVDA", i: 303, x: "Q", p: 201.25, s: 6,
    c: ["@"], t: "2026-07-20T13:20:03.000000001Z", z: "C",
  }, {
    T: "t", S: "NVDA", i: 304, x: "Q", p: 201.3, s: 4,
    c: ["@"], t: "2026-07-20T13:20:04.000000001Z", z: "C",
  }]), {
    feed: "sip", receivedAt: BASE + 3_100, processedAt: BASE + 3_101,
    providerEntitlementConfirmed: true,
  });
  const beforeLive = reduceProviderEvent(connecting.state, events[0]);
  const afterLive = reduceProviderEvent(beforeLive.state, events[1]);
  const emissions = [...priorEpochLive.emissions, ...connecting.emissions, ...beforeLive.emissions, ...afterLive.emissions];
  await ingestMarketStreamBatch(database, {
    schemaVersion: "aperture-market-stream-v2",
    streamId,
    fromSequence: 1,
    toSequence: emissions.length,
    emissions,
  }, BASE + 10_000);
  const observations = await database.prepare(`SELECT provider_event_id,qualification,coverage FROM market_qualified_observations
    WHERE connection_epoch LIKE ? ORDER BY service_sequence`).bind(`${streamId}:%`).all();
  assert.deepEqual(observations.results, [
    { provider_event_id: "303", qualification: "RESEARCH", coverage: "CONSOLIDATED_SIP" },
    { provider_event_id: "304", qualification: "STRICT_EXECUTION", coverage: "CONSOLIDATED_SIP" },
  ]);
});

test("research-only REST recovery preserves independently confirmed live SIP transport health", async () => {
  const streamId = "sip-live-rest-health-stream";
  const receivedAt = BASE + 199_000;
  const live = setProviderConnectionState(initialMarketStreamState("sip", streamId), "LIVE", receivedAt - 100);
  const [recovery] = normalizeAlpacaMessages(JSON.stringify([{
    T: "q", S: "NVDA", bx: "Q", bp: 200, bs: 2, ax: "P", ap: 200.2, as: 3,
    c: ["R"], t: "2026-07-20T13:23:18.000000001Z", z: "C",
  }]), {
    feed: "sip", receivedAt, processedAt: receivedAt + 1,
    transport: "REST_RECOVERY", providerEntitlementConfirmed: false,
  });
  const recovered = reduceProviderEvent(live.state, recovery);
  const emissions = [...live.emissions, ...recovered.emissions];
  await ingestMarketStreamBatch(database, {
    schemaVersion: "aperture-market-stream-v2", streamId,
    fromSequence: 1, toSequence: emissions.length, emissions,
  }, BASE + 200_000);

  const latestSource = await database.prepare(`SELECT state,entitlement,coverage,detail_code
    FROM market_source_state_events WHERE connection_epoch LIKE ?
    ORDER BY service_sequence DESC LIMIT 1`).bind(`${streamId}:%`).first();
  assert.deepEqual(latestSource, {
    state: "CURRENT", entitlement: "ENTITLED", coverage: "CONSOLIDATED_SIP", detail_code: "STREAM_LIVE",
  });
  const recoveredObservation = await database.prepare(`SELECT qualification,coverage FROM market_qualified_observations
    WHERE connection_epoch LIKE ? ORDER BY service_sequence DESC LIMIT 1`).bind(`${streamId}:%`).first();
  assert.deepEqual(recoveredObservation, { qualification: "RESEARCH", coverage: "CONSOLIDATED_SIP" });
  const health = await readMooStreamHealth(database, BASE + 200_000);
  assert.equal(health.streamId, streamId);
  assert.equal(health.state, "LIVE");
  assert.equal(health.feed, "sip");
});

test("D1 transaction rollback prevents ghost data after a mid-publication failure", async () => {
  let batchCall = 0;
  const failingDatabase = {
    prepare: (...args) => database.prepare(...args),
    async batch(statements) {
      batchCall += 1;
      if (batchCall !== 1) return database.batch(statements);
      const broken = database.prepare(`INSERT INTO market_stream_ingest_cursors
        (stream_id,highest_contiguous_sequence,updated_at) VALUES ('forced-failure',-1,0)`);
      const middle = Math.floor(statements.length / 2);
      return database.batch([...statements.slice(0, middle), broken, ...statements.slice(middle)]);
    },
  };
  const value = fixture("rollback-stream");
  await assert.rejects(() => ingestMarketStreamBatch(failingDatabase, value, BASE + 30_000));
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_streams WHERE stream_id=?", "rollback-stream"), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_emissions WHERE stream_id=?", "rollback-stream"), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_source_state_events WHERE connection_epoch LIKE ?", "rollback-stream:%"), 0);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_cursors WHERE stream_id=?", "rollback-stream"), 0);
});

test("D1 receiver rejects gaps and immutable stream feed switches", async () => {
  const value = fixture("binding-stream");
  await ingestMarketStreamBatch(database, value, BASE + 40_000);

  const gap = structuredClone(value);
  gap.fromSequence = 4;
  gap.toSequence = 4;
  gap.emissions = [gap.emissions[1]];
  gap.emissions[0].serviceSequence = 4;
  gap.emissions[0].emissionId = "binding-stream:4";
  await assert.rejects(() => ingestMarketStreamBatch(database, gap, BASE + 50_000), /INGESTION_SEQUENCE_GAP/);

  const switched = structuredClone(value);
  for (const emission of switched.emissions) {
    emission.feed = "sip";
    emission.coverage = { provider: "alpaca", feed: "sip", scope: "CONSOLIDATED_SIP", researchOnly: true, executionEligible: false };
    if (emission.sourceEvent) {
      emission.sourceEvent.feed = "sip";
      emission.sourceEvent.coverage = structuredClone(emission.coverage);
    }
  }
  await assert.rejects(() => ingestMarketStreamBatch(database, switched, BASE + 60_000), /INGESTION_STREAM_BINDING_CONFLICT/);
  const registration = await database.prepare("SELECT feed,coverage_scope FROM market_stream_ingest_streams WHERE stream_id=?")
    .bind("binding-stream").first();
  assert.deepEqual(registration, { feed: "iex", coverage_scope: "SINGLE_EXCHANGE" });
});

test("D1 receiver preserves recovered provenance and appends corrected minute revisions", async () => {
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", "recovery-stream"), BASE);
  const [bar] = normalizeAlpacaMessages(JSON.stringify([{
    T: "b", S: "NVDA", o: 200, h: 201, l: 199.5, c: 200.5, v: 1000, n: 50,
    vw: 200.25, t: "2026-07-20T13:20:00.000000001Z",
  }]), { feed: "iex", transport: "REST_RECOVERY", receivedAt: BASE + 60_100, processedAt: BASE + 60_101 });
  const pending = reduceProviderEvent(connected.state, bar);
  const finalized = advanceMarketWatermark(pending.state, BASE + 120_000);
  const [update] = normalizeAlpacaMessages(JSON.stringify([{
    T: "u", S: "NVDA", o: 200, h: 201.25, l: 199.5, c: 200.75, v: 1100, n: 55,
    vw: 200.5, t: "2026-07-20T13:20:00.000000002Z",
  }]), { feed: "iex", transport: "REST_RECOVERY", receivedAt: BASE + 120_100, processedAt: BASE + 120_101 });
  const corrected = reduceProviderEvent(finalized.state, update, { existingMinute: finalized.state.latestCompletedMinute });
  const emissions = [...connected.emissions, ...pending.emissions, ...finalized.emissions, ...corrected.emissions];
  const value = {
    schemaVersion: "aperture-market-stream-v2", streamId: "recovery-stream",
    fromSequence: 1, toSequence: emissions.length, emissions,
  };
  await ingestMarketStreamBatch(database, value, BASE + 130_000);
  const rows = await database.prepare(`SELECT revision,recovered,close FROM market_completed_minute_bars
    WHERE connection_epoch LIKE ? ORDER BY revision`).bind("recovery-stream:%").all();
  assert.deepEqual(rows.results, [
    { revision: 0, recovered: 1, close: 200.5 },
    { revision: 1, recovered: 1, close: 200.75 },
  ]);
});

test("corrections and cancels preserve audit rows while as-of reads exclude invalidated trades", async () => {
  const streamId = "trade-reconciliation-stream";
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", streamId), BASE);
  const [trade] = normalizeAlpacaMessages(JSON.stringify([{
    T: "t", S: "NVDA", i: 101, x: "Q", p: 200.25, s: 10, c: ["@"],
    t: "2026-07-20T13:20:01.000000001Z", z: "C",
  }]), { feed: "iex", receivedAt: BASE + 1_100, processedAt: BASE + 1_101 });
  const traded = reduceProviderEvent(connected.state, trade);
  const [correction] = normalizeAlpacaMessages(JSON.stringify([{
    T: "c", S: "NVDA", oi: 101, ci: 102, op: 200.25, cp: 200.5, os: 10, cs: 12,
    oc: ["@"], cc: ["@"], x: "Q", z: "C", t: "2026-07-20T13:20:02.000000001Z",
  }]), { feed: "iex", receivedAt: BASE + 2_100, processedAt: BASE + 2_101 });
  const corrected = reduceProviderEvent(traded.state, correction);
  const [quote] = normalizeAlpacaMessages(JSON.stringify([{
    T: "q", S: "NVDA", bp: 200.4, ap: 200.6, bs: 2, as: 3, bx: "Q", ax: "Q", c: [],
    t: "2026-07-20T13:20:03.000000001Z", z: "C",
  }]), { feed: "iex", receivedAt: BASE + 3_100, processedAt: BASE + 3_101 });
  const quoted = reduceProviderEvent(corrected.state, quote);
  const [cancel] = normalizeAlpacaMessages(JSON.stringify([{
    T: "x", S: "NVDA", i: 102, a: "C", p: 200.5, s: 12, x: "Q", z: "C",
    t: "2026-07-20T13:20:04.000000001Z",
  }]), { feed: "iex", receivedAt: BASE + 4_100, processedAt: BASE + 4_101 });
  const canceled = reduceProviderEvent(quoted.state, cancel);
  const emissions = [...connected.emissions, ...traded.emissions, ...corrected.emissions, ...quoted.emissions, ...canceled.emissions];
  await ingestMarketStreamBatch(database, {
    schemaVersion: "aperture-market-stream-v2", streamId, fromSequence: 1,
    toSequence: emissions.length, emissions,
  }, BASE + 10_000);

  const store = createMarketStore(database);
  const trades = async (cutoff) => (await store.readObservationsAsOf({
    symbol: "NVDA", targetDate: "2026-07-20", cutoff,
  })).filter((row) => row.kind === "TRADE" && row.connectionEpoch.startsWith(`${streamId}:`));
  assert.deepEqual((await trades(correction.availableAt - 1)).map((row) => row.providerEventId), ["101"]);
  assert.deepEqual((await trades(correction.availableAt)).map((row) => row.providerEventId), ["102"]);
  assert.deepEqual(await trades(cancel.availableAt), []);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_qualified_observations WHERE connection_epoch LIKE ?", `${streamId}:%`), 3);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_observation_invalidations WHERE connection_epoch LIKE ?", `${streamId}:%`), 2);
  const health = await database.prepare(`SELECT service_sequence,state,detail_code FROM market_source_state_events
    WHERE connection_epoch LIKE ? AND service_sequence IN (3,4) ORDER BY service_sequence`).bind(`${streamId}:%`).all();
  assert.deepEqual(health.results, [
    { service_sequence: 3, state: "RECOVERING", detail_code: "STREAM_DEGRADED" },
    { service_sequence: 4, state: "RECOVERING", detail_code: "STREAM_DEGRADED" },
  ]);
});

test("receiver rejects completed minutes without an immutable pending lineage", async () => {
  const streamId = "forged-minute-stream";
  const connected = beginConnectionEpoch(initialMarketStreamState("iex", streamId), BASE);
  const [bar] = normalizeAlpacaMessages(JSON.stringify([{
    T: "b", S: "NVDA", o: 200, h: 201, l: 199.5, c: 200.5, v: 1000, n: 50,
    vw: 200.25, t: "2026-07-20T13:20:00.000000001Z",
  }]), { feed: "iex", receivedAt: BASE + 60_100, processedAt: BASE + 60_101 });
  const pending = reduceProviderEvent(connected.state, bar);
  const finalized = advanceMarketWatermark(pending.state, BASE + 120_000);
  const finalOnly = structuredClone(finalized.emissions[0]);
  finalOnly.serviceSequence = 2;
  finalOnly.emissionId = `${streamId}:2`;
  await assert.rejects(ingestMarketStreamBatch(database, {
    schemaVersion: "aperture-market-stream-v2", streamId, fromSequence: 1, toSequence: 2,
    emissions: [...connected.emissions, finalOnly],
  }, BASE + 130_000), /INGESTION_MINUTE_LINEAGE_INVALID/);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_emissions WHERE stream_id=?", streamId), 0);
});

test("signed receiver time rejects future payload provenance before publication", async () => {
  const value = fixture("future-time-stream");
  await assert.rejects(ingestMarketStreamBatch(database, value, BASE - 31_000), /INGESTION_TIME_AHEAD_OF_RECEIVER/);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_streams WHERE stream_id=?", "future-time-stream"), 0);
});

test("route fails typed and read-only when the production migration is absent", async () => {
  const emptyMf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response(); } }",
    d1Databases: { DB: "missing-receiver-schema" },
  });
  try {
    const emptyDatabase = await emptyMf.getD1Database("DB");
    const response = await handleMarketStreamPost(new Request("https://example.test/api/internal/market-stream", {
      method: "POST", body: JSON.stringify(fixture("missing-schema-stream")),
    }), { DB: emptyDatabase, SITES_INGESTION_SECRET: "test-secret-at-least-thirty-two-bytes", SITES_INGESTION_AUDIENCE: "test-audience" }, BASE);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "INGESTION_SCHEMA_UNAVAILABLE" });
    assert.equal(await emptyDatabase.prepare("SELECT COUNT(*) AS value FROM sqlite_master WHERE type='table' AND name LIKE 'market_%'").first("value"), 0);
  } finally {
    await emptyMf.dispose();
  }
});

test("signed ingestion rejects divergent trade, correction, and cancel reconciliation identities", async () => {
  const now = BASE + 10_000;
  const url = "https://example.test/api/internal/market-stream";
  const secret = "test-only-ingestion-secret-at-least-32-bytes";
  const audience = "aperture-sites-market-ingestion";
  const cases = [
    (() => {
      const value = singleEventFixture("identity-trade-stream", {
        T: "t", S: "NVDA", i: 101, x: "Q", p: 200.25, s: 10, c: ["@"],
        t: "2026-07-20T13:20:01.000000001Z", z: "C",
      }, BASE + 1_100);
      value.emissions[1].sourceEvent.providerEventId = "different-trade-id";
      return value;
    })(),
    (() => {
      const value = singleEventFixture("identity-correction-stream", {
        T: "c", S: "NVDA", oi: 101, ci: 102, op: 200.25, cp: 200.5, os: 10, cs: 12,
        oc: ["@"], cc: ["@"], x: "Q", z: "C", t: "2026-07-20T13:20:02.000000001Z",
      }, BASE + 2_100);
      value.emissions[1].sourceEvent.providerEventId = "101";
      return value;
    })(),
    (() => {
      const value = singleEventFixture("identity-cancel-stream", {
        T: "x", S: "NVDA", i: 102, a: "C", p: 200.5, s: 12, x: "Q", z: "C",
        t: "2026-07-20T13:20:03.000000001Z",
      }, BASE + 3_100);
      value.emissions[1].sourceEvent.providerEventId = "different-cancel-id";
      return value;
    })(),
    (() => {
      const value = singleEventFixture("identity-self-correction-stream", {
        T: "c", S: "NVDA", oi: 101, ci: 102, op: 200.25, cp: 200.5, os: 10, cs: 12,
        oc: ["@"], cc: ["@"], x: "Q", z: "C", t: "2026-07-20T13:20:04.000000001Z",
      }, BASE + 4_100);
      value.emissions[1].sourceEvent.correction.correctedTradeId = "101";
      value.emissions[1].sourceEvent.providerEventId = "101";
      return value;
    })(),
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const body = JSON.stringify(cases[index]);
    const headers = await signSitesIngestion({
      secret, audience, timestamp: now, nonce: `identity-reconciliation-${index}-nonce`, method: "POST", url, body,
    });
    const response = await handleMarketStreamPost(new Request(url, { method: "POST", headers, body }), {
      DB: database, SITES_INGESTION_SECRET: secret, SITES_INGESTION_AUDIENCE: audience,
    }, now);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "INGESTION_EMISSION_INVALID" });
    assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_streams WHERE stream_id=?", cases[index].streamId), 0);
  }
});

test("signed ingestion accepts the previous HMAC key during a rotation overlap", async () => {
  const now = BASE + 20_000;
  const url = "https://example.test/api/internal/market-stream";
  const currentSecret = "current-ingestion-secret-at-least-32-bytes";
  const previousSecret = "previous-ingestion-secret-at-least-32-bytes";
  const audience = "aperture-sites-market-ingestion";
  const body = JSON.stringify(fixture("rotation-overlap-stream"));
  const headers = await signSitesIngestion({
    secret: previousSecret, audience, timestamp: now, nonce: "rotation-overlap-test-nonce", method: "POST", url, body,
  });
  const response = await handleMarketStreamPost(new Request(url, { method: "POST", headers, body }), {
    DB: database,
    SITES_INGESTION_SECRET: currentSecret,
    SITES_INGESTION_SECRET_PREVIOUS: previousSecret,
    SITES_INGESTION_SECRET_PREVIOUS_VALID_UNTIL: String(now + 60_000),
    SITES_INGESTION_AUDIENCE: audience,
  }, now);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).highestContiguousSequence, 2);
});

test("signed ingestion rejects an expired previous HMAC key", async () => {
  const now = BASE + 30_000;
  const url = "https://example.test/api/internal/market-stream";
  const previousSecret = "expired-previous-secret-at-least-32-bytes";
  const audience = "aperture-sites-market-ingestion";
  const body = JSON.stringify(fixture("expired-rotation-stream"));
  const headers = await signSitesIngestion({
    secret: previousSecret, audience, timestamp: now, nonce: "expired-rotation-test-nonce", method: "POST", url, body,
  });
  const response = await handleMarketStreamPost(new Request(url, { method: "POST", headers, body }), {
    DB: database,
    SITES_INGESTION_SECRET: "current-ingestion-secret-at-least-32-bytes",
    SITES_INGESTION_SECRET_PREVIOUS: previousSecret,
    SITES_INGESTION_SECRET_PREVIOUS_VALID_UNTIL: String(now - 1),
    SITES_INGESTION_AUDIENCE: audience,
  }, now);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "INGESTION_AUTH_SIGNATURE_INVALID" });
});

test("signed ingestion refuses weak app-owned HMAC configuration", async () => {
  const response = await handleMarketStreamPost(new Request("https://example.test/api/internal/market-stream", {
    method: "POST", body: JSON.stringify(fixture("weak-secret-stream")),
  }), { DB: database, SITES_INGESTION_SECRET: "too-short", SITES_INGESTION_AUDIENCE: "test-audience" }, BASE);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "INGESTION_NOT_CONFIGURED" });
});

test("concurrent identical batches cannot create duplicates or skip the cursor", async () => {
  const value = fixture("concurrent-stream");
  const results = await Promise.all([
    ingestMarketStreamBatch(database, structuredClone(value), BASE + 70_000),
    ingestMarketStreamBatch(database, structuredClone(value), BASE + 70_001),
  ]);
  assert.deepEqual(results.map((result) => result.highestContiguousSequence), [2, 2]);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_stream_ingest_emissions WHERE stream_id=?", "concurrent-stream"), 2);
  assert.equal(await scalar("SELECT COUNT(*) AS value FROM market_source_state_events WHERE connection_epoch LIKE ?", "concurrent-stream:%"), 2);
  assert.equal(await scalar("SELECT highest_contiguous_sequence AS value FROM market_stream_ingest_cursors WHERE stream_id=?", "concurrent-stream"), 2);
});
