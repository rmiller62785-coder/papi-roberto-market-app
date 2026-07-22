import assert from "node:assert/strict";
import test from "node:test";

import { PaperBrokerRepository } from "../src/storage.ts";
import { memoryStorage, NOW } from "./helpers.mjs";

test("command identity is durable, idempotent, and conflict detecting", () => {
  const repository = new PaperBrokerRepository(memoryStorage(), () => NOW);
  repository.initializeSchema();
  const input = { idempotencyKey: "idem-0001", commandId: "command-0001", intentId: "intent-0001", requestHash: "hash-1", clientOrderId: "client-1", at: NOW };
  assert.equal(repository.beginCommand(input).state, "CREATED");
  assert.equal(repository.beginCommand(input).state, "EXISTING");
  assert.equal(repository.beginCommand({ ...input, requestHash: "hash-2" }).state, "CONFLICT");
  assert.equal(repository.health().commands.total, 1);
});

test("ambiguous and terminal command states survive repository restart", () => {
  const storage = memoryStorage();
  const first = new PaperBrokerRepository(storage, () => NOW); first.initializeSchema();
  first.beginCommand({ idempotencyKey: "idem-0001", commandId: "command-0001", intentId: "intent-0001", requestHash: "hash", clientOrderId: "client", at: NOW });
  first.updateCommand("idem-0001", { status: "AMBIGUOUS", errorCode: "TIMEOUT", retryAfter: NOW + 15_000, at: NOW });
  const restarted = new PaperBrokerRepository(storage, () => NOW + 1);
  assert.equal(restarted.command("idem-0001").status, "AMBIGUOUS");
  restarted.updateCommand("idem-0001", { status: "SUBMITTED", providerOrderId: "provider", responseJson: "{}", at: NOW + 1 });
  assert.equal(first.command("idem-0001").status, "SUBMITTED");
});

test("order events and fills are append-only, duplicate-safe, and quarantine identity conflicts", () => {
  const repository = new PaperBrokerRepository(memoryStorage(), () => NOW); repository.initializeSchema();
  const event = {
    eventKey: "event-1", providerOrderId: "order-1", clientOrderId: "client-1", eventType: "partial_fill",
    providerAt: NOW, receivedAt: NOW + 1, processedAt: NOW + 2, source: "TRADE_UPDATES",
    payloadHash: "hash-1", payload: "{\"event\":1}",
  };
  assert.equal(repository.appendOrderEvent(event), "CREATED");
  assert.equal(repository.appendOrderEvent(event), "EXISTS_IDENTICAL");
  assert.equal(repository.appendOrderEvent({ ...event, payloadHash: "hash-2", payload: "{\"event\":2}" }), "CONFLICT");
  const fill = {
    executionId: "execution-1", providerOrderId: "order-1", clientOrderId: "client-1", quantity: "1", price: "201.1234",
    providerAt: NOW, receivedAt: NOW + 1, processedAt: NOW + 2, payloadHash: "fill-hash-1", payload: "{\"fill\":1}",
  };
  assert.equal(repository.appendFill(fill), "CREATED");
  assert.equal(repository.appendFill(fill), "EXISTS_IDENTICAL");
  assert.equal(repository.appendFill({ ...fill, price: "999", payloadHash: "fill-hash-2" }), "CONFLICT");
  assert.deepEqual(repository.health(), {
    commands: { total: 0, ambiguous: 0, submitted: 0, rejected: 0 },
    orderEvents: 1, fills: 1, quarantined: 2,
  });
});

test("nonce consumption is atomic and expiry aware", async () => {
  let now = NOW;
  const repository = new PaperBrokerRepository(memoryStorage(), () => now); repository.initializeSchema();
  assert.equal(await repository.rememberOnce("nonce", NOW + 10), true);
  assert.equal(await repository.rememberOnce("nonce", NOW + 10), false);
  now = NOW + 11;
  assert.equal(await repository.rememberOnce("nonce", NOW + 20), true);
});
