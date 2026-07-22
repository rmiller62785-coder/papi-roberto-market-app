import assert from "node:assert/strict";
import test from "node:test";

import { handleScheduledCapturePost } from "../../../app/api/internal/scheduled-capture/handler.ts";
import { CAPTURE_TRIGGER_BODY, signCaptureSchedulerRequest } from "../src/auth.ts";

const NOW = Date.parse("2026-07-22T13:24:10.123Z");
const MINUTE = Date.parse("2026-07-22T13:24:00Z");
const URL = "https://app.test/api/internal/scheduled-capture";
const AUDIENCE = "aperture-sites-capture-scheduler";
const SECRET = "capture-scheduler-secret-at-least-32-bytes-long";

async function request(body = CAPTURE_TRIGGER_BODY, nonce = "route0123456789abcdef012345678") {
  const headers = await signCaptureSchedulerRequest({
    secret: SECRET,
    audience: AUDIENCE,
    timestamp: NOW,
    nonce,
    method: "POST",
    url: URL,
    body,
  });
  return new Request(URL, { method: "POST", headers, body });
}

async function requestAt(timestamp, nonce) {
  const headers = await signCaptureSchedulerRequest({
    secret: SECRET,
    audience: AUDIENCE,
    timestamp,
    nonce,
    method: "POST",
    url: URL,
    body: CAPTURE_TRIGGER_BODY,
  });
  return new Request(URL, { method: "POST", headers, body: CAPTURE_TRIGGER_BODY });
}

function harness() {
  const admitted = new Set();
  const calls = { ensure: [], capture: [], archive: [], fetch: [] };
  const dependencies = {
    requireSchema: async () => {},
    ensureSchema: async (_database, readyAt) => { calls.ensure.push(readyAt); },
    rememberOnce: async (_database, nonce) => {
      if (admitted.has(nonce)) return false;
      admitted.add(nonce);
      return true;
    },
    runCapture: async (input) => {
      calls.capture.push(input);
      return { phase: "preopen", status: "captured", targetDate: "2026-07-22" };
    },
    archivePrefix: async (input) => {
      calls.archive.push(input);
      return { status: "EMPTY", segmentId: null, objectKey: null, rowCount: 0, fromSequence: null, toSequence: null };
    },
  };
  const runtime = {
    DB: {},
    ARCHIVE: {},
    CAPTURE_SCHEDULER_SECRET: SECRET,
    CAPTURE_SCHEDULER_AUDIENCE: AUDIENCE,
  };
  const fetchApp = async (path) => {
    calls.fetch.push(path);
    return Response.json({});
  };
  return { admitted, calls, dependencies, runtime, fetchApp };
}

test("private route derives the current minute server-side and keeps archive work off a capture request", async () => {
  const h = harness();
  const response = await handleScheduledCapturePost(await request(), h.runtime, {
    now: NOW,
    fetchApp: h.fetchApp,
    dependencies: h.dependencies,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.scheduledTime, MINUTE);
  assert.equal(h.calls.ensure[0], NOW);
  assert.equal(h.calls.capture.length, 1);
  assert.equal(h.calls.capture[0].scheduledTime, MINUTE);
  assert.equal(h.calls.capture[0].nowMs, NOW);
  assert.equal(h.calls.capture[0].fetchApp, h.fetchApp);
  assert.equal(h.calls.archive.length, 0);
  assert.deepEqual(payload.archive, []);
});

test("a phase-null daytime heartbeat leaves archive maintenance off the live-ingestion path", async () => {
  const h = harness();
  h.dependencies.runCapture = async (input) => {
    h.calls.capture.push(input);
    return { phase: null, status: "skipped", reason: "outside Eastern capture windows" };
  };
  const response = await handleScheduledCapturePost(await request(), h.runtime, {
    now: NOW,
    fetchApp: h.fetchApp,
    dependencies: h.dependencies,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(h.calls.capture.length, 1);
  assert.equal(h.calls.archive.length, 0);
  assert.deepEqual(payload.archive, []);
});

test("an off-hours phase-null heartbeat archives exactly one bounded segment", async () => {
  const h = harness();
  h.dependencies.runCapture = async (input) => {
    h.calls.capture.push(input);
    return { phase: null, status: "skipped", reason: "outside Eastern capture windows" };
  };
  const offHours = Date.parse("2026-07-23T00:05:10.123Z"); // 20:05 ET
  const response = await handleScheduledCapturePost(
    await requestAt(offHours, "archive0123456789abcdef012345678"),
    h.runtime,
    { now: offHours, fetchApp: h.fetchApp, dependencies: h.dependencies },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(h.calls.archive.length, 1);
  assert.equal(h.calls.archive[0].sealedAt, Date.parse("2026-07-23T00:05:00Z"));
  assert.equal(h.calls.archive[0].maximumRows, 500);
  assert.equal(payload.archive.length, 1);
});

test("signed attempts to select a historical time fail before orchestration", async () => {
  const h = harness();
  const body = JSON.stringify({ schemaVersion: "aperture-capture-trigger-v1", scheduledTime: 0 });
  const response = await handleScheduledCapturePost(await request(body, "historical0123456789abcdef0123"), h.runtime, {
    now: NOW,
    fetchApp: h.fetchApp,
    dependencies: h.dependencies,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "CAPTURE_SCHEDULER_PAYLOAD_INVALID" });
  assert.equal(h.calls.ensure.length, 0);
  assert.equal(h.calls.capture.length, 0);
  assert.equal(h.calls.archive.length, 0);
});

test("production bridge does not pin capture time before internal market normalization", async () => {
  const h = harness();
  const liveNow = Date.now();
  const response = await handleScheduledCapturePost(
    await requestAt(liveNow, "production0123456789abcdef012345"),
    h.runtime,
    { fetchApp: h.fetchApp, dependencies: h.dependencies },
  );
  assert.equal(response.status, 200);
  assert.equal(h.calls.capture.length, 1);
  assert.equal(h.calls.capture[0].nowMs, undefined);
});

test("an authenticated trigger nonce is consumed exactly once", async () => {
  const h = harness();
  const original = await request();
  const first = await handleScheduledCapturePost(original.clone(), h.runtime, { now: NOW, fetchApp: h.fetchApp, dependencies: h.dependencies });
  const replay = await handleScheduledCapturePost(original, h.runtime, { now: NOW, fetchApp: h.fetchApp, dependencies: h.dependencies });
  assert.equal(first.status, 200);
  assert.equal(replay.status, 409);
  assert.deepEqual(await replay.json(), { error: "CAPTURE_SCHEDULER_AUTH_REPLAY" });
  assert.equal(h.calls.capture.length, 1);
});
