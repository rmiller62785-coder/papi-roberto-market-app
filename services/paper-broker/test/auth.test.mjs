import assert from "node:assert/strict";
import test from "node:test";

import { signPaperCommand, verifyPaperCommandRequest } from "../src/auth.ts";
import { AUDIENCE, NOW, SECRET } from "./helpers.mjs";

class MemoryNonces {
  values = new Set();
  async rememberOnce(value) {
    if (this.values.has(value)) return false;
    this.values.add(value);
    return true;
  }
}

async function signed(body = "{}", nonce = "0123456789abcdef0123456789abcdef", url = "https://broker.test/commands", timestamp = NOW) {
  const headers = await signPaperCommand({ secret: SECRET, audience: AUDIENCE, timestamp, nonce, method: "POST", url, body });
  return new Request(url, { method: "POST", headers, body });
}

test("paper command HMAC binds authority, path, method, body, audience, timestamp, and nonce", async () => {
  const verified = await verifyPaperCommandRequest({ request: await signed(), secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW });
  assert.deepEqual(verified, { ok: true, body: "{}" });

  const original = await signed();
  const wrongPath = new Request("https://broker.test/health", { method: "POST", headers: original.headers, body: "{}" });
  assert.deepEqual(await verifyPaperCommandRequest({ request: wrongPath, secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "SIGNATURE_INVALID" });

  const tampered = new Request(original.url, { method: "POST", headers: original.headers, body: "{\"qty\":99}" });
  assert.deepEqual(await verifyPaperCommandRequest({ request: tampered, secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "SIGNATURE_INVALID" });
});

test("replay, stale, oversized, malformed, and wrong-audience requests fail closed", async () => {
  const nonces = new MemoryNonces();
  assert.equal((await verifyPaperCommandRequest({ request: await signed(), secret: SECRET, audience: AUDIENCE, nonces, now: NOW })).ok, true);
  assert.deepEqual(await verifyPaperCommandRequest({ request: await signed(), secret: SECRET, audience: AUDIENCE, nonces, now: NOW }),
    { ok: false, reason: "REPLAY" });
  assert.deepEqual(await verifyPaperCommandRequest({ request: await signed("{}", "stale0123456789abcdef", undefined, NOW - 30_001), secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "STALE" });
  assert.deepEqual(await verifyPaperCommandRequest({ request: await signed("123"), secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW, maximumBodyBytes: 2 }),
    { ok: false, reason: "BODY_TOO_LARGE" });
  const wrongAudience = await signPaperCommand({ secret: SECRET, audience: "other-audience", timestamp: NOW, nonce: "audience0123456789", method: "POST", url: "https://broker.test/commands", body: "{}" });
  assert.deepEqual(await verifyPaperCommandRequest({ request: new Request("https://broker.test/commands", { method: "POST", headers: wrongAudience, body: "{}" }), secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "AUDIENCE_INVALID" });
});

test("weak app-owned HMAC secrets are rejected", async () => {
  await assert.rejects(() => signPaperCommand({ secret: "short", audience: AUDIENCE, timestamp: NOW, nonce: "0123456789abcdef", method: "POST", url: "https://broker.test/commands", body: "{}" }), /TOO_SHORT/);
});
