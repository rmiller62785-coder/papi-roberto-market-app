import assert from "node:assert/strict";
import test from "node:test";

import {
  durableStreamQuoteCandidate,
  mergeDurableCompletedMinuteBars,
  selectDurableCompletedMinuteBars,
} from "../app/api/market/route.ts";

const targetDate = "2026-07-20";
const observedAt = Date.parse("2026-07-20T12:00:00.000Z");

function observation(overrides = {}) {
  return {
    id: "observation:1",
    provider: "alpaca",
    feed: "iex",
    symbol: "NVDA",
    sessionDate: targetDate,
    kind: "TRADE",
    qualification: "RESEARCH",
    entitlement: "NOT_ENTITLED",
    coverage: "IEX_SINGLE_EXCHANGE",
    price: 170.25,
    size: 10,
    providerEventId: "event:1",
    providerTime: observedAt,
    receivedAt: observedAt + 100,
    processedAt: observedAt + 200,
    availableAt: observedAt + 300,
    createdAt: observedAt + 400,
    connectionEpoch: "epoch:1",
    serviceSequence: 1,
    payloadHash: "hash:1",
    ...overrides,
  };
}

function completedBar(overrides = {}) {
  const minuteStart = Date.parse("2026-07-20T13:30:00.000Z");
  const minuteEnd = minuteStart + 60_000;
  return {
    id: "minute:1",
    provider: "alpaca",
    feed: "iex",
    symbol: "NVDA",
    sessionDate: targetDate,
    minuteStart,
    minuteEnd,
    open: 170,
    high: 171,
    low: 169.5,
    close: 170.5,
    volume: 100,
    tradeCount: 10,
    providerTime: minuteEnd,
    receivedAt: minuteEnd + 100,
    processedAt: minuteEnd + 200,
    availableAt: minuteEnd + 300,
    createdAt: minuteEnd + 400,
    connectionEpoch: "epoch:1",
    serviceSequence: 2,
    revision: 1,
    recovered: false,
    payloadHash: "hash:minute:1",
    ...overrides,
  };
}

test("durable quote selection is exact-session and as-of, with IEX permanently research-only", () => {
  const cutoff = observedAt + 1_000;
  const candidate = durableStreamQuoteCandidate([
    observation({
      id: "wrong-session",
      sessionDate: "2026-07-17",
      providerTime: Date.parse("2026-07-17T19:59:00.000Z"),
      price: 999,
      serviceSequence: 99,
    }),
    observation({
      id: "after-cutoff",
      price: 998,
      providerTime: cutoff + 1,
      receivedAt: cutoff + 2,
      processedAt: cutoff + 3,
      availableAt: cutoff + 4,
      createdAt: cutoff + 5,
      serviceSequence: 98,
    }),
    observation(),
  ], targetDate, cutoff);

  assert.equal(candidate?.price, 170.25);
  assert.equal(candidate?.provider, "aperture_stream");
  assert.equal(candidate?.strictExecutionEligible, false);
  assert.match(candidate?.coverage ?? "", /IEX.*research-only.*never promoted to strict/i);
  assert.equal(candidate?.observedAtMs, observedAt);
  assert.equal(candidate?.receivedAtMs, observedAt + 100);
  assert.equal(candidate?.processedAtMs, observedAt + 200);
  assert.equal(candidate?.availableAtMs, observedAt + 300);
});

test("only an entitled, non-IEX execution observation can retain strict eligibility", () => {
  const cutoff = observedAt + 1_000;
  const sip = durableStreamQuoteCandidate([
    observation({
      feed: "sip",
      qualification: "STRICT_EXECUTION",
      entitlement: "ENTITLED",
      coverage: "CONSOLIDATED_SIP",
    }),
  ], targetDate, cutoff);
  const mislabeledIex = durableStreamQuoteCandidate([
    observation({
      qualification: "STRICT_EXECUTION",
      entitlement: "ENTITLED",
      coverage: "CONSOLIDATED_SIP",
    }),
  ], targetDate, cutoff);

  assert.equal(sip?.strictExecutionEligible, true);
  assert.equal(mislabeledIex?.strictExecutionEligible, false);
});

test("completed-minute selection never crosses dates or cutoffs and keeps one feed", () => {
  const base = completedBar();
  const cutoff = base.minuteEnd + 5_000;
  const sipRevision1 = completedBar({
    id: "sip-r1",
    feed: "sip",
    close: 170.6,
    revision: 1,
    availableAt: base.minuteEnd + 1_000,
  });
  const sipRevision2 = completedBar({
    id: "sip-r2",
    feed: "sip",
    close: 170.7,
    revision: 2,
    availableAt: base.minuteEnd + 2_000,
  });
  const iexNewer = completedBar({
    id: "iex-newer",
    feed: "iex",
    close: 170.8,
    availableAt: base.minuteEnd + 3_000,
  });
  const afterCutoff = completedBar({
    id: "after-cutoff",
    feed: "sip",
    close: 999,
    availableAt: cutoff + 1,
    createdAt: cutoff + 2,
  });
  const wrongSession = completedBar({
    id: "wrong-session",
    sessionDate: "2026-07-17",
    minuteStart: Date.parse("2026-07-17T13:30:00.000Z"),
    minuteEnd: Date.parse("2026-07-17T13:31:00.000Z"),
    providerTime: Date.parse("2026-07-17T13:31:00.000Z"),
    receivedAt: Date.parse("2026-07-17T13:31:00.100Z"),
    processedAt: Date.parse("2026-07-17T13:31:00.200Z"),
    availableAt: Date.parse("2026-07-17T13:31:00.300Z"),
    createdAt: Date.parse("2026-07-17T13:31:00.400Z"),
    close: 997,
  });

  const selected = selectDurableCompletedMinuteBars(
    [iexNewer, sipRevision1, wrongSession, afterCutoff, sipRevision2],
    targetDate,
    cutoff,
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].feed, "sip", "SIP is selected instead of blending feed coverage");
  assert.equal(selected[0].revision, 2);
  assert.equal(selected[0].close, 170.7);

  const preferredIex = selectDurableCompletedMinuteBars(
    [iexNewer, sipRevision2],
    targetDate,
    cutoff,
    { provider: "alpaca", feed: "iex" },
  );
  assert.equal(preferredIex.length, 1);
  assert.equal(preferredIex[0].feed, "iex");
  assert.equal(preferredIex[0].close, 170.8);
});

test("authoritative durable minutes replace matching REST minutes without averaging", () => {
  const durable = completedBar({ close: 170.5 });
  const earlier = durable.minuteStart - 60_000;
  const base = [
    { time: earlier, open: 168, high: 169, low: 167.5, close: 168.5, volume: 90 },
    { time: durable.minuteStart, open: 170, high: 171, low: 169.5, close: 100, volume: 100 },
  ];
  const merged = mergeDurableCompletedMinuteBars(base, [durable]);

  assert.deepEqual(merged.map((bar) => bar.time), [earlier, durable.minuteStart]);
  assert.equal(merged[0].close, 168.5);
  assert.equal(merged[1].close, 170.5, "the durable revision wins; prices are not averaged");
});
