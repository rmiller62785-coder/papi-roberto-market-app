import assert from "node:assert/strict";
import test from "node:test";

import { signPaperCommand } from "../src/auth.ts";
import { AlpacaPaperApiError } from "../src/alpaca-paper.ts";
import { deterministicClientOrderId } from "../src/contracts.ts";
import { PaperBrokerCoordinator } from "../src/index.ts";
import { alpacaOrder, AUDIENCE, command, environment, memoryStorage, NOW, SECRET } from "./helpers.mjs";

function context() {
  return { storage: memoryStorage(), blockConcurrencyWhile(callback) { return callback(); } };
}

let nonceIndex = 0;
async function request(body, now = NOW, path = "/commands") {
  nonceIndex += 1;
  const payload = path === "/health" ? "" : JSON.stringify(body);
  const method = path === "/health" ? "GET" : "POST";
  const url = `https://broker.test${path}`;
  const headers = await signPaperCommand({ secret: SECRET, audience: AUDIENCE, timestamp: now, nonce: `nonce${String(nonceIndex).padStart(27, "0")}`, method, url, body: payload });
  return new Request(url, { method, headers, ...(method === "POST" ? { body: payload } : {}) });
}

test("disabled-by-default service authenticates but records and submits nothing", async () => {
  let calls = 0;
  const client = { async getByClientOrderId() { calls += 1; }, async submitMoo() { calls += 1; } };
  const coordinator = new PaperBrokerCoordinator(context(), environment(), { client, now: () => NOW });
  const response = await coordinator.fetch(await request(command()));
  assert.equal(response.status, 423);
  assert.equal((await response.json()).error, "PAPER_ORDER_SUBMISSION_DISABLED");
  assert.equal(calls, 0);
  const health = await coordinator.fetch(await request(null, NOW, "/health"));
  const payload = await health.json();
  assert.equal(payload.submissionEnabled, false);
  assert.equal(payload.automaticSubmission, false);
  assert.equal(payload.tradeUpdates, "NOT_CONNECTED");
  assert.equal(payload.commands.total, 0);
});

test("enabled service reconciles first, submits once, and returns idempotent terminal state", async () => {
  const expectedClientId = await deterministicClientOrderId(command());
  let gets = 0;
  let submits = 0;
  const client = {
    async getByClientOrderId(clientId) { gets += 1; assert.equal(clientId, expectedClientId); return null; },
    async submitMoo(_command, clientId) { submits += 1; return alpacaOrder({ clientOrderId: clientId }); },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => NOW });
  const first = await coordinator.fetch(await request(command()));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).ok, true);
  const duplicate = await coordinator.fetch(await request(command()));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).idempotent, true);
  assert.equal(gets, 1);
  assert.equal(submits, 1);
});

test("concurrent identical commands share one persisted submission flight", async () => {
  let releaseLookup;
  const lookupGate = new Promise((resolve) => { releaseLookup = resolve; });
  let lookupStarted;
  const started = new Promise((resolve) => { lookupStarted = resolve; });
  let gets = 0;
  let submits = 0;
  const client = {
    async getByClientOrderId() { gets += 1; lookupStarted(); await lookupGate; return null; },
    async submitMoo(_command, clientId) { submits += 1; return alpacaOrder({ clientOrderId: clientId }); },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => NOW });
  const first = coordinator.fetch(await request(command()));
  await started;
  const concurrent = await coordinator.fetch(await request(command()));
  assert.equal(concurrent.status, 202);
  assert.equal((await concurrent.json()).ambiguous, true);
  releaseLookup();
  assert.equal((await first).status, 200);
  assert.equal(gets, 1);
  assert.equal(submits, 1);
});

test("the in-flight lease outlives the full reconciliation plus submission timeout budget", async () => {
  let now = NOW;
  let releaseLookup;
  const lookupGate = new Promise((resolve) => { releaseLookup = resolve; });
  let lookupStarted;
  const started = new Promise((resolve) => { lookupStarted = resolve; });
  let gets = 0;
  let submits = 0;
  const client = {
    async getByClientOrderId() {
      gets += 1;
      lookupStarted();
      await lookupGate;
      return null;
    },
    async submitMoo(_command, clientId) { submits += 1; return alpacaOrder({ clientOrderId: clientId }); },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => now });
  const first = coordinator.fetch(await request(command(), now));
  await started;
  now += 16_000;
  const concurrent = await coordinator.fetch(await request(command(), now));
  assert.equal(concurrent.status, 202);
  assert.equal((await concurrent.json()).ambiguous, true);
  assert.equal(gets, 1, "a second reconciliation flight must not start inside the lease");
  assert.equal(submits, 0);
  releaseLookup();
  assert.equal((await first).status, 200);
  assert.equal(gets, 1);
  assert.equal(submits, 1);
});

test("same idempotency key with changed command content is rejected without a second order", async () => {
  let submits = 0;
  const client = {
    async getByClientOrderId() { return null; },
    async submitMoo(_command, clientId) { submits += 1; return alpacaOrder({ clientOrderId: clientId }); },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => NOW });
  assert.equal((await coordinator.fetch(await request(command()))).status, 200);
  const changed = command({ commandId: "command-20260720-0002" });
  const response = await coordinator.fetch(await request(changed));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "IDEMPOTENCY_CONFLICT");
  assert.equal(submits, 1);
});

test("ambiguous submission waits, then reconciles by client ID before any retry", async () => {
  let now = NOW;
  let gets = 0;
  let submits = 0;
  const client = {
    async getByClientOrderId(clientId) {
      gets += 1;
      return gets >= 2 ? alpacaOrder({ clientOrderId: clientId }) : null;
    },
    async submitMoo() {
      submits += 1;
      throw new AlpacaPaperApiError("ALPACA_PAPER_REQUEST_AMBIGUOUS", null, true);
    },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => now });
  const first = await coordinator.fetch(await request(command(), now));
  assert.equal(first.status, 202);
  const immediate = await coordinator.fetch(await request(command(), now));
  assert.equal(immediate.status, 202);
  assert.equal(gets, 1);
  assert.equal(submits, 1);
  now += 16_000;
  const reconciled = await coordinator.fetch(await request(command(), now));
  assert.equal(reconciled.status, 200);
  assert.equal((await reconciled.json()).idempotent, true);
  assert.equal(gets, 2);
  assert.equal(submits, 1);
});

test("invalid, unauthenticated, replayed, and unsupported requests never reach Alpaca", async () => {
  let calls = 0;
  const client = {
    async getByClientOrderId() { calls += 1; return null; },
    async submitMoo(_command, clientOrderId) { calls += 1; return alpacaOrder({ clientOrderId }); },
  };
  const coordinator = new PaperBrokerCoordinator(context(), environment({ PAPER_ORDER_SUBMISSION_ENABLED: "true" }), { client, now: () => NOW });
  assert.equal((await coordinator.fetch(new Request("https://broker.test/commands", { method: "POST", body: "{}" }))).status, 401);
  const invalid = command({ actorEmail: "viewer@example.test" });
  assert.equal((await coordinator.fetch(await request(invalid))).status, 422);
  const replay = await request(command());
  assert.equal((await coordinator.fetch(replay.clone())).status, 200);
  assert.equal((await coordinator.fetch(replay)).status, 409);
  assert.equal((await coordinator.fetch(new Request("https://broker.test/anything"))).status, 404);
  assert.equal(calls, 2, "only the one valid command performs reconciliation and submission");
});
