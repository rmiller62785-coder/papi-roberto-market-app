import assert from "node:assert/strict";
import test from "node:test";

import { archiveD1MarketStreamPrefix } from "../app/d1-market-archive.ts";
import { canonicalMooJson, mooSha256Hex } from "../app/moo-contract.ts";

function row(sequence, availableAt) {
  const payload = { streamId: "nvda-sip", serviceSequence: sequence, availableAt, value: sequence };
  return {
    stream_id: "nvda-sip",
    service_sequence: sequence,
    connection_epoch: 4,
    available_at: availableAt,
    payload_hash: mooSha256Hex(canonicalMooJson(payload)),
    payload_json: JSON.stringify(payload),
    provider: "alpaca",
    feed: "sip",
    symbol: "NVDA",
  };
}

test("D1 archival binds coverage and uniqueness to one immutable stream identity", async () => {
  const statements = [];
  const rows = [row(1, Date.parse("2026-07-21T13:00:00Z")), row(2, Date.parse("2026-07-21T13:00:01Z"))];
  const database = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        async first() { return sql.includes("segment_id,stream_id,provider") ? null : rows[0]; },
        async all() { return { results: rows }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
  const objects = new Map();
  const bucket = {
    async head(key) { return objects.get(key) ?? null; },
    async get(key) {
      const value = objects.get(key);
      return value ? { ...value, async arrayBuffer() { return value.body.slice().buffer; } } : null;
    },
    async put(key, body, options) {
      objects.set(key, { size: body.byteLength, body: new Uint8Array(body), customMetadata: options.customMetadata });
    },
  };

  const result = await archiveD1MarketStreamPrefix({
    database,
    bucket,
    sealedAt: Date.parse("2026-07-21T13:01:00Z"),
  });

  assert.equal(result.status, "VERIFIED");
  assert.deepEqual([result.fromSequence, result.toSequence, result.rowCount], [1, 2, 2]);
  assert.match(result.objectKey, /stream=nvda-sip/);
  assert.equal(statements.filter((sql) => sql.includes("NOT EXISTS")).every((sql) => sql.includes("segment.stream_id=emission.stream_id")), true);
  assert.match(statements.find((sql) => sql.includes("INSERT INTO market_archive_segments")), /segment_id,stream_id,provider/);
});

test("a transient R2 failure retries the identical persisted manifest", async () => {
  const rows = [row(1, Date.parse("2026-07-21T13:00:00Z"))];
  let index = null;
  const database = {
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async first() {
          if (sql.includes("segment_id,stream_id,provider")) return index && ["PENDING", "FAILED"].includes(index.state)
            ? {
                segment_id: index.segmentId, stream_id: index.streamId, provider: index.provider,
                feed: index.feed, symbol: index.symbol, session_date: index.sessionDate,
                from_sequence: index.fromSequence, to_sequence: index.toSequence,
                object_key: index.objectKey, content_hash: index.contentHash,
                row_count: index.rowCount, byte_length: index.byteLength, created_at: index.createdAt,
              }
            : null;
          return rows[0];
        },
        async all() {
          const maximumSequence = parameters[2];
          const limit = parameters[4];
          return { results: rows.filter((value) => value.service_sequence <= maximumSequence).slice(0, limit) };
        },
        async run() {
          if (sql.includes("INSERT INTO market_archive_segments")) {
            if (!index) index = {
              segmentId: parameters[0], streamId: parameters[1], provider: parameters[2], feed: parameters[3],
              symbol: parameters[4], sessionDate: parameters[5], fromSequence: parameters[6], toSequence: parameters[7],
              objectKey: parameters[8], contentHash: parameters[9], rowCount: parameters[10],
              byteLength: parameters[11], createdAt: parameters.at(-1), state: "PENDING",
            };
            else if (index.state === "FAILED") index.state = "PENDING";
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET state='VERIFIED'")) {
            if (index.state !== "PENDING" && index.state !== "VERIFIED") return { meta: { changes: 0 } };
            index.state = "VERIFIED";
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET state='FAILED'")) index.state = "FAILED";
          return { meta: { changes: 1 } };
        },
      };
    },
  };
  let fail = true;
  const objects = new Map();
  const bucket = {
    async head(key) { return objects.get(key) ?? null; },
    async get(key) {
      const value = objects.get(key);
      return value ? { ...value, async arrayBuffer() { return value.body.slice().buffer; } } : null;
    },
    async put(key, body, options) {
      if (fail) { fail = false; throw new Error("temporary R2 outage"); }
      objects.set(key, { size: body.byteLength, body: new Uint8Array(body), customMetadata: options.customMetadata });
    },
  };

  await assert.rejects(() => archiveD1MarketStreamPrefix({ database, bucket, sealedAt: Date.parse("2026-07-21T13:01:00Z") }));
  assert.equal(index.state, "FAILED");
  const originalIdentity = { segmentId: index.segmentId, createdAt: index.createdAt };
  rows.push(row(2, Date.parse("2026-07-21T13:00:01Z")));
  const result = await archiveD1MarketStreamPrefix({ database, bucket, sealedAt: Date.parse("2026-07-21T13:02:00Z") });
  assert.equal(result.status, "VERIFIED");
  assert.equal(index.state, "VERIFIED");
  assert.equal(result.toSequence, 1, "newly arrived emissions cannot expand a failed segment retry");
  assert.deepEqual({ segmentId: index.segmentId, createdAt: index.createdAt }, originalIdentity);
});
