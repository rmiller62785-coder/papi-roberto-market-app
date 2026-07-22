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
