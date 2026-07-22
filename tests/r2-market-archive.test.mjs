import assert from "node:assert/strict";
import test from "node:test";

import { canonicalMooJson, mooSha256Hex } from "../app/moo-contract.ts";
import {
  MarketArchiveConflictError,
  MarketArchiveVerificationError,
  archiveWriteAllowsHotPrune,
  buildR2MarketArchiveSegment,
  putR2MarketArchiveSegment,
} from "../app/r2-market-archive.ts";

function record(sequence, overrides = {}) {
  const payload = overrides.payload ?? {
    schemaVersion: "aperture-market-stream-v2",
    streamId: "alpaca:sip:NVDA",
    serviceSequence: sequence,
    availableAt: 1_000 + sequence,
  };
  return {
    streamId: "alpaca:sip:NVDA",
    serviceSequence: sequence,
    connectionEpoch: 4,
    availableAt: 1_000 + sequence,
    payloadHash: mooSha256Hex(canonicalMooJson(payload)),
    payload,
    ...overrides,
  };
}

function segment(records = [record(10), record(11)]) {
  return buildR2MarketArchiveSegment({
    provider: "alpaca",
    feed: "sip",
    symbol: "NVDA",
    sessionDate: "2026-07-21",
    streamId: "alpaca:sip:NVDA",
    sealedAt: 2_000,
    records,
  });
}

class FakeBucket {
  objects = new Map();
  async head(key) {
    const value = this.objects.get(key);
    return value ? { size: value.body.byteLength, customMetadata: value.customMetadata } : null;
  }
  async get(key) {
    const value = this.objects.get(key);
    return value ? {
      size: value.body.byteLength,
      customMetadata: value.customMetadata,
      async arrayBuffer() { return value.body.slice().buffer; },
    } : null;
  }
  async put(key, body, options) {
    this.objects.set(key, { body: new Uint8Array(body), customMetadata: { ...options.customMetadata } });
  }
}

test("archive segments are deterministic and bind a contiguous availability prefix", () => {
  const first = segment();
  const second = segment();
  assert.equal(first.manifest.contentHash, second.manifest.contentHash);
  assert.equal(first.manifest.manifestHash, second.manifest.manifestHash);
  assert.equal(first.manifest.firstSequence, 10);
  assert.equal(first.manifest.lastSequence, 11);
  assert.equal(first.manifest.rowCount, 2);
  assert.match(first.manifest.objectKey, /provider=alpaca\/feed=sip\/symbol=NVDA\/session=2026-07-21/);
  assert.equal(new TextDecoder().decode(first.body).split("\n").filter(Boolean).length, 2);
});

test("gaps, payload substitution, epoch regression, and premature sealing fail before R2", () => {
  assert.throws(() => segment([record(10), record(12)]), /contiguous prefix/);
  assert.throws(() => segment([record(10), record(11, { payloadHash: "0".repeat(64) })]), /payloadHash does not match/);
  assert.throws(() => segment([record(10, { connectionEpoch: 5 }), record(11, { connectionEpoch: 4 })]), /cannot regress/);
  assert.throws(() => buildR2MarketArchiveSegment({
    provider: "alpaca", feed: "sip", symbol: "NVDA", sessionDate: "2026-07-21",
    streamId: "alpaca:sip:NVDA", sealedAt: 1_000, records: [record(10)],
  }), /not yet available/);
});

test("R2 writes are independently verified and identical retries are idempotent", async () => {
  const bucket = new FakeBucket();
  const value = segment();
  const created = await putR2MarketArchiveSegment(bucket, value);
  assert.equal(created.status, "CREATED");
  assert.equal(archiveWriteAllowsHotPrune(created), true);
  const retry = await putR2MarketArchiveSegment(bucket, value);
  assert.equal(retry.status, "EXISTS_VERIFIED");
  assert.equal(bucket.objects.size, 1);
});

test("mismatched existing objects and unverifiable writes never authorize pruning", async () => {
  const value = segment();
  const conflict = new FakeBucket();
  conflict.objects.set(value.manifest.objectKey, { body: new Uint8Array([1]), customMetadata: {} });
  await assert.rejects(putR2MarketArchiveSegment(conflict, value), MarketArchiveConflictError);
  assert.equal(archiveWriteAllowsHotPrune(null), false);

  const disappearing = {
    async head() { return null; },
    async get() { return null; },
    async put() {},
  };
  await assert.rejects(putR2MarketArchiveSegment(disappearing, value), MarketArchiveVerificationError);

  const forged = new FakeBucket();
  forged.objects.set(value.manifest.objectKey, {
    body: new Uint8Array(value.body.byteLength),
    customMetadata: {
      schema: value.manifest.schemaVersion,
      contentHash: value.manifest.contentHash,
      manifestHash: value.manifest.manifestHash,
      rowCount: String(value.manifest.rowCount),
      firstSequence: String(value.manifest.firstSequence),
      lastSequence: String(value.manifest.lastSequence),
    },
  });
  await assert.rejects(putR2MarketArchiveSegment(forged, value), MarketArchiveConflictError);
});
