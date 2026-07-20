import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildScheduledPreopenCapture,
  createD1ScheduledCaptureStore,
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
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T13:24:00Z")), "preopen");
  assert.equal(scheduledCapturePhase(Date.parse("2026-01-20T14:24:00Z")), "preopen");
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T13:31:00Z")), "outcome");
  assert.equal(scheduledCapturePhase(Date.parse("2026-01-20T14:31:00Z")), "outcome");
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-20T14:25:00Z")), null);
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-19T13:25:00Z")), null);
  assert.equal(scheduledCapturePhase(Date.parse("2026-07-17T13:24:00Z")), "preopen");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T08:05:00Z")), "OVERNIGHT");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T09:30:00Z")), "T-4H");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T12:30:00Z")), "T-1H");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:00:00Z")), "T-30M");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:24:00Z")), "T-5M");
  assert.equal(scheduledCaptureCheckpoint(Date.parse("2026-07-20T13:25:00Z")), null);
});

test("the deployed Worker configuration uses one DST-safe Monday-Friday trigger", async () => {
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /crons:\s*\["\* 8-14 \* \* MON-FRI"\]/);
  assert.doesNotMatch(vite, /\* \* [1-5](?:\D|$)/);
});

test("preopen capture matches point-in-time gates and produces a non-actionable T-5 research snapshot", () => {
  const at = Date.parse("2026-07-20T13:24:30Z");
  const capture = buildScheduledPreopenCapture(market(at), forecast(at), at);
  assert.ok(capture);
  assert.equal(capture.plan, null);
  assert.equal(capture.snapshot.intervalLabel, "T-5M");
  assert.equal(capture.snapshot.capturedAt, at);
  assert.match(capture.snapshot.factorsJson, /cloudflare_cron/);
  assert.match(capture.snapshot.factorsJson, /NON_ACTIONABLE_UNTIL_A_SEPARATE_MOO_MODEL_IS_VALIDATED/);
});

test("stale, missing, holiday, and future/out-of-order market inputs cannot create a plan", () => {
  const at = Date.parse("2026-07-20T13:24:30Z");
  assert.equal(buildScheduledPreopenCapture(market(at, { freshness: { history: { stale: true } } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { freshness: { history: { stale: false, fetchedAt: new Date(at - 10 * 60_000).toISOString(), latestMinuteObservedAt: new Date(at - 60_000).toISOString() } } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { targetSession: { evidenceQualified: false } }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { checkedAt: new Date(at - 10 * 60_000).toISOString() }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { checkedAt: new Date(at + 60_000).toISOString() }), forecast(at), at), null);
  assert.equal(buildScheduledPreopenCapture(market(at, { session: "CLOSED", targetDate: "2026-07-21" }), forecast(at), at), null);
});

test("a stale Finnhub quote falls back to a fresh completed provider candle", () => {
  const at = Date.parse("2026-07-20T13:24:30Z");
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

test("all unattended checkpoints persist research snapshots without manufacturing Library plans", async () => {
  const times = [
    ["2026-07-20T08:05:00Z", "OVERNIGHT"],
    ["2026-07-20T09:30:00Z", "T-4H"],
    ["2026-07-20T12:30:00Z", "T-1H"],
    ["2026-07-20T13:00:00Z", "T-30M"],
    ["2026-07-20T13:24:00Z", "T-5M"],
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
    assert.equal(saved[0].plan, null);
  }
});

test("runner retries the freeze each minute while persistent inserts remain store-idempotent", async () => {
  const at = Date.parse("2026-07-20T13:24:30Z");
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
  assert.equal(calls, 0, "monitoring-only/holiday time must not wake provider endpoints");
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
  assert.equal(attached[0].actualOpen, null);
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

test("the D1 store persists a completed first-minute outcome without an official open", async () => {
  class Statement {
    constructor(database, sql) {
      this.database = database;
      this.sql = sql;
      this.values = [];
    }
    bind(...values) {
      this.values = values;
      return this;
    }
    async all() {
      if (/PRAGMA table_info\(forecast_snapshots\)/i.test(this.sql)) {
        return { results: [...this.database.snapshotColumns].map((name) => ({ name })) };
      }
      return { results: [] };
    }
    async run() {
      const added = this.sql.match(/ALTER TABLE forecast_snapshots ADD COLUMN (\w+)/i)?.[1];
      if (added) this.database.snapshotColumns.add(added);
      return { meta: { changes: 0 } };
    }
  }
  class InMemoryD1 {
    constructor() {
      this.snapshots = new Map();
      this.libraryPlans = new Map();
      this.snapshotColumns = new Set([
        "first_minute_close",
        "first_minute_error",
        "outcome_captured_at",
      ]);
    }
    prepare(sql) {
      return new Statement(this, sql);
    }
    async batch(statements) {
      return statements.map((statement) => {
        if (/INSERT INTO library_plans/i.test(statement.sql)) {
          const [date, signal] = statement.values;
          if (this.libraryPlans.has(date)) return { meta: { changes: 0 } };
          this.libraryPlans.set(date, {
            date,
            signal,
            actualOpen: null,
            firstMinuteClose: null,
            updatedAt: statement.values.at(-1),
          });
          return { meta: { changes: 1 } };
        }
        if (/UPDATE library_plans SET/i.test(statement.sql)) {
          const [actualOpen, firstMinuteClose, updatedAt, date] = statement.values;
          const plan = this.libraryPlans.get(date);
          if (!plan) return { meta: { changes: 0 } };
          const hasNewOfficial = actualOpen != null && plan.actualOpen == null;
          const hasNewFirstMinute = firstMinuteClose != null && plan.firstMinuteClose == null;
          if (!hasNewOfficial && !hasNewFirstMinute) return { meta: { changes: 0 } };
          if (hasNewOfficial) plan.actualOpen = actualOpen;
          if (hasNewFirstMinute) plan.firstMinuteClose = firstMinuteClose;
          plan.updatedAt = updatedAt;
          return { meta: { changes: 1 } };
        }
        if (/INSERT INTO forecast_snapshots/i.test(statement.sql)) {
          const [targetDate, capturedAt, intervalLabel, baseMedian, adjustedMedian,
            adjustedLow, adjustedHigh, factorsJson] = statement.values;
          const key = `${targetDate}:${intervalLabel}`;
          if (this.snapshots.has(key)) return { meta: { changes: 0 } };
          this.snapshots.set(key, {
            targetDate, capturedAt, intervalLabel, baseMedian, adjustedMedian,
            adjustedLow, adjustedHigh, factorsJson, actualOpen: null,
            medianError: null, firstMinuteClose: null, firstMinuteError: null,
            outcomeCapturedAt: null,
          });
          return { meta: { changes: 1 } };
        }
        if (/UPDATE forecast_snapshots SET/i.test(statement.sql)) {
          const [actualOpen, , actualForError, firstMinuteClose, , firstMinuteForError,
            outcomeCapturedAt, targetDate] = statement.values;
          let changes = 0;
          for (const snapshot of this.snapshots.values()) {
            if (snapshot.targetDate !== targetDate) continue;
            const hasNewOfficial = actualOpen != null && snapshot.actualOpen == null;
            const hasNewFirstMinute = firstMinuteClose != null && snapshot.firstMinuteClose == null;
            if (!hasNewOfficial && !hasNewFirstMinute) continue;
            if (hasNewOfficial) {
              snapshot.actualOpen = actualOpen;
              snapshot.medianError = Math.abs(actualForError - snapshot.adjustedMedian);
            }
            if (hasNewFirstMinute) {
              snapshot.firstMinuteClose = firstMinuteClose;
              snapshot.firstMinuteError = Math.abs(firstMinuteForError - snapshot.adjustedMedian);
            }
            snapshot.outcomeCapturedAt ??= outcomeCapturedAt;
            changes += 1;
          }
          return { meta: { changes } };
        }
        return { meta: { changes: 0 } };
      });
    }
  }

  const database = new InMemoryD1();
  const store = createD1ScheduledCaptureStore(database);
  const capturedAt = Date.parse("2026-07-20T13:24:00Z");
  await store.savePreopen({
    date: "2026-07-20",
    signal: "WAIT",
    openRangeLow: 199,
    openRangeHigh: 203,
    entry: null,
    stop: null,
    target: null,
    expectedMove: 2,
    confidence: 0,
    rationale: "Persistence fixture",
  }, {
    targetDate: "2026-07-20",
    intervalLabel: "T-5M",
    capturedAt,
    baseMedian: 200,
    adjustedMedian: 201,
    adjustedLow: 199,
    adjustedHigh: 203,
    factorsJson: "{}",
  });

  const outcomeAt = Date.parse("2026-07-20T13:32:00Z");
  const changes = await store.attachOutcome({
    targetDate: "2026-07-20",
    actualOpen: null,
    firstMinuteClose: 201.35,
    capturedAt: outcomeAt,
  });
  const saved = database.snapshots.get("2026-07-20:T-5M");
  const savedPlan = database.libraryPlans.get("2026-07-20");
  assert.equal(changes, 2);
  assert.equal(saved.actualOpen, null);
  assert.equal(saved.firstMinuteClose, 201.35);
  assert.ok(Math.abs(saved.firstMinuteError - 0.35) < 1e-9);
  assert.equal(saved.outcomeCapturedAt, outcomeAt);
  assert.equal(savedPlan.actualOpen, null);
  assert.equal(savedPlan.firstMinuteClose, 201.35);
  assert.equal(savedPlan.updatedAt, outcomeAt);

  const duplicateChanges = await store.attachOutcome({
    targetDate: "2026-07-20",
    actualOpen: null,
    firstMinuteClose: 201.35,
    capturedAt: outcomeAt + 60_000,
  });
  assert.equal(duplicateChanges, 0, "outcome attachment remains idempotent");
  assert.equal(savedPlan.updatedAt, outcomeAt, "a retry does not rewrite the Library timestamp");
});
