import assert from "node:assert/strict";
import test from "node:test";

import worker, {
  CAPTURE_SCHEDULER_RESPONSE_TIMEOUT_MS,
  sendCaptureTrigger,
  validateCaptureSchedulerEnv,
} from "../src/index.ts";
import { CAPTURE_TRIGGER_BODY, verifyCaptureSchedulerRequest } from "../src/auth.ts";

const NOW = Date.parse("2026-07-22T13:24:10Z");
const URL = "https://app.test/api/internal/scheduled-capture";
const AUDIENCE = "aperture-sites-capture-scheduler";
const SECRET = "capture-scheduler-secret-at-least-32-bytes-long";
const env = {
  CAPTURE_SCHEDULER_URL: URL,
  CAPTURE_SCHEDULER_SECRET: SECRET,
  CAPTURE_SCHEDULER_AUDIENCE: AUDIENCE,
  SITES_ACCESS_BYPASS_TOKEN: "sites-access-bypass-token",
};

test("scheduler sends only the fixed signed trigger and the Sites access credential", async () => {
  let received;
  const result = await sendCaptureTrigger(env, {
    now: NOW,
    nonce: "worker0123456789abcdef01234567",
    fetcher: async (url, init) => {
      received = { url, init };
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(received.url, URL);
  assert.equal(received.init.body, CAPTURE_TRIGGER_BODY);
  assert.equal(received.init.redirect, "manual");
  assert.ok(received.init.signal instanceof AbortSignal);
  assert.equal(CAPTURE_SCHEDULER_RESPONSE_TIMEOUT_MS, 30_000);
  assert.equal(received.init.headers.get("OAI-Sites-Authorization"), "Bearer sites-access-bypass-token");
  const request = new Request(received.url, received.init);
  const verified = await verifyCaptureSchedulerRequest({
    request,
    secret: SECRET,
    audience: AUDIENCE,
    nonces: { rememberOnce: async () => true },
    now: NOW,
  });
  assert.equal(verified.ok, true);
  assert.equal(JSON.parse(CAPTURE_TRIGGER_BODY).scheduledTime, undefined);
});

test("scheduler rejects redirects and nonexact or insecure production targets", async () => {
  await assert.rejects(() => sendCaptureTrigger(env, {
    now: NOW,
    nonce: "redirect0123456789abcdef012345",
    fetcher: async () => new Response(null, { status: 302, headers: { location: "https://other.test" } }),
  }), /REDIRECT_REJECTED/);
  assert.throws(() => validateCaptureSchedulerEnv({ ...env, CAPTURE_SCHEDULER_URL: "https://app.test/api/internal/scheduled-capture?at=1" }), /URL_INVALID/);
  assert.throws(() => validateCaptureSchedulerEnv({ ...env, CAPTURE_SCHEDULER_URL: "http://app.test/api/internal/scheduled-capture" }), /URL_INVALID/);
});

test("the standalone Worker exposes no public control endpoint", async () => {
  const response = await worker.fetch(new Request("https://scheduler.test/"), env, {});
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "SCHEDULED_ONLY" });
});
