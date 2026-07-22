import assert from "node:assert/strict";
import test from "node:test";

import {
  AlpacaStreamSupervisor,
  alpacaActiveSessionStartAt,
  alpacaSessionActivityAt,
  alpacaStreamUrl,
  normalizeAlpacaMessages,
  parseAlpacaTimestamp,
  reconnectBackoffMs,
  resolveAlpacaFeed,
} from "../src/ingestor.ts";
import { validateMarketStreamEnv } from "../src/config.ts";

const receivedAt = Date.parse("2026-07-20T13:21:01Z");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const productionIngestionUrl = "https://aperture-nvda-plan.rmiller62785.chatgpt.site/api/internal/market-stream";
const strongIngestionSecret = "ingestion-secret-32-bytes-minimum-value";
const strongControlSecret = "control-secret-32-bytes-minimum-value";
const strongBrowserSecret = "browser-secret-32-bytes-minimum-value";

test("IEX is research default, SIP is explicit, and invalid feed configuration fails", () => {
  assert.equal(resolveAlpacaFeed(undefined), "iex");
  assert.equal(resolveAlpacaFeed("SIP"), "sip");
  assert.throws(() => resolveAlpacaFeed("unknown"), /ALPACA_FEED_INVALID/);
  assert.equal(alpacaStreamUrl("iex"), "wss://stream.data.alpaca.markets/v2/iex");
});

test("full-session recovery starts at 04:00 ET across daylight-saving offsets", () => {
  assert.equal(alpacaActiveSessionStartAt(Date.parse("2026-07-20T17:30:00Z")), Date.parse("2026-07-20T08:00:00Z"));
  assert.equal(alpacaActiveSessionStartAt(Date.parse("2026-01-20T17:30:00Z")), Date.parse("2026-01-20T09:00:00Z"));
});

test("runtime configuration rejects placeholders, missing secrets, and unconfirmed SIP", () => {
  const baseEnv = {
    MARKET_STREAM: {}, APCA_API_KEY_ID: "key", APCA_API_SECRET_KEY: "secret", ALPACA_FEED: "iex",
    SITES_INGESTION_URL: productionIngestionUrl, SITES_INGESTION_SECRET: strongIngestionSecret,
    SITES_INGESTION_AUDIENCE: "sites", SITES_ACCESS_BYPASS_TOKEN: "sites-access-token",
    STREAM_CONTROL_SECRET: strongControlSecret, BROWSER_ACCESS_SECRET: strongBrowserSecret,
    BROWSER_ALLOWED_ORIGINS: "https://app.test",
  };
  assert.equal(validateMarketStreamEnv(baseEnv).feed, "iex");
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_URL: "https://replace.example.com" }), /PLACEHOLDER_FORBIDDEN/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_URL: "https://evil.invalid/api/internal/market-stream" }), /SITES_INGESTION_URL_NOT_ALLOWED/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_URL: "https://aperture-nvda-plan.rmiller62785.chatgpt.site/wrong" }), /SITES_INGESTION_URL_NOT_ALLOWED/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_URL: `${productionIngestionUrl}?redirect=evil` }), /SITES_INGESTION_URL_NOT_ALLOWED/);
  assert.equal(validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_URL: "http://127.0.0.1:3000/api/internal/market-stream" }).feed, "iex");
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, APCA_API_KEY_ID: "" }), /APCA_API_KEY_ID_REQUIRED/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_ACCESS_BYPASS_TOKEN: "" }), /SITES_ACCESS_BYPASS_TOKEN_REQUIRED/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, SITES_INGESTION_SECRET: "too-short" }), /SITES_INGESTION_SECRET_TOO_SHORT/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, STREAM_CONTROL_SECRET: "too-short" }), /STREAM_CONTROL_SECRET_TOO_SHORT/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, BROWSER_ACCESS_SECRET: "too-short" }), /BROWSER_ACCESS_SECRET_TOO_SHORT/);
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, ALPACA_FEED: "sip" }), /SIP_ENTITLEMENT_CONFIRMATION_REQUIRED/);
  assert.equal(validateMarketStreamEnv({ ...baseEnv, ALPACA_FEED: "sip", SIP_ENTITLED: "true" }).feed, "sip");
  assert.throws(() => validateMarketStreamEnv({ ...baseEnv, MAX_BROWSER_CLIENTS: "101" }), /MAX_BROWSER_CLIENTS_INVALID/);
});

test("documented Alpaca t/q/b/u/c/x schemas retain immutable provenance", () => {
  const raw = JSON.stringify([
    { T: "t", S: "NVDA", i: 10, x: "Q", p: 200.125, s: 4, c: ["@"], t: "2026-07-20T13:20:00.123456789Z", z: "C" },
    { T: "q", S: "NVDA", bx: "Q", bp: 200.12, bs: 2, ax: "P", ap: 200.14, as: 3, c: ["R"], t: "2026-07-20T13:20:00.123456790Z", z: "C" },
    { T: "b", S: "NVDA", o: 200, h: 201, l: 199, c: 200.5, v: 1000, n: 20, vw: 200.2, t: "2026-07-20T13:20:00Z" },
    { T: "u", S: "NVDA", o: 200, h: 201.1, l: 199, c: 200.6, v: 1004, n: 21, vw: 200.21, t: "2026-07-20T13:20:00Z" },
    { T: "c", S: "NVDA", x: "Q", oi: 10, op: 200.125, os: 4, oc: ["@"], ci: 11, cp: 200.13, cs: 4, cc: ["@"], t: "2026-07-20T13:20:30.000000001Z", z: "C" },
    { T: "x", S: "NVDA", i: 11, x: "Q", p: 200.13, s: 4, a: "C", t: "2026-07-20T13:20:31.000000001Z", z: "C" },
  ]);
  const events = normalizeAlpacaMessages(raw, { feed: "sip", receivedAt, processedAt: receivedAt + 5, providerEntitlementConfirmed: true });
  assert.deepEqual(events.map((event) => event.kind), ["TRADE", "QUOTE", "BAR", "BAR_UPDATE", "CORRECTION", "CANCEL"]);
  assert.equal(events[0].sourceTimestamp.epochNanos.endsWith("123456789"), true);
  assert.equal(events[0].coverage.scope, "CONSOLIDATED_SIP");
  assert.equal(events[0].coverage.executionEligible, true);
  assert.equal(events[0].availableAt, receivedAt + 5);
  assert.equal(events[1].eventKey.includes("20014"), true);
  assert.equal(events[2].bar.openCents, 20_000);
  assert.equal(events[3].bar.update, true);
  assert.equal(events[4].correction.correctedPriceCents, 20_013);
  assert.equal(events[4].correction.correctedTradeId, "11");
  assert.equal(events[5].cancel.action, "C");
  assert.equal(JSON.stringify(events).includes("secret"), false);
});

test("configured SIP remains research-only until the provider confirms access", () => {
  const frame = JSON.stringify([{ T: "t", S: "NVDA", i: 1, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:00.000000001Z", z: "C" }]);
  const unconfirmed = normalizeAlpacaMessages(frame, { feed: "sip", receivedAt });
  const confirmed = normalizeAlpacaMessages(frame, { feed: "sip", receivedAt, providerEntitlementConfirmed: true });
  assert.deepEqual([unconfirmed[0].coverage.researchOnly, unconfirmed[0].coverage.executionEligible], [true, false]);
  assert.deepEqual([confirmed[0].coverage.researchOnly, confirmed[0].coverage.executionEligible], [false, true]);
});

test("subscription readiness requires correction and cancel-error channels", async () => {
  let now = receivedAt;
  const sockets = [];
  const supervisor = new AlpacaStreamSupervisor({
    feed: "iex", symbol: "NVDA", keyId: "key", secretKey: "secret", silenceTimeoutMs: 20_000,
    handshakeTimeoutMs: 10_000, baseBackoffMs: 1_000, maximumBackoffMs: 4_000,
  }, { connect(_url, handlers) { const socket = { close() {}, send() {} }; sockets.push({ socket, handlers }); return socket; } },
  { now: () => now, onEvents() {}, onConnection() {} });
  supervisor.start(); sockets[0].handlers.open();
  sockets[0].handlers.message(JSON.stringify([{ T: "success", msg: "connected" }])); await settle();
  sockets[0].handlers.message(JSON.stringify([{ T: "success", msg: "authenticated" }])); await settle();
  sockets[0].handlers.message(JSON.stringify([{ T: "subscription", trades: ["NVDA"], quotes: ["NVDA"], bars: ["NVDA"], updatedBars: ["NVDA"] }])); await settle();
  assert.equal(supervisor.status.phase, "BACKOFF");
});

test("missing source time is rejected rather than replaced with receive time", () => {
  const events = normalizeAlpacaMessages(JSON.stringify([{ T: "t", S: "NVDA", i: 1, x: "Q", p: 200, s: 1, c: ["@"], z: "C" }]), { feed: "iex", receivedAt });
  assert.deepEqual(events, []);
  assert.equal(parseAlpacaTimestamp("2026-07-20T13:20:00.123456789Z").fractionalDigits, 9);
});

test("supervisor waits for connected, authenticated, and complete subscription acknowledgements", async () => {
  let now = 0;
  const states = [];
  const delivered = [];
  const sockets = [];
  const connector = {
    connect(_url, handlers) {
      const sent = [];
      const socket = { sent, closed: false, close() { this.closed = true; }, send(value) { sent.push(JSON.parse(value)); } };
      sockets.push({ socket, handlers });
      return socket;
    },
  };
  const supervisor = new AlpacaStreamSupervisor({ feed: "iex", symbol: "NVDA", keyId: "runtime-key", secretKey: "runtime-secret", silenceTimeoutMs: 20_000, handshakeTimeoutMs: 10_000, baseBackoffMs: 1_000, maximumBackoffMs: 4_000 }, connector, {
    now: () => now,
    onEvents(events) { delivered.push(...events); },
    onConnection(state, nextReconnectAt) { states.push({ state, nextReconnectAt }); },
  });
  supervisor.start();
  sockets[0].handlers.open();
  assert.equal(sockets[0].socket.sent.length, 0);
  sockets[0].handlers.message(JSON.stringify([{ T: "success", msg: "connected" }])); await settle();
  assert.equal(sockets[0].socket.sent[0].action, "auth");
  sockets[0].handlers.message(JSON.stringify([{ T: "success", msg: "authenticated" }])); await settle();
  assert.equal(sockets[0].socket.sent[1].action, "subscribe");
  assert.deepEqual(sockets[0].socket.sent[1].updatedBars, ["NVDA"]);
  assert.deepEqual(sockets[0].socket.sent[1].corrections, ["NVDA"]);
  assert.deepEqual(sockets[0].socket.sent[1].cancelErrors, ["NVDA"]);
  sockets[0].handlers.message(JSON.stringify([{ T: "subscription", trades: ["NVDA"], quotes: ["NVDA"], bars: ["NVDA"], updatedBars: ["NVDA"], corrections: ["NVDA"], cancelErrors: ["NVDA"] }])); await settle();
  assert.equal(states.at(-1).state, "LIVE");
  assert.equal(supervisor.status.connected, true);
  now = receivedAt;
  sockets[0].handlers.message(JSON.stringify([{ T: "t", S: "NVDA", i: 1, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:00.000000001Z", z: "C" }])); await settle();
  assert.equal(delivered.length, 1);
  assert.equal(states.filter((state) => state.state === "LIVE").length, 1);
});

test("protocol deadlines and errors reconnect without stale-generation interference", async () => {
  let now = 0;
  const states = [];
  const sockets = [];
  const supervisor = new AlpacaStreamSupervisor({ feed: "iex", symbol: "NVDA", keyId: "key", secretKey: "secret", silenceTimeoutMs: 20_000, handshakeTimeoutMs: 10_000, baseBackoffMs: 1_000, maximumBackoffMs: 4_000 }, {
    connect(_url, handlers) {
      const socket = { close() {}, send() {} };
      sockets.push({ socket, handlers }); return socket;
    },
  }, { now: () => now, onEvents() {}, onConnection(state, nextReconnectAt) { states.push({ state, nextReconnectAt }); } });
  supervisor.start(); sockets[0].handlers.open();
  now = 10_001; supervisor.tick();
  assert.equal(states.at(-1).state, "BACKOFF");
  assert.equal(supervisor.status.nextReconnectAt, 11_001);
  sockets[0].handlers.message(JSON.stringify([{ T: "success", msg: "connected" }])); await settle();
  assert.equal(supervisor.status.phase, "BACKOFF");
  now = 11_001; supervisor.tick();
  assert.equal(sockets.length, 2);
  sockets[1].handlers.open();
  sockets[1].handlers.message(JSON.stringify([{ T: "error", code: 409, msg: "insufficient subscription" }])); await settle();
  assert.equal(supervisor.status.phase, "BACKOFF");
  assert.equal(reconnectBackoffMs(10, 1_000, 4_000), 4_000);
});

test("message serialization recovers after a failed event hook", async () => {
  let now = receivedAt;
  let calls = 0;
  const sockets = [];
  const supervisor = new AlpacaStreamSupervisor({ feed: "iex", symbol: "NVDA", keyId: "key", secretKey: "secret", silenceTimeoutMs: 20_000, handshakeTimeoutMs: 10_000, baseBackoffMs: 1, maximumBackoffMs: 1 }, {
    connect(_url, handlers) { const socket = { close() {}, send() {} }; sockets.push({ socket, handlers }); return socket; },
  }, {
    now: () => now,
    async onEvents() { calls += 1; if (calls === 1) throw new Error("transient persistence failure"); },
    onConnection() {},
  });
  const authenticate = async (index) => {
    sockets[index].handlers.open();
    sockets[index].handlers.message(JSON.stringify([{ T: "success", msg: "connected" }])); await settle();
    sockets[index].handlers.message(JSON.stringify([{ T: "success", msg: "authenticated" }])); await settle();
    sockets[index].handlers.message(JSON.stringify([{ T: "subscription", trades: ["NVDA"], quotes: ["NVDA"], bars: ["NVDA"], updatedBars: ["NVDA"], corrections: ["NVDA"], cancelErrors: ["NVDA"] }])); await settle();
  };
  supervisor.start(); await authenticate(0);
  const data = JSON.stringify([{ T: "t", S: "NVDA", i: 1, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:00.000000001Z", z: "C" }]);
  sockets[0].handlers.message(data); await settle(); await settle();
  assert.equal(supervisor.status.phase, "BACKOFF");
  now += 1; supervisor.tick(); await authenticate(1);
  sockets[1].handlers.message(data); await settle();
  assert.equal(calls, 2);
  assert.equal(supervisor.status.phase, "LIVE");
});

test("session policy treats weekends and exchange holidays as quiet", () => {
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-07-20T14:00:00Z")), "ACTIVE");
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-07-19T14:00:00Z")), "QUIET");
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-07-03T14:00:00Z")), "QUIET");
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-03-09T08:30:00Z")), "ACTIVE");
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-11-27T21:59:00Z")), "ACTIVE");
  assert.equal(alpacaSessionActivityAt(Date.parse("2026-11-27T22:00:00Z")), "QUIET");
});

test("quiet windows defer connection attempts and do not create reconnect storms", () => {
  let now = 1_000;
  let active = false;
  let connects = 0;
  const states = [];
  const supervisor = new AlpacaStreamSupervisor({
    feed: "iex", symbol: "NVDA", keyId: "key", secretKey: "secret", silenceTimeoutMs: 20_000,
    handshakeTimeoutMs: 10_000, baseBackoffMs: 1_000, maximumBackoffMs: 4_000,
    sessionActivityAt: () => active ? "ACTIVE" : "QUIET", nextActiveAt: (at) => at + 60_000,
  }, { connect() { connects += 1; return { close() {}, send() {} }; } }, {
    now: () => now, onEvents() {}, onConnection(state, nextReconnectAt) { states.push({ state, nextReconnectAt }); },
  });
  supervisor.start();
  assert.equal(connects, 0);
  assert.equal(supervisor.status.nextReconnectAt, 61_000);
  for (const at of [10_000, 30_000, 60_999]) { now = at; supervisor.tick(); }
  assert.equal(connects, 0);
  active = true; now = 61_000; supervisor.tick();
  assert.equal(connects, 1);
  assert.equal(states.filter((item) => item.state === "BACKOFF").length, 1);
});
