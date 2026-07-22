import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { normalizeAlpacaMessages } from "../src/ingestor.ts";
import { NvdaMarketStream } from "../src/index.ts";
import { advanceMarketWatermark, initialMarketStreamState, reduceProviderEvent } from "../src/reducer.ts";
import { DurableSqlNonceStore, MarketStreamRepository } from "../src/storage.ts";

function cursor(rows = []) {
  return { *[Symbol.iterator]() { yield* rows; }, toArray() { return rows; } };
}

function memoryStorage() {
  const database = new DatabaseSync(":memory:");
  return {
    sql: {
      exec(query, ...bindings) {
        const statement = database.prepare(query);
        if (statement.columns().length) return cursor(statement.all(...bindings));
        statement.run(...bindings); return cursor();
      },
    },
    transactionSync(callback) {
      database.exec("BEGIN IMMEDIATE");
      try { const value = callback(); database.exec("COMMIT"); return value; }
      catch (error) { database.exec("ROLLBACK"); throw error; }
    },
    alarmSetCount: 0,
    alarmDeleteCount: 0,
    async setAlarm() { this.alarmSetCount += 1; },
    async deleteAlarm() { this.alarmDeleteCount += 1; },
  };
}

function providerEvent() {
  return normalizeAlpacaMessages(JSON.stringify([{ T: "t", S: "NVDA", i: 1, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:00.000000001Z", z: "C" }]),
    { feed: "iex", receivedAt: Date.parse("2026-07-20T13:20:00.100Z"), processedAt: Date.parse("2026-07-20T13:20:00.101Z") })[0];
}

test("SQLite repository atomically persists compact state, immutable event, emission, and outbox", () => {
  const storage = memoryStorage();
  const repository = new MarketStreamRepository(storage);
  repository.initializeSchema();
  const initial = initialMarketStreamState("iex", "stream-1");
  repository.saveInitialState(initial);
  const event = providerEvent();
  const accepted = reduceProviderEvent(initial, event);
  repository.commit({ state: accepted.state, emissions: accepted.emissions, event });
  assert.equal(repository.hasEvent(event.eventKey), true);
  assert.equal(repository.tradeObservedAt("1"), event.sourceObservedAt);
  assert.equal(repository.loadState().serviceSequence, 1);
  assert.ok(JSON.stringify(repository.loadState()).length < 100_000);
  const ready = repository.readyOutbox("stream-1", Date.now());
  assert.equal(ready.length, 1);
  assert.equal(ready[0].emission.sourceEvent.eventKey, event.eventKey);
  assert.equal(repository.recoverEmissions("stream-1", 0).length, 1);
  assert.equal(repository.emissionEpoch("stream-1", 1), 0);
  repository.acknowledge("stream-1", 1, Date.now());
  assert.equal(repository.deliveryHealth("stream-1").backlog, 0);
  assert.equal(repository.deliveryHealth("stream-1").highestContiguousAck, 1);
  repository.prune(event.availableAt + 3 * 60 * 60_000);
  assert.equal(repository.tradeObservedAt("1"), event.sourceObservedAt, "trade-to-minute mapping outlives short event retention");
});

test("outbox retry blocks later sequences until the first contiguous item is ready", () => {
  const storage = memoryStorage();
  const repository = new MarketStreamRepository(storage); repository.initializeSchema();
  let state = initialMarketStreamState("iex", "stream-1"); repository.saveInitialState(state);
  for (const id of [1, 2]) {
    const event = { ...providerEvent(), eventKey: `${providerEvent().eventKey}:${id}`, providerEventId: String(id), trade: { ...providerEvent().trade, providerTradeId: String(id) } };
    const accepted = reduceProviderEvent(state, event); state = accepted.state;
    repository.commit({ state, emissions: accepted.emissions, event });
  }
  const firstPage = repository.recoveryPage("stream-1", 0, 1);
  assert.equal(firstPage.emissions.length, 1);
  assert.equal(firstPage.nextAfterSequence, 1);
  assert.equal(firstPage.hasMore, true);
  const secondPage = repository.recoveryPage("stream-1", firstPage.nextAfterSequence, 1);
  assert.equal(secondPage.emissions[0].serviceSequence, 2);
  assert.equal(secondPage.hasMore, false);
  repository.recordDeliveryFailure("stream-1", 1, 1, 10_000);
  assert.equal(repository.readyOutbox("stream-1", 9_999).length, 0);
  assert.equal(repository.readyOutbox("stream-1", 10_000).length, 2);
});

test("provider recovery checkpoints survive repository restart and advance page by page", () => {
  const storage = memoryStorage();
  const first = new MarketStreamRepository(storage); first.initializeSchema();
  first.beginProviderRecovery(1_000, 5_000);
  first.beginProviderRecovery(2_000, 8_000);
  assert.deepEqual(first.providerRecoveryCheckpoint(), { startAt: 1_000, throughAt: 8_000 });
  const restarted = new MarketStreamRepository(storage); restarted.initializeSchema();
  assert.deepEqual(restarted.providerRecoveryCheckpoint(), { startAt: 1_000, throughAt: 8_000 });
  assert.equal(restarted.advanceProviderRecovery(2_000, 3_000), false);
  assert.equal(restarted.advanceProviderRecovery(1_000, 4_000), true);
  assert.deepEqual(restarted.providerRecoveryCheckpoint(), { startAt: 4_001, throughAt: 8_000 });
  assert.equal(restarted.advanceProviderRecovery(4_001, 8_000), true);
  assert.equal(restarted.providerRecoveryCheckpoint(), null);
});

test("full-session recovery proof survives restart and becomes consumable only after its durable boundary", () => {
  const storage = memoryStorage();
  const first = new MarketStreamRepository(storage); first.initializeSchema();
  first.beginFullSessionProviderRecovery(1_000, 8_000);
  assert.deepEqual(first.fullSessionRecoveryProof(), { startAt: 1_000, throughAt: 8_000, completed: false });
  assert.equal(first.advanceProviderRecovery(1_000, 4_000), true);

  const restarted = new MarketStreamRepository(storage); restarted.initializeSchema();
  assert.deepEqual(restarted.providerRecoveryCheckpoint(), { startAt: 4_001, throughAt: 8_000 });
  assert.deepEqual(restarted.fullSessionRecoveryProof(), { startAt: 1_000, throughAt: 8_000, completed: false });
  assert.equal(restarted.advanceProviderRecovery(4_001, 8_000), true);

  const completed = new MarketStreamRepository(storage); completed.initializeSchema();
  assert.equal(completed.providerRecoveryCheckpoint(), null);
  assert.deepEqual(completed.fullSessionRecoveryProof(), { startAt: 1_000, throughAt: 8_000, completed: true });
  completed.clearFullSessionRecoveryProof();
  assert.equal(completed.fullSessionRecoveryProof(), null);
});

test("minute status transitions persist as immutable monotonic revisions", () => {
  const storage = memoryStorage();
  const repository = new MarketStreamRepository(storage); repository.initializeSchema();
  const receivedAt = Date.parse("2026-07-20T13:21:01Z");
  const [event] = normalizeAlpacaMessages(JSON.stringify([{ T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 1000, n: 20, vw: 200.2, t: "2026-07-20T13:20:00Z" }]),
    { feed: "iex", receivedAt, processedAt: receivedAt + 1 });
  const pending = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), event);
  repository.commit({ state: pending.state, emissions: pending.emissions, event });
  const finalized = advanceMarketWatermark(pending.state, Date.parse("2026-07-20T13:21:35Z"));
  repository.commit({ state: finalized.state, emissions: finalized.emissions, event: null });
  assert.equal(repository.latestMinute(event.bar.barKey).revision, 2);
  assert.equal(repository.latestMinute(event.bar.barKey).status, "FINAL");
  assert.equal(repository.latestMinute(event.bar.barKey).sourceTransport, "WEBSOCKET");
});

test("durable nonce insertion is atomic and expiry aware", async () => {
  const storage = memoryStorage();
  const repository = new MarketStreamRepository(storage); repository.initializeSchema();
  let now = 100;
  const nonces = new DurableSqlNonceStore(storage, "ingestion", () => now);
  assert.equal(await nonces.rememberOnce("audience:nonce", 200), true);
  assert.equal(await nonces.rememberOnce("audience:nonce", 200), false);
  now = 201;
  assert.equal(await nonces.rememberOnce("audience:nonce", 300), true);
});

test("a legacy IEX Durable Object retires under SIP configuration and cannot rearm", async () => {
  const storage = memoryStorage();
  const repository = new MarketStreamRepository(storage);
  repository.initializeSchema();
  repository.saveInitialState(initialMarketStreamState("iex", "legacy-iex-stream"));
  const ctx = {
    storage,
    blockConcurrencyWhile(callback) { return callback(); },
    acceptWebSocket() {},
    getWebSockets() { return []; },
  };
  const env = {
    MARKET_STREAM: {},
    APCA_API_KEY_ID: "key",
    APCA_API_SECRET_KEY: "secret",
    ALPACA_FEED: "sip",
    SIP_ENTITLED: "true",
    SITES_INGESTION_URL: "https://aperture-nvda-plan.rmiller62785.chatgpt.site/api/internal/market-stream",
    SITES_INGESTION_SECRET: "ingestion-secret-32-bytes-minimum-value",
    SITES_INGESTION_AUDIENCE: "aperture-sites-market-ingestion",
    SITES_ACCESS_BYPASS_TOKEN: "sites-access-token",
    STREAM_CONTROL_SECRET: "control-secret-32-bytes-minimum-value",
    BROWSER_ACCESS_SECRET: "browser-secret-32-bytes-minimum-value",
    BROWSER_ALLOWED_ORIGINS: "https://aperture-nvda-plan.rmiller62785.chatgpt.site",
  };
  const stream = new NvdaMarketStream(ctx, env);

  await stream.alarm();
  assert.equal(storage.alarmDeleteCount, 2, "constructor and wake both clear the legacy alarm");
  assert.equal(storage.alarmSetCount, 0, "retired object never rearms itself");
  assert.equal(repository.loadState().feed, "iex", "legacy evidence is not rewritten as SIP");

  const response = await stream.fetch(new Request("https://market-stream.internal/internal/tick", {
    headers: { "x-stream-control": env.STREAM_CONTROL_SECRET },
  }));
  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), { error: "STREAM_INSTANCE_RETIRED" });
  assert.equal(storage.alarmSetCount, 0);
});
