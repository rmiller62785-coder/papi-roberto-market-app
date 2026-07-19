import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildScheduledPreopenCapture,
  runScheduledCapture,
  scheduledCaptureCheckpoint,
  scheduledCapturePhase,
} from "../app/scheduled-capture.ts";

const bar = (time, close, volume = 1000) => ({
  time,
  open: close - 0.05,
  high: close + 0.1,
  low: close - 0.1,
  close,
  volume,
});

function market(at, overrides = {}) {
  const targetDate = "2026-07-20";
  const bars = Array.from({ length: 30 }, (_, index) =>
    bar(at - (30 - index) * 60_000, 200 + index * 0.03),
  );
  return {
    targetDate,
    checkedAt: new Date(at).toISOString(),
    session: "PREMARKET",
    price: bars.at(-1).close,
    previousClose: 199.5,
    bars,
    analysisBars: bars,
    daily: [
      { date: "2026-07-14", dateKey: "2026-07-14", open: 196, high: 199, low: 195, close: 198 },
      { date: "2026-07-15", dateKey: "2026-07-15", open: 198.2, high: 201, low: 197, close: 200 },
      { date: "2026-07-16", dateKey: "2026-07-16", open: 200.1, high: 202, low: 198, close: 201 },
      { date: "2026-07-17", dateKey: "2026-07-17", open: 201.2, high: 203, low: 199, close: 200.5 },
    ],
    firstMinuteHistory: [
      { range: 0.5, volume: 10000 },
      { range: 0.7, volume: 12000 },
      { range: 0.6, volume: 11000 },
    ],
    targetSession: { evidenceQualified: true },
    freshness: {
      quote: {
        observedAt: new Date(at).toISOString(),
        fetchedAt: new Date(at).toISOString(),
        stale: false,
      },
      history: {
        stale: false,
        fetchedAt: new Date(at).toISOString(),
        latestMinuteObservedAt: new Date(at - 60_000).toISOString(),
      },
    },
    premarket: { high: 201.2, low: 199.4, current: 200.8 },
    day: { open: null },
    firstMinute: { close: null, volume: 0, complete: false },
    ...overrides,
  };
}

const forecast = (at) => ({
  computedAt: at,
  methodology: { version: "open-research-v2", state: "RESEARCH_NOT_CALIBRATED" },
  flag: { updatedAt: at },
  adjustment: { directionBps: -10, rangeMultiplier: 1.25 },
  contributions: [{ key: "overnight_futures", applied: true }],
});

test("Eastern capture windows work across daylight-saving offsets", () => {
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T13:25:00Z")), "preopen");
  assert.equal(scheduledCapturePhase(Date.parse("2026-01-20T14:25:00Z")), "preopen");
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T13:31:00Z")), "outcome");
  assert.equal(scheduledCapturePhase(Date.parse("2026-01-20T14:31:00Z")), "outcome");
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T14:25:00Z")), null);
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-19T13:25:00Z")), null);
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-17T13:25:00Z")), "preopen");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T08:05:00Z")), "OVERNIGHT");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T09:30:00Z")), "T-4H");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T12:30:00Z")), "T-1H");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:00:00Z")), "T-30M");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:25:00Z")), "T-5M");
});

test("the deployed Worker configuration uses one DST-safe Monday-Friday trigger", async () => {
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /crons:\s*\["\* 8-14 \* \* MON-FRI"\]/);
  assert.doesNotMatch(vite, /\* \* [1-5](?:\D|$)/);
});

test("preopen capture matches point-in-time gates and produces a frozen T-5 plan", () => {
  const at = Date.parse("2026-07-20T13:25:00Z");
  const capture = buildScheduledPreopenCapture(market(at), forecast(at), at);
  assert.ok(capture);
  assert.equal(capture.plan.date, "2026-07-20");
  assert.equal(capture.snapshot.intervalLabel, "T-5M");
  assert.equal(capture.snapshot.capturedAt, at);
  assert.ok(capture.plan.openRangeLow < capture.plan.openRangeHigh);
  assert.match(capture.snapshot.factorsJson, /cloudflare_cron/);
});

test("stale, missing, holiday, and future/out-of-order market inputs cannot create a plan", () => {
  const at = Date.parse("2026-07-20T13:25:00Z");
  assert.equal(buildScheduledPreopenCapture(market(at, { freshness: { history: { stale: true } } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { freshness: { history: { stale: false, fetchedAt: new Date(at - 10 * 60_000).toISOString(), latestMinuteObservedAt: new Date(at - 60_000).toISOString() } } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { targetSession: { evidenceQualified: false } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { checkedAt: new Date(at - 10 * 60_000).toISOString() }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { checkedAt: new Date(at + 60_000).toISOString() }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { session: "CLOSED", targetDate: "2026-07-21" }), forecast(at), at), null);
});

test("a stale Finnhub quote falls back to a fresh completed provider candle", () => {
  const at = Date.parse("2026-07-20T13:25:00Z");
  const input = market(at, {
    price: 999,
    premarket: { high: 201.2, low: 199.4, current: 999 },
    freshness: {
      quote: {
        observedAt: new Date(at - 60 * 60_000).toISOString(),
        fetchedAt: new Date(at).toISOString(),
        stale: true,
      },
      history: {
        stale: false,
        fetchedAt: new Date(at).toISOString(),
        latestMinuteObservedAt: new Date(at - 60_000).toISOString(),
      },
    },
  });
  const capture = buildScheduledPreopenCapture(input, forecast(at), at);
  assert.ok(capture);
  assert.ok(capture.snapshot.baseMedian < 300, "stale quote must not anchor the open");
});

test("all unattended forecast checkpoints persist while only T-5 creates Library", async () => {
  const times = [
    ["2026-07-20T08:05:00Z", "OVERNIGHT"],
    ["2026-07-20T09:30:00Z", "T-4H"],
    ["2026-07-20T12:30:00Z", "T-1H"],
    ["2026-07-20T13:00:00Z", "T-30M"],
    ["2026-07-20T13:25:00Z", "T-5M"],
  ];
  for (const [iso, label] of times) {
    const at = Date.parse(iso);
    const saved = [];
    const store = {
      async savePreopen(plan, snapshot) { saved.push({ plan, snapshot }); },
      async attachOutcome() { assert.fail("outcome should not run"); return 0; },
    };
    const result = await runScheduledCapture({
      scheduledTime: at,
      nowMs: at,
      fetchApp: async (path) => Response.json(path.startsWith("/api/market") ? market(at) : forecast(at)),
      store,
    });
    assert.equal(result.status, "captured");
    assert.equal(saved[0].snapshot.intervalLabel, label);
    assert.equal(saved[0].plan == null, label !== "T-5M");
  }
});

test("runner retries the freeze each minute while persistent inserts remain store-idempotent", async () => {
  const at = Date.parse("2026-07-20T13:25:00Z");
  const saved = [];
  const fetchPaths = [];
  const store = {
    async savePreopen(plan, snapshot) { saved.push({ plan, snapshot }); },
    async attachOutcome() { assert.fail("outcome should not run"); return 0; },
  };
  const fetchApp = async (path) => {
    fetchPaths.push(path);
    return Response.json(path.startsWith("/api/market") ? market(at) : forecast(at));
  };
  const result = await runScheduledCapture({ scheduledTime: at, nowMs: at, fetchApp, store });
  assert.equal(result.status, "captured");
  assert.equal(saved.length, 1);
  assert.deepEqual(fetchPaths.map((path) => path.split("?")[0]), ["/api/market", "/api/forecast"]);
});

test("holiday/closed response skips all writes and never calls forecast", async () => {
  const at = Date.parse("2026-07-03T13:25:00Z");
  let calls = 0;
  const store = {
    async savePreopen() { assert.fail("holiday must not save"); },
    async attachOutcome() { assert.fail("holiday must not update"); return 0; },
  };
  const result = await runScheduledCapture({
    scheduledTime: at,
    nowMs: at,
    fetchApp: async () => {
      calls += 1;
      return Response.json(market(at, { targetDate: "2026-07-06", session: "CLOSED" }));
    },
    store,
  });
  assert.equal(result.status, "skipped");
  assert.equal(calls, 1);
});

test("outcome window attaches only published, completed opening observations", async () => {
  const at = Date.parse("2026-07-20T13:32:00Z");
  const attached = [];
  const store = {
    async savePreopen() { assert.fail("preopen should not run"); },
    async attachOutcome(value) { attached.push(value); return 2; },
  };
  const result = await runScheduledCapture({
    scheduledTime: at,
    nowMs: at,
    fetchApp: async () => Response.json(market(at, {
      session: "MARKET OPEN",
      day: { open: 201.1 },
      firstMinute: { close: 201.35, volume: 25000, complete: true },
    })),
    store,
  });
  assert.equal(result.status, "outcome_attached");
  assert.equal(attached[0].actualOpen, 201.1);
  assert.equal(attached[0].firstMinuteClose, 201.35);
});

test("outcome is not reported as attached when no pre-open rows exist", async () => {
  const at = Date.parse("2026-07-20T13:32:00Z");
  const result = await runScheduledCapture({
    scheduledTime: at,
    nowMs: at,
    fetchApp: async () => Response.json(market(at, {
      session: "MARKET OPEN",
      day: { open: 201.1 },
      firstMinute: { close: 201.35, volume: 25000, complete: true },
    })),
    store: {
      async savePreopen() { assert.fail("preopen should not run"); },
      async attachOutcome() { return 0; },
    },
  });
  assert.equal(result.status, "skipped");
  assert.match(result.reason, /no pre-open snapshot/i);
});
