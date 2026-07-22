import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createMarketStore,
  MarketSchemaUnavailableError,
  MarketSnapshotConflictError,
} from "../app/market-store.ts";

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

  async run() {
    return this.database.run(this);
  }

  async first() {
    return this.database.first(this);
  }

  async all() {
    return this.database.all(this);
  }
}

class InMemoryD1 {
  constructor() {
    this.rows = new Map();
    this.schemaBatches = 0;
    this.insertBatches = 0;
    this.nonces = new Map();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  async batch(statements) {
    if (statements.every((statement) => /^CREATE /i.test(statement.sql.trim()))) {
      this.schemaBatches += 1;
      return statements.map(() => ({ meta: { changes: 0 } }));
    }
    this.insertBatches += 1;
    return statements.map((statement) => {
      if (/^DELETE FROM market_ingest_nonces/i.test(statement.sql.trim())) {
        let changes = 0;
        for (const [nonce, row] of this.nonces) {
          if (row.expiresAt <= statement.values[0]) {
            this.nonces.delete(nonce);
            changes += 1;
          }
        }
        return { meta: { changes } };
      }
      if (/^INSERT INTO market_ingest_nonces/i.test(statement.sql.trim())) {
        const [nonce, expiresAt, createdAt] = statement.values;
        if (this.nonces.has(nonce)) return { meta: { changes: 0 } };
        this.nonces.set(nonce, { expiresAt, createdAt });
        return { meta: { changes: 1 } };
      }
      const table = statement.sql.match(/INSERT INTO (\w+)/i)?.[1];
      assert.ok(table, `expected INSERT statement, received ${statement.sql}`);
      const id = statement.values[0];
      const key = `${table}:${id}`;
      if (table === "market_session_snapshots") {
        const duplicateWatermark = [...this.rows.entries()].some(([existingKey, row]) =>
          existingKey.startsWith("market_session_snapshots:") &&
          row[1] === statement.values[1] && row[2] === statement.values[2] &&
          row[3] === statement.values[3] && row[4] === statement.values[4] &&
          row[5] === statement.values[5] && row[7] === statement.values[7]);
        if (duplicateWatermark) return { meta: { changes: 0 } };
      }
      if (this.rows.has(key)) return { meta: { changes: 0 } };
      this.rows.set(key, [...statement.values]);
      return { meta: { changes: 1 } };
    });
  }

  async run(statement) {
    if (!/INSERT INTO market_completed_minute_bars/i.test(statement.sql)) {
      throw new Error(`unsupported run: ${statement.sql}`);
    }
    const values = statement.values;
    const provider = values[1];
    const feed = values[2];
    const symbol = values[3];
    const sessionDate = values[4];
    const minuteStart = values[5];
    const payloadHash = values[25];
    const existing = [...this.rows.entries()].filter(([key, row]) =>
      key.startsWith("market_completed_minute_bars:") &&
      row[1] === provider && row[2] === feed && row[3] === symbol &&
      row[4] === sessionDate && row[5] === minuteStart);
    if (existing.some(([, row]) => row[21] === payloadHash)) return { meta: { changes: 0 } };
    const revision = existing.length === 0 ? 0 : Math.max(...existing.map(([, row]) => row[19])) + 1;
    const row = [...values.slice(0, 19), revision, values[24], values[25], values[26]];
    this.rows.set(`market_completed_minute_bars:${row[0]}`, row);
    return { meta: { changes: 1 } };
  }

  async first(statement) {
    if (!/FROM market_session_snapshots/i.test(statement.sql)) throw new Error(`unsupported first: ${statement.sql}`);
    if (/SELECT id,payload_hash/i.test(statement.sql)) {
      const [targetDate, checkpoint, provider, feed, symbol, sourceWatermarkAt] = statement.values;
      const row = [...this.rows.entries()].find(([key, value]) => key.startsWith("market_session_snapshots:") && value[1] === targetDate && value[2] === checkpoint && value[3] === provider && value[4] === feed && value[5] === symbol && value[7] === sourceWatermarkAt)?.[1];
      return row ? { id: row[0], payload_hash: row[13] } : null;
    }
    const [symbol, targetDate, cutoff, checkpoint] = statement.values;
    const candidates = [...this.rows.entries()]
      .filter(([key, row]) => key.startsWith("market_session_snapshots:") && row[5] === symbol && row[1] === targetDate && row[10] <= cutoff && (checkpoint == null || row[2] === checkpoint))
      .map(([, row]) => row)
      .sort((left, right) => right[10] - left[10] || right[6] - left[6]);
    const row = candidates[0];
    if (!row) return null;
    const keys = ["id","target_date","checkpoint","provider","feed","symbol","captured_at","source_watermark_at","received_at","processed_at","available_at","quality_state","payload_json","payload_hash","created_at"];
    return Object.fromEntries(keys.map((key, index) => [key, row[index]]));
  }

  async all(statement) {
    if (/FROM market_completed_minute_bars/i.test(statement.sql)) {
      const [symbol, targetDate, cutoff] = statement.values;
      const limit = statement.values.at(-1);
      const candidates = [...this.rows.entries()]
        .filter(([key, row]) => key.startsWith("market_completed_minute_bars:") && row[3] === symbol && row[4] === targetDate && row[16] <= cutoff)
        .map(([, row]) => row);
      const latest = new Map();
      for (const row of candidates) {
        const key = `${row[1]}:${row[2]}:${row[3]}:${row[4]}:${row[5]}`;
        if (!latest.has(key) || latest.get(key)[19] < row[19]) latest.set(key, row);
      }
      const keys = ["id","provider","feed","symbol","session_date","minute_start","minute_end","open","high","low","close","volume","trade_count","provider_time","received_at","processed_at","available_at","connection_epoch","service_sequence","revision","recovered","payload_hash","created_at"];
      return { results: [...latest.values()].sort((left, right) => left[5] - right[5]).slice(0, limit).map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index]]))) };
    }
    if (/FROM market_qualified_observations/i.test(statement.sql)) {
      const [symbol, targetDate, cutoff] = statement.values;
      const qualification = /observation\.qualification=\?/i.test(statement.sql) ? statement.values[3] : null;
      const invalidationCutoff = statement.values[qualification == null ? 3 : 4];
      const limit = statement.values.at(-1);
      const keys = ["id","provider","feed","symbol","session_date","kind","qualification","entitlement","coverage","price","size","provider_event_id","provider_time","received_at","processed_at","available_at","connection_epoch","service_sequence","payload_hash","created_at"];
      return { results: [...this.rows.entries()].filter(([key, row]) => key.startsWith("market_qualified_observations:") &&
        row[3] === symbol && row[4] === targetDate && row[15] <= cutoff && (qualification == null || row[6] === qualification) &&
        ![...this.rows.entries()].some(([otherKey, invalidation]) => otherKey.startsWith("market_observation_invalidations:") &&
          invalidation[1] === row[1] && invalidation[2] === row[2] && invalidation[3] === row[3] &&
          invalidation[4] === row[11] && invalidation[10] <= invalidationCutoff)).map(([, row]) => row).slice(0, limit)
        .map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index]]))) };
    }
    throw new Error(`unsupported all: ${statement.sql}`);
  }
}

const minuteStart = Date.parse("2026-07-20T13:23:00Z");
const minuteEnd = minuteStart + 60_000;
const receivedAt = minuteEnd + 100;
const processedAt = receivedAt + 100;
const availableAt = processedAt + 100;
const common = {
  provider: "alpaca",
  feed: "iex",
  symbol: "NVDA",
  receivedAt,
  processedAt,
  availableAt,
  createdAt: availableAt,
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function canonicalHash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function observationPayload(row) {
  return { provider:row.provider,feed:row.feed,symbol:row.symbol,sessionDate:row.sessionDate,kind:row.kind,qualification:row.qualification,entitlement:row.entitlement,coverage:row.coverage,price:row.price,size:row.size,providerEventId:row.providerEventId,providerTime:row.providerTime,receivedAt:row.receivedAt,processedAt:row.processedAt,availableAt:row.availableAt,connectionEpoch:row.connectionEpoch,serviceSequence:row.serviceSequence };
}

function minutePayload(row) {
  return { provider:row.provider,feed:row.feed,symbol:row.symbol,sessionDate:row.sessionDate,minuteStart:row.minuteStart,minuteEnd:row.minuteEnd,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume,tradeCount:row.tradeCount,providerTime:row.providerTime,receivedAt:row.receivedAt,processedAt:row.processedAt,availableAt:row.availableAt,connectionEpoch:row.connectionEpoch,serviceSequence:row.serviceSequence,recovered:row.recovered };
}

function batchFixture() {
  const snapshotPayload = { lastCompletedMinute: minuteStart, source: "alpaca_iex" };
  const fixture = {
    sourceStates: [{
      ...common,
      id: "state:alpaca:iex:NVDA:1",
      state: "CURRENT",
      entitlement: "ENTITLED",
      coverage: "SINGLE_EXCHANGE_IEX",
      observedAt: minuteEnd,
      checkedAt: processedAt,
      connectionEpoch: "epoch-1",
      serviceSequence: 1,
      detailCode: null,
    }],
    observations: [{
      ...common,
      id: "observation:alpaca:iex:NVDA:1",
      sessionDate: "2026-07-20",
      kind: "TRADE",
      qualification: "RESEARCH",
      entitlement: "ENTITLED",
      coverage: "SINGLE_EXCHANGE_IEX",
      price: 201.25,
      size: 100,
      providerEventId: "trade-1",
      providerTime: minuteEnd,
      connectionEpoch: "epoch-1",
      serviceSequence: 2,
      payloadHash: "pending",
    }],
    completedMinuteBars: [{
      ...common,
      id: "minute:alpaca:iex:NVDA:1784553780000:0",
      sessionDate: "2026-07-20",
      minuteStart,
      minuteEnd,
      open: 201,
      high: 201.5,
      low: 200.9,
      close: 201.25,
      volume: 5_000,
      tradeCount: 40,
      providerTime: minuteStart,
      connectionEpoch: "epoch-1",
      serviceSequence: 3,
      revision: 0,
      recovered: false,
      payloadHash: "pending",
    }],
    sessionSnapshots: [{
      ...common,
      id: "snapshot:2026-07-20:T-5M:1",
      targetDate: "2026-07-20",
      checkpoint: "T-5M",
      capturedAt: processedAt,
      sourceWatermarkAt: minuteEnd,
      qualityState: "RESEARCH_COMPLETE",
      payload: snapshotPayload,
      payloadHash: canonicalHash(snapshotPayload),
    }],
  };
  fixture.observations[0].payloadHash = canonicalHash(observationPayload(fixture.observations[0]));
  fixture.completedMinuteBars[0].payloadHash = canonicalHash(minutePayload(fixture.completedMinuteBars[0]));
  return fixture;
}

test("market store atomically appends normalized records and makes retries idempotent", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const first = await store.appendBatch(batchFixture());
  assert.deepEqual(first, {
    sourceStates: 1,
    observations: 1,
    completedMinuteBars: 1,
    sessionSnapshots: 1,
  });
  const retry = await store.appendBatch(batchFixture());
  assert.deepEqual(retry, {
    sourceStates: 0,
    observations: 0,
    completedMinuteBars: 0,
    sessionSnapshots: 0,
  });
  assert.equal(database.rows.size, 4);
  assert.equal(database.schemaBatches, 1, "one database object shares one schema convergence promise");
  assert.equal(database.insertBatches, 2);
});

test("strict observations cannot promote IEX or an unentitled source", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const observation = batchFixture().observations[0];
  await assert.rejects(
    store.appendObservation({ ...observation, qualification: "STRICT_EXECUTION" }),
    /execution-grade coverage/i,
  );
  await assert.rejects(
    store.appendObservation({
      ...observation,
      feed: "sip",
      coverage: "CONSOLIDATED_SIP",
      entitlement: "NOT_ENTITLED",
      qualification: "STRICT_EXECUTION",
    }),
    /entitled source/i,
  );
  assert.equal(database.rows.size, 0);
  assert.equal(database.schemaBatches, 0, "invalid payloads fail before touching D1");
});

test("unfinished, malformed, and future-skewed records fail before persistence", async () => {
  const store = createMarketStore(new InMemoryD1());
  const minute = batchFixture().completedMinuteBars[0];
  await assert.rejects(
    store.appendCompletedMinuteBar({
      ...minute,
      receivedAt: minuteEnd - 300,
      processedAt: minuteEnd - 200,
      availableAt: minuteEnd - 1,
    }),
    /unfinished minute/i,
  );
  await assert.rejects(
    store.appendCompletedMinuteBar({ ...minute, high: 200, low: 201 }),
    /high cannot be below low/i,
  );
  const observation = batchFixture().observations[0];
  await assert.rejects(
    store.appendObservation({ ...observation, providerTime: receivedAt + 30_001 }),
    /too far ahead/i,
  );
});

test("a completed-minute correction appends a new revision instead of rewriting revision zero", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const original = batchFixture().completedMinuteBars[0];
  assert.equal(await store.appendCompletedMinuteBar(original), true);
  const correction = {
    ...original,
    id: "minute:alpaca:iex:NVDA:1784553780000:1",
    close: 201.3,
    revision: 1,
    serviceSequence: 4,
    payloadHash: "pending",
  };
  correction.payloadHash = canonicalHash(minutePayload(correction));
  assert.equal(await store.appendCompletedMinuteBar(correction), true);
  assert.equal(database.rows.size, 2);
});

test("automatic minute revisions are deterministic and as-of reads select the highest revision available at the cutoff", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const fixture = batchFixture().completedMinuteBars[0];
  const original = { ...fixture };
  delete original.id;
  delete original.revision;
  assert.equal(await store.appendCompletedMinuteRevision(original), true);
  assert.equal(await store.appendCompletedMinuteRevision(original), false, "same payload hash is idempotent");
  const corrected = {
    ...original,
    close: 201.3,
    receivedAt: original.receivedAt + 1_000,
    processedAt: original.processedAt + 1_000,
    availableAt: original.availableAt + 1_000,
    createdAt: original.createdAt + 1_000,
    payloadHash: "pending",
  };
  corrected.payloadHash = canonicalHash(minutePayload(corrected));
  assert.equal(await store.appendCompletedMinuteRevision(corrected), true);
  const beforeCorrection = await store.readCompletedBarsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: original.availableAt });
  const afterCorrection = await store.readCompletedBarsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: corrected.availableAt });
  assert.equal(beforeCorrection[0].revision, 0);
  assert.equal(beforeCorrection[0].close, 201.25);
  assert.equal(afterCorrection[0].revision, 1);
  assert.equal(afterCorrection[0].close, 201.3);
  const persistedCorrection = database.rows.get(`market_completed_minute_bars:minute:${corrected.payloadHash}`);
  persistedCorrection[10] = 201.2;
  await assert.rejects(
    store.readCompletedBarsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: corrected.availableAt }),
    /minute payload hash mismatch/i,
  );
});

test("as-of reads return no archive when absent and isolate sessions", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  assert.equal(await store.readSessionSnapshotAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }), null);
  const target = batchFixture().sessionSnapshots[0];
  await store.appendSessionSnapshot(target);
  await store.appendSessionSnapshot({ ...target, id: "snapshot:other", targetDate: "2026-07-21" });
  const result = await store.readSessionSnapshotAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt, checkpoint: "T-5M" });
  assert.equal(result.targetDate, "2026-07-20");
  assert.deepEqual(result.payload, target.payload);
  assert.equal(await store.readSessionSnapshotAsOf({ symbol: "NVDA", targetDate: "2026-07-22", cutoff: availableAt }), null);
});

test("as-of snapshot reads reject payloads that no longer match their canonical hash", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const target = batchFixture().sessionSnapshots[0];
  await store.appendSessionSnapshot(target);
  const persisted = database.rows.get(`market_session_snapshots:${target.id}`);
  persisted[12] = JSON.stringify({ tampered: true });
  await assert.rejects(
    store.readSessionSnapshotAsOf({ symbol: "NVDA", targetDate: target.targetDate, cutoff: target.availableAt }),
    /payload hash mismatch/i,
  );
});

test("same-watermark snapshot retries are idempotent while different content is an explicit conflict", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const snapshot = batchFixture().sessionSnapshots[0];
  assert.equal(await store.appendSessionSnapshot(snapshot), true);
  assert.equal(await store.appendSessionSnapshot({ ...snapshot, id: "snapshot:retry-id" }), false);
  const conflictingPayload = { ...snapshot.payload, source: "corrected" };
  await assert.rejects(
    store.appendSessionSnapshot({ ...snapshot, id: "snapshot:conflict", payload: conflictingPayload, payloadHash: canonicalHash(conflictingPayload) }),
    MarketSnapshotConflictError,
  );
  assert.equal([...database.rows.keys()].filter((key) => key.startsWith("market_session_snapshots:")).length, 1);
});

test("public as-of reads never converge schema and return a typed missing-schema error", async () => {
  let ddlCalls = 0;
  const missingSchema = {
    prepare(sql) {
      if (/^CREATE /i.test(sql.trim())) ddlCalls += 1;
      return {
        bind() { return this; },
        async first() { throw new Error("D1_ERROR: no such table: market_session_snapshots"); },
        async all() { throw new Error("D1_ERROR: no such table: market_completed_minute_bars"); },
      };
    },
    async batch(statements) {
      ddlCalls += statements.filter((statement) => /^CREATE /i.test(statement.sql?.trim?.() ?? "")).length;
      return [];
    },
  };
  const store = createMarketStore(missingSchema);
  await assert.rejects(store.readSessionSnapshotAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }), MarketSchemaUnavailableError);
  await assert.rejects(store.readCompletedBarsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }), MarketSchemaUnavailableError);
  await assert.rejects(store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }), MarketSchemaUnavailableError);
  assert.equal(ddlCalls, 0);
});

test("observation reads verify canonical hashes and strict observations cannot cross sessions", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const observation = batchFixture().observations[0];
  await store.appendObservation(observation);
  assert.equal((await store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }))[0].price, 201.25);
  const persisted = database.rows.get(`market_qualified_observations:${observation.id}`);
  persisted[9] = 999;
  await assert.rejects(store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt }), /observation payload hash mismatch/i);
  const strict = { ...observation, id: "strict-cross-session", qualification: "STRICT_EXECUTION", coverage: "CONSOLIDATED_SIP", payloadHash: "strict-hash" };
  await assert.rejects(store.appendObservation({ ...strict, sessionDate: "2026-07-21" }), /different session/i);
});

test("qualified observation reads bind RESEARCH and STRICT filters before the invalidation cutoff", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const research = batchFixture().observations[0];
  const strict = {
    ...research,
    id: "observation:alpaca:sip:NVDA:strict-filter",
    feed: "sip",
    qualification: "STRICT_EXECUTION",
    coverage: "CONSOLIDATED_SIP",
    connectionEpoch: "epoch-strict",
    serviceSequence: 3,
    payloadHash: "pending",
  };
  strict.payloadHash = canonicalHash(observationPayload(strict));
  await store.appendObservation(research);
  await store.appendObservation(strict);
  const researchRows = await store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt, qualification: "RESEARCH" });
  const strictRows = await store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt, qualification: "STRICT_EXECUTION" });
  assert.deepEqual(researchRows.map((row) => row.qualification), ["RESEARCH"]);
  assert.deepEqual(strictRows.map((row) => row.qualification), ["STRICT_EXECUTION"]);
});

test("invalid chronology is rejected before D1 and as-of limits are bounded", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const observation = batchFixture().observations[0];
  await assert.rejects(store.appendObservation({ ...observation, processedAt: observation.receivedAt - 1 }), /processedAt cannot precede receivedAt/);
  await assert.rejects(store.readObservationsAsOf({ symbol: "NVDA", targetDate: "2026-07-20", cutoff: availableAt, limit: 501 }), /limit must be between 1 and 500/);
  assert.equal(database.rows.size, 0);
});

test("nonce ledger rejects replay, permits reuse after expiry, and is atomic under concurrency", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const now = Date.parse("2026-07-20T13:24:00Z");
  assert.equal(await store.rememberOnce("nonce-1", now + 1_000, now), true);
  assert.equal(await store.rememberOnce("nonce-1", now + 1_000, now), false);
  assert.equal(await store.rememberOnce("nonce-1", now + 3_000, now + 1_001), true, "expired rows are cleaned before admission");
  assert.equal(await store.rememberOnce("already-expired", now, now), false);
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => store.rememberOnce("nonce-race", now + 5_000, now)));
  assert.equal(concurrent.filter(Boolean).length, 1);
});

test("scheduled checkpoint ingestion archives only completed same-session bars and keeps IEX research-only", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const capturedAt = Date.parse("2026-07-20T13:24:30Z");
  const provenance = (sourceId, provider, observedAt) => ({
    sourceId,
    provider,
    coverage: sourceId.includes("iex") ? "single exchange" : "public delayed minute bars",
    sourceObservedAt: observedAt,
    receivedAt: capturedAt - 10_000,
    processedAt: capturedAt - 5_000,
    availableAt: capturedAt - 5_000,
    checkedAt: capturedAt - 6_000,
    persistedAt: null,
    ageMs: capturedAt - observedAt,
  });
  const missing = { value: null, availability: "MISSING", freshness: null, reasonCode: "MISSING", provenance: null };
  const yahooCurrent = { value: 201.25, availability: "AVAILABLE", freshness: "LIVE", reasonCode: null, provenance: provenance("yahoo", "Yahoo Finance", minuteEnd) };
  const envelope = {
    schemaVersion: "target-market-v1",
    symbol: "NVDA",
    targetDate: "2026-07-20",
    relation: "CURRENT",
    requestedAt: capturedAt - 15_000,
    effectiveAsOf: capturedAt,
    view: "DECISION_FREEZE",
    schedule: { premarketOpenAt: Date.parse("2026-07-20T08:00:00Z"), regularOpenAt: Date.parse("2026-07-20T13:30:00Z"), regularCloseAt: Date.parse("2026-07-20T20:00:00Z"), earlyClose: false },
    archive: { status: "CURRENT", latestPersistedAt: null, latestCompletedBarAt: minuteEnd },
    quote: { value: 201.26, availability: "AVAILABLE", freshness: "LIVE", reasonCode: null, provenance: provenance("alpaca_iex", "Alpaca", minuteEnd) },
    previousSession: { date: "2026-07-17", open: missing, high: missing, low: missing, close: missing, volume: missing },
    targetSession: {
      premarket: { high: yahooCurrent, low: yahooCurrent, current: yahooCurrent, volume: { ...yahooCurrent, value: 5_000 } },
      regular: { open: missing, high: missing, low: missing, close: missing, volume: missing },
      firstMinute: { high: missing, low: missing, close: missing, volume: missing, complete: false },
    },
  };
  const completed = { time: minuteStart, open: 201, high: 201.5, low: 200.9, close: 201.25, volume: 5_000 };
  const forming = { ...completed, time: minuteEnd };
  const priorSession = { ...completed, time: Date.parse("2026-07-17T13:23:00Z") };
  const counts = await store.saveScheduledCheckpoint({ envelope, analysisBars: [priorSession, completed, forming], checkpoint: "T-5M", capturedAt });
  assert.equal(counts.completedMinuteBars, 1);
  assert.equal(counts.observations, 1);
  const observation = [...database.rows.entries()].find(([key]) => key.startsWith("market_qualified_observations:"))[1];
  assert.equal(observation[6], "RESEARCH");
  assert.equal(observation[8], "SINGLE_EXCHANGE_IEX");
  const storedMinutes = [...database.rows.entries()].filter(([key]) => key.startsWith("market_completed_minute_bars:"));
  assert.equal(storedMinutes.length, 1);
  assert.equal(storedMinutes[0][1][4], "2026-07-20");
  const retry = await store.saveScheduledCheckpoint({ envelope, analysisBars: [priorSession, completed, forming], checkpoint: "T-5M", capturedAt });
  assert.deepEqual(retry, { sourceStates: 0, observations: 0, completedMinuteBars: 0, sessionSnapshots: 0 });
});

test("every scheduled checkpoint rejects post-effective source availability before touching D1", async () => {
  const database = new InMemoryD1();
  const store = createMarketStore(database);
  const capturedAt = Date.parse("2026-07-20T13:24:30Z");
  const base = batchFixture();
  const missing = { value: null, availability: "MISSING", freshness: null, reasonCode: "MISSING", provenance: null };
  const late = {
    value: 201.25,
    availability: "AVAILABLE",
    freshness: "FROZEN",
    reasonCode: null,
    provenance: {
      sourceId: "alpaca_iex", provider: "Alpaca", coverage: "single exchange",
      sourceObservedAt: capturedAt, receivedAt: capturedAt, processedAt: capturedAt,
      availableAt: capturedAt + 1, checkedAt: capturedAt, persistedAt: null, ageMs: 0,
    },
  };
  const envelope = {
    schemaVersion: "target-market-v1", symbol: "NVDA", targetDate: "2026-07-20", relation: "CURRENT",
    requestedAt: capturedAt, effectiveAsOf: capturedAt, view: "LATEST",
    schedule: { premarketOpenAt: Date.parse("2026-07-20T08:00:00Z"), regularOpenAt: Date.parse("2026-07-20T13:30:00Z"), regularCloseAt: Date.parse("2026-07-20T20:00:00Z"), earlyClose: false },
    archive: { status: "CURRENT", latestPersistedAt: null, latestCompletedBarAt: minuteEnd }, quote: late,
    previousSession: { date: "2026-07-17", open: missing, high: missing, low: missing, close: missing, volume: missing },
    targetSession: { premarket: { high: missing, low: missing, current: missing, volume: missing }, regular: { open: missing, high: missing, low: missing, close: missing, volume: missing }, firstMinute: { high: missing, low: missing, close: missing, volume: missing, complete: false } },
  };
  await assert.rejects(
    store.saveScheduledCheckpoint({ envelope, analysisBars: base.completedMinuteBars, checkpoint: "T-30M", capturedAt }),
    (error) => {
      assert.match(error.message, /checkpoint cutoff/i);
      assert.match(error.message, /field=quote/);
      assert.match(error.message, /source=alpaca_iex/);
      assert.match(error.message, /deltaMs=1/);
      return true;
    },
  );
  assert.equal(database.rows.size, 0);
  assert.equal(database.schemaBatches, 0);
});
