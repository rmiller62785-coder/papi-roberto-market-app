import assert from "node:assert/strict";
import test from "node:test";

import { browserUpdateInstruction } from "../src/fanout.ts";
import { normalizeAlpacaMessages } from "../src/ingestor.ts";
import { initialMarketStreamState, reduceProviderEvent } from "../src/reducer.ts";
import {
  PROVIDER_RECOVERY_OVERLAP_MS,
  ProviderRecoveryPageLimitError,
  ProviderRecoverySegmentSaturatedError,
  cursorRecoveryReason,
  fetchAdaptiveProviderRecoverySegment,
  recoverMarketStream,
} from "../src/recovery.ts";

const base = Date.parse("2026-07-20T13:20:00Z");

function event(id, seconds) {
  return normalizeAlpacaMessages(JSON.stringify([{ T: "t", S: "NVDA", i: id, x: "Q", p: 200 + id / 100, s: 1, c: ["@"], t: `2026-07-20T13:20:${String(seconds).padStart(2, "0")}.000000001Z`, z: "C" }]),
    { feed: "iex", receivedAt: base + 10_000, processedAt: base + 10_001 })[0];
}

test("browser cursors ignore duplicates and require recovery on identity, epoch, or sequence gaps", () => {
  const cursor = { streamId: "stream-1", connectionEpoch: 1, serviceSequence: 10 };
  assert.equal(cursorRecoveryReason(cursor, { ...cursor, streamId: "stream-2", serviceSequence: 11 }), "STREAM_CHANGED");
  assert.equal(cursorRecoveryReason(cursor, { ...cursor, connectionEpoch: 2, serviceSequence: 11 }), "EPOCH_CHANGED");
  assert.equal(cursorRecoveryReason(cursor, { ...cursor, serviceSequence: 12 }), "SEQUENCE_GAP");
  assert.equal(cursorRecoveryReason(cursor, { ...cursor, serviceSequence: 10 }), "DUPLICATE");
  assert.equal(cursorRecoveryReason(cursor, { ...cursor, serviceSequence: 11 }), null);

  const accepted = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), event(1, 1));
  const duplicate = browserUpdateInstruction({ streamId: "stream-1", connectionEpoch: 0, serviceSequence: 1 }, accepted.emissions[0]);
  assert.equal(duplicate, null);
});

test("default recovery overlap is wide enough to revisit late updated minute bars", async () => {
  const state = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), event(2, 2)).state;
  let requested;
  await recoverMarketStream({
    state,
    through: base + 20_000,
    provider: { async fetchEvents(input) { requested = input; return []; } },
  });
  assert.equal(PROVIDER_RECOVERY_OVERLAP_MS, 15 * 60_000);
  assert.equal(requested.atOrAfterProviderAt, Math.max(0, state.lastProviderAt - PROVIDER_RECOVERY_OVERLAP_MS));
});

test("REST recovery overlaps the previous watermark and reuses canonical dedupe", async () => {
  let state = reduceProviderEvent(initialMarketStreamState("iex", "stream-1"), event(2, 2)).state;
  let requested;
  const result = await recoverMarketStream({
    state,
    through: base + 10_000,
    overlapMs: 5_000,
    provider: {
      async fetchEvents(input) {
        requested = input;
        return [event(2, 2), event(1, 1)];
      },
    },
  });
  assert.equal(requested.atOrAfterProviderAt, base - 3_000);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.state.latestTrade.providerTradeId, "2");
  assert.equal(result.state.serviceSequence, state.serviceSequence + 1);
});

test("a page-capped single millisecond fails as an explicit retriable bounded segment", async () => {
  const provider = { async fetchEvents() { throw new ProviderRecoveryPageLimitError("trades"); } };
  await assert.rejects(
    fetchAdaptiveProviderRecoverySegment({ provider, feed: "sip", startAt: base, throughAt: base + 3, maximumWindowMs: 4 }),
    (error) => {
      assert.ok(error instanceof ProviderRecoverySegmentSaturatedError);
      assert.equal(error.retriable, true);
      assert.equal(error.startAt, base);
      assert.equal(error.beforeOrAt, base);
      return true;
    },
  );
});
