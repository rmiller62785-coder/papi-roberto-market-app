import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPTURE_SCHEDULER_MAX_SKEW_MS,
  CAPTURE_TRIGGER_BODY,
  isCaptureTriggerBody,
  signCaptureSchedulerRequest,
  verifyCaptureSchedulerRequest,
} from "../src/auth.ts";

const NOW = Date.parse("2026-07-22T13:24:10Z");
const URL = "https://app.test/api/internal/scheduled-capture";
const AUDIENCE = "aperture-sites-capture-scheduler";
const SECRET = "capture-scheduler-secret-at-least-32-bytes-long";

class MemoryNonces {
  values = new Set();
  async rememberOnce(value) {
    if (this.values.has(value)) return false;
    this.values.add(value);
    return true;
  }
}

async function signedRequest({
  body = CAPTURE_TRIGGER_BODY,
  nonce = "0123456789abcdef0123456789abcdef",
  timestamp = NOW,
  url = URL,
  audience = AUDIENCE,
} = {}) {
  const headers = await signCaptureSchedulerRequest({
    secret: SECRET,
    audience,
    timestamp,
    nonce,
    method: "POST",
    url,
    body,
  });
  return new Request(url, { method: "POST", headers, body });
}

test("capture scheduler HMAC binds audience, authority, path, body, timestamp, and nonce", async () => {
  const verified = await verifyCaptureSchedulerRequest({
    request: await signedRequest(),
    secret: SECRET,
    audience: AUDIENCE,
    nonces: new MemoryNonces(),
    now: NOW,
  });
  assert.deepEqual(verified, { ok: true, body: CAPTURE_TRIGGER_BODY });

  const original = await signedRequest({ nonce: "authority0123456789abcdef" });
  const authorityTamper = new Request("https://other.test/api/internal/scheduled-capture", {
    method: "POST",
    headers: original.headers,
    body: CAPTURE_TRIGGER_BODY,
  });
  assert.deepEqual(await verifyCaptureSchedulerRequest({
    request: authorityTamper,
    secret: SECRET,
    audience: AUDIENCE,
    nonces: new MemoryNonces(),
    now: NOW,
  }), { ok: false, reason: "SIGNATURE_INVALID" });

  const signed = await signedRequest({ nonce: "bodytamper0123456789abcdef" });
  const bodyTamper = new Request(URL, { method: "POST", headers: signed.headers, body: "{}" });
  assert.deepEqual(await verifyCaptureSchedulerRequest({
    request: bodyTamper,
    secret: SECRET,
    audience: AUDIENCE,
    nonces: new MemoryNonces(),
    now: NOW,
  }), { ok: false, reason: "SIGNATURE_INVALID" });
});

test("capture scheduler auth rejects replay, stale, wrong-audience, and oversized requests", async () => {
  const nonces = new MemoryNonces();
  const request = await signedRequest();
  assert.equal((await verifyCaptureSchedulerRequest({ request: request.clone(), secret: SECRET, audience: AUDIENCE, nonces, now: NOW })).ok, true);
  assert.deepEqual(await verifyCaptureSchedulerRequest({ request, secret: SECRET, audience: AUDIENCE, nonces, now: NOW }),
    { ok: false, reason: "REPLAY" });

  const stale = await signedRequest({ timestamp: NOW - CAPTURE_SCHEDULER_MAX_SKEW_MS - 1, nonce: "stale0123456789abcdef" });
  assert.deepEqual(await verifyCaptureSchedulerRequest({ request: stale, secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "STALE" });

  const wrongAudience = await signedRequest({ audience: "another-scheduler-audience", nonce: "audience0123456789abcdef" });
  assert.deepEqual(await verifyCaptureSchedulerRequest({ request: wrongAudience, secret: SECRET, audience: AUDIENCE, nonces: new MemoryNonces(), now: NOW }),
    { ok: false, reason: "AUDIENCE_INVALID" });

  const oversized = await signedRequest({ body: JSON.stringify({ schemaVersion: "x", padding: "x".repeat(300) }), nonce: "oversized0123456789abcdef" })
    .catch((error) => error);
  assert.match(String(oversized), /CAPTURE_SCHEDULER_BODY_TOO_LARGE/);
});

test("the only admitted trigger schema contains no caller-selected time", () => {
  assert.equal(isCaptureTriggerBody(CAPTURE_TRIGGER_BODY), true);
  assert.equal(isCaptureTriggerBody(JSON.stringify({ schemaVersion: "aperture-capture-trigger-v1", scheduledTime: 0 })), false);
  assert.equal(isCaptureTriggerBody(JSON.stringify({ schemaVersion: "aperture-capture-trigger-v1", targetDate: "2020-01-01" })), false);
  assert.equal(isCaptureTriggerBody("not-json"), false);
  assert.equal(CAPTURE_TRIGGER_BODY.includes("scheduled"), false);
});
