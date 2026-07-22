import assert from "node:assert/strict";
import test from "node:test";

import { AlpacaPaperApiError, AlpacaPaperClient } from "../src/alpaca-paper.ts";
import { command } from "./helpers.mjs";

function rawOrder(clientOrderId, overrides = {}) {
  return {
    id: "provider-order-1", client_order_id: clientOrderId, symbol: "NVDA", side: "buy", qty: "1",
    filled_qty: "0", filled_avg_price: null, type: "market", time_in_force: "opg", extended_hours: false,
    status: "accepted", submitted_at: "2026-07-20T13:24:41Z", updated_at: "2026-07-20T13:24:41Z", ...overrides,
  };
}

test("submission is pinned to paper API with fixed NVDA whole-share MOO shape", async () => {
  let captured;
  const client = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async (url, init) => {
    captured = { url: String(url), init, body: JSON.parse(init.body) };
    return Response.json(rawOrder(init.body && JSON.parse(init.body).client_order_id));
  } });
  const result = await client.submitMoo(command(), "client-order-id");
  assert.equal(captured.url, "https://paper-api.alpaca.markets/v2/orders");
  assert.equal(captured.init.redirect, "error");
  assert.equal(new Headers(captured.init.headers).get("APCA-API-KEY-ID"), "key");
  assert.equal(new Headers(captured.init.headers).get("APCA-API-SECRET-KEY"), "secret");
  assert.deepEqual(captured.body, {
    symbol: "NVDA", side: "buy", qty: "1", type: "market", time_in_force: "opg",
    extended_hours: false, client_order_id: "client-order-id",
  });
  assert.equal(result.clientOrderId, "client-order-id");
});

test("the default transport invokes native fetch through its global owner", async () => {
  const originalFetch = globalThis.fetch;
  const capture = { receiver: null };
  globalThis.fetch = function (...args) {
    const init = args[1];
    capture.receiver = this;
    return Promise.resolve(Response.json(rawOrder(JSON.parse(init.body).client_order_id)));
  };
  try {
    const client = new AlpacaPaperClient({ keyId: "key", secretKey: "secret" });
    await client.submitMoo(command(), "client-order-id");
    assert.equal(capture.receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reconciliation by client ID precedes retry and handles not found", async () => {
  let captured;
  const client = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async (url, init) => {
    captured = { url: String(url), init };
    return new Response(null, { status: 404 });
  } });
  assert.equal(await client.getByClientOrderId("client/order?unsafe"), null);
  assert.match(captured.url, /^https:\/\/paper-api\.alpaca\.markets\/v2\/orders:by_client_order_id\?client_order_id=client%2Forder%3Funsafe$/);
  assert.equal(captured.init.method, "GET");
});

test("paper health reports redacted account, position, and open NVDA MOO references", async () => {
  const calls = [];
  const client = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, init });
    if (parsed.pathname === "/v2/account") return Response.json({
      id: "secret-account-id",
      account_number: "secret-account-number",
      status: "ACTIVE",
      currency: "USD",
      buying_power: "100000.50",
      cash: "50000.25",
      equity: "75000.75",
      portfolio_value: "75000.75",
      trading_blocked: false,
      account_blocked: false,
      trade_suspended_by_user: false,
      shorting_enabled: true,
    });
    if (parsed.pathname === "/v2/positions/NVDA") return Response.json({
      asset_id: "secret-asset-id",
      symbol: "NVDA",
      side: "long",
      qty: "1",
      avg_entry_price: "200.10",
      current_price: "201.20",
      market_value: "201.20",
      unrealized_pl: "1.10",
    });
    if (parsed.pathname === "/v2/orders") return Response.json([
      rawOrder("secret-client-order-id", { id: "secret-provider-order-id" }),
      rawOrder("ignored-limit-order", { type: "limit", time_in_force: "day" }),
    ]);
    throw new Error(`unexpected request ${parsed}`);
  } });
  const health = await client.getPaperHealthReference(1234);
  assert.equal(health.state, "LIVE");
  assert.equal(health.checkedAt, 1234);
  assert.equal(health.account.buyingPower, "100000.50");
  assert.deepEqual(health.nvdaPosition, {
    present: true,
    side: "long",
    quantity: "1",
    averageEntryPrice: "200.10",
    currentPrice: "201.20",
    marketValue: "201.20",
    unrealizedProfitLoss: "1.10",
  });
  assert.deepEqual(health.openNvdaMooOrders, { count: 1, byStatus: { accepted: 1 } });
  assert.equal(health.liveTradingHostUsed, false);
  assert.equal(health.identifiersRedacted, true);
  const serialized = JSON.stringify(health);
  assert.doesNotMatch(serialized, /secret-account|secret-client|secret-provider|secret-asset/);
  assert.deepEqual(calls.map((call) => call.url.pathname).sort(), ["/v2/account", "/v2/orders", "/v2/positions/NVDA"]);
  const ordersCall = calls.find((call) => call.url.pathname === "/v2/orders");
  assert.equal(ordersCall.url.searchParams.get("status"), "open");
  assert.equal(ordersCall.url.searchParams.get("symbols"), "NVDA");
  assert.equal(new Headers(ordersCall.init.headers).get("APCA-API-KEY-ID"), "key");
  assert.ok(calls.every((call) => call.init.method === "GET" && call.init.redirect === "error"));
});

test("paper health degrades individual unavailable references without using a live host", async () => {
  const client = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v2/account") return Response.json({ message: "temporarily unavailable" }, { status: 503 });
    if (parsed.pathname === "/v2/positions/NVDA") return new Response(null, { status: 404 });
    return Response.json([]);
  } });
  const health = await client.getPaperHealthReference(1234);
  assert.equal(health.state, "DEGRADED");
  assert.equal(health.account, null);
  assert.deepEqual(health.nvdaPosition, { present: false });
  assert.deepEqual(health.openNvdaMooOrders, { count: 0, byStatus: {} });
  assert.deepEqual(health.errors, ["ALPACA_PAPER_HTTP_503"]);
  assert.equal(health.liveTradingHostUsed, false);
});

test("redirects, transport ambiguity, upstream rejects, and identity drift fail closed", async () => {
  const redirect = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async () => { throw new TypeError("redirect blocked"); } });
  await assert.rejects(() => redirect.submitMoo(command(), "client"), (error) => error instanceof AlpacaPaperApiError && error.retryable);
  const rejected = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async () => Response.json({ message: "no" }, { status: 422 }) });
  await assert.rejects(() => rejected.submitMoo(command(), "client"), (error) => error.status === 422 && error.retryable === false);
  const mismatch = new AlpacaPaperClient({ keyId: "key", secretKey: "secret", fetcher: async () => Response.json(rawOrder("other")) });
  await assert.rejects(() => mismatch.submitMoo(command(), "client"), /SCHEMA_INVALID/);
  const liveHostSource = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/alpaca-paper.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(liveHostSource, /https:\/\/api\.alpaca\.markets/);
});

test("oversized Alpaca responses are rejected while streaming", async () => {
  const oversized = new AlpacaPaperClient({
    keyId: "key",
    secretKey: "secret",
    fetcher: async () => new Response("x".repeat(128_001), { status: 200 }),
  });
  await assert.rejects(
    () => oversized.submitMoo(command(), "client"),
    (error) => error instanceof AlpacaPaperApiError && error.message === "ALPACA_PAPER_RESPONSE_TOO_LARGE" && error.retryable === false,
  );
});
