import assert from "node:assert/strict";
import test from "node:test";

import {
  marketValue,
  TARGET_MARKET_SCHEMA_VERSION,
  unavailableMarketValue,
} from "../app/market-contract.ts";
import {
  canonicalMarketBars,
  completedDailyRows,
  completedMarketBars,
} from "../app/market-reducer.ts";
import {
  __resetMarketRouteCachesForTests,
  GET,
  selectMarketQuote,
} from "../app/api/market/route.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalEnv = {
  alpacaKey: process.env.APCA_API_KEY_ID,
  alpacaSecret: process.env.APCA_API_SECRET_KEY,
  finnhub: process.env.FINNHUB_API_KEY,
};

const epoch = (value) => Math.floor(Date.parse(value) / 1000);

function restore() {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  if (originalEnv.alpacaKey == null) delete process.env.APCA_API_KEY_ID;
  else process.env.APCA_API_KEY_ID = originalEnv.alpacaKey;
  if (originalEnv.alpacaSecret == null) delete process.env.APCA_API_SECRET_KEY;
  else process.env.APCA_API_SECRET_KEY = originalEnv.alpacaSecret;
  if (originalEnv.finnhub == null) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = originalEnv.finnhub;
  __resetMarketRouteCachesForTests();
}

test.afterEach(restore);

function installYahooOnly(nowMs, minuteTimestamps = [Math.floor((nowMs - 30_000) / 1000)]) {
  delete process.env.APCA_API_KEY_ID;
  delete process.env.APCA_API_SECRET_KEY;
  delete process.env.FINNHUB_API_KEY;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "query1.finance.yahoo.com");
    if (url.searchParams.get("interval") === "1d") {
      return Response.json({
        chart: { result: [{
          timestamp: [
            epoch("2026-07-15T13:30:00Z"),
            epoch("2026-07-16T13:30:00Z"),
            epoch("2026-07-17T13:30:00Z"),
            epoch("2026-07-20T13:30:00Z"),
          ],
          indicators: { quote: [{
            open: [210, 209, 202.64, 203],
            high: [213, 212, 206.645, 204],
            low: [208, 207, 197.97, 202],
            close: [211, 210, 202.81, 203.5],
            volume: [100, 110, 120, 130],
          }] },
        }] },
      });
    }
    return Response.json({
      chart: { result: [{
        timestamp: minuteTimestamps,
        meta: { chartPreviousClose: 202.81 },
        indicators: { quote: [{
          open: minuteTimestamps.map((_, index) => 203 + index),
          high: minuteTimestamps.map((_, index) => 203.4 + index),
          low: minuteTimestamps.map((_, index) => 202.8 + index),
          close: minuteTimestamps.map((_, index) => 203.2 + index),
          volume: minuteTimestamps.map((_, index) => 1000 + index),
        }] },
      }] },
    });
  };
}

test("typed market values keep availability separate from freshness and provenance", () => {
  const provenance = {
    sourceId: "alpaca_iex",
    provider: "Alpaca IEX",
    coverage: "single exchange",
    sourceObservedAt: 100,
    receivedAt: 110,
    processedAt: 120,
    availableAt: 110,
    checkedAt: 120,
    persistedAt: null,
    ageMs: 20,
  };
  assert.deepEqual(marketValue({ value: 203.5, freshness: "LIVE", provenance }), {
    value: 203.5,
    availability: "AVAILABLE",
    freshness: "LIVE",
    reasonCode: null,
    provenance,
  });
  assert.deepEqual(unavailableMarketValue({
    availability: "NOT_STARTED",
    reasonCode: "TARGET_SESSION_NOT_STARTED",
  }), {
    value: null,
    availability: "NOT_STARTED",
    freshness: null,
    reasonCode: "TARGET_SESSION_NOT_STARTED",
    provenance: null,
  });
});

test("bar reduction is chronological, duplicate-safe, and excludes unfinished minutes", () => {
  const at = Date.parse("2026-07-20T12:00:00Z");
  const bars = [
    { time: at - 60_000, open: 1, high: 2, low: 1, close: 1.5, volume: 10 },
    { time: at - 120_000, open: 1, high: 2, low: 1, close: 1.4, volume: 9 },
    { time: at - 60_000, open: 1, high: 3, low: 1, close: 2.5, volume: 11 },
    { time: at - 10_000, open: 2.5, high: 2.7, low: 2.4, close: 2.6, volume: 4 },
    { time: at - 180_000, open: 4, high: 3, low: 2, close: 2.5, volume: 4 },
    { time: at - 240_000, open: 2, high: 3, low: 1, close: 4, volume: 4 },
    { time: at - 300_000, open: 2, high: 3, low: 1, close: 2, volume: -1 },
    { time: -1, open: 2, high: 3, low: 1, close: 2, volume: 1 },
  ];
  const canonical = canonicalMarketBars(bars);
  assert.deepEqual(canonical.map((bar) => bar.time), [at - 120_000, at - 60_000, at - 10_000]);
  assert.equal(canonical[1].close, 2.5, "last duplicate is the retained provider revision");
  assert.deepEqual(completedMarketBars(bars, at).map((bar) => bar.time), [at - 120_000, at - 60_000]);
});

test("daily reduction excludes a still-forming prior session and retains the latest duplicate revision", () => {
  const effectiveAsOf = Date.parse("2026-07-20T12:00:00Z");
  const row = (dateKey, close) => ({
    date: dateKey,
    dateKey,
    open: 200,
    high: 205,
    low: 198,
    close,
    volume: 100,
    timestampMs: Date.parse(`${dateKey}T13:30:00Z`),
  });
  const completed = completedDailyRows([
    row("2026-07-20", 203.5),
    row("2026-07-17", 202),
    row("2026-07-17", 202.81),
    { ...row("2026-07-16", 210), open: 220 },
    { ...row("2026-07-15", 211), volume: -1 },
  ], effectiveAsOf);
  assert.deepEqual(completed.map(({ dateKey, close }) => [dateKey, close]), [["2026-07-17", 202.81]]);
});

test("invalid target and view are rejected before any provider request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
  Date.now = () => Date.parse("2026-07-20T12:00:00Z");

  const holiday = await GET(new Request("https://example.test/api/market?targetDate=2026-07-19"));
  assert.equal(holiday.status, 400);
  assert.equal((await holiday.json()).error, "INVALID_TARGET_SESSION");
  const invalidView = await GET(new Request("https://example.test/api/market?targetDate=2026-07-20&view=PAST"));
  assert.equal(invalidView.status, 400);
  assert.equal((await invalidView.json()).error, "INVALID_MARKET_VIEW");
  assert.equal(calls, 0);
});

test("future target never borrows the current quote, bars, or unfinished prior daily row", async () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  Date.now = () => now;
  installYahooOnly(now);

  const response = await GET(new Request("https://example.test/api/market?targetDate=2026-07-21"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.targetDate, "2026-07-21");
  assert.equal(body.price, null);
  assert.deepEqual(body.bars, []);
  assert.equal(body.displaySession.date, "2026-07-21");
  assert.equal(body.displaySession.relation, "unavailable");
  assert.equal(body.marketContract.schemaVersion, TARGET_MARKET_SCHEMA_VERSION);
  assert.equal(body.marketContract.relation, "NEXT");
  assert.equal(body.marketContract.quote.availability, "NOT_STARTED");
  assert.equal(body.marketContract.previousSession.date, "2026-07-20");
  assert.equal(body.marketContract.previousSession.close.availability, "NOT_STARTED");
});

test("an explicit past target uses dated target evidence and never the current minute fallback", async () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  Date.now = () => now;
  installYahooOnly(now);

  const response = await GET(new Request("https://example.test/api/market?targetDate=2026-07-17"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.price, 202.81);
  assert.deepEqual(body.bars, []);
  assert.equal(body.realtime, false);
  assert.equal(body.marketContract.quote.value, 202.81);
  assert.equal(body.marketContract.quote.freshness, "FINAL");
  assert.equal(body.freshness.quote.provider, "yahoo_daily");
});

test("before cutoff, decision-freeze view uses only then-completed bars and never reports LIVE", async () => {
  const now = Date.parse("2026-07-20T13:24:20Z");
  Date.now = () => now;
  installYahooOnly(now, [
    epoch("2026-07-20T13:24:00Z"),
    epoch("2026-07-20T13:23:00Z"),
    epoch("2026-07-20T13:25:00Z"),
    epoch("2026-07-20T13:23:00Z"),
  ]);

  const response = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=DECISION_FREEZE",
  ));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.marketContract.effectiveAsOf, now);
  assert.deepEqual(body.bars.map((bar) => bar.time), [Date.parse("2026-07-20T13:23:00Z")]);
  assert.equal(body.marketContract.quote.value, 206.2, "last duplicate revision at 09:23 is retained");
  assert.equal(body.marketContract.quote.freshness, "FROZEN");
  assert.equal(body.marketContract.targetSession.premarket.high.value, 206.4);
  assert.equal(body.marketContract.targetSession.premarket.high.freshness, "FROZEN");
  assert.equal(body.marketContract.archive.latestCompletedBarAt, Date.parse("2026-07-20T13:24:00Z"));
  assert.equal(body.marketContract.quote.provenance.availableAt >= body.marketContract.quote.provenance.processedAt, true);
  assert.equal(body.realtime, false);
  assert.notEqual(body.freshness.quote.state, "current");
});

test("STRICT view is selected by server time rather than the browser", async () => {
  const before = Date.parse("2026-07-20T13:24:20Z");
  Date.now = () => before;
  installYahooOnly(before, [epoch("2026-07-20T13:23:00Z")]);
  const liveResponse = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=STRICT",
  ));
  assert.equal(liveResponse.status, 200);
  assert.equal((await liveResponse.json()).marketContract.view, "LATEST");

  __resetMarketRouteCachesForTests();
  const after = Date.parse("2026-07-20T13:26:00Z");
  Date.now = () => after;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("must not fetch after freeze"); };
  const frozenResponse = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=STRICT",
  ));
  assert.equal(frozenResponse.status, 503);
  assert.equal(providerCalls, 0);
  const frozen = await frozenResponse.json();
  assert.equal(frozen.marketContract.view, "DECISION_FREEZE");
  assert.equal(frozen.marketContract.quote.value, null);

  __resetMarketRouteCachesForTests();
  const cutoff = Date.parse("2026-07-20T13:24:30Z");
  Date.now = () => cutoff;
  providerCalls = 0;
  const equalityResponse = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=STRICT",
  ));
  assert.equal(equalityResponse.status, 503);
  assert.equal(providerCalls, 0, "the exact cutoff instant is server-frozen before any provider request");
  assert.equal((await equalityResponse.json()).marketContract.view, "DECISION_FREEZE");
});

test("a STRICT request that crosses the cutoff cannot return its live response", async () => {
  const startedAt = Date.parse("2026-07-20T13:24:20Z");
  const completedAt = Date.parse("2026-07-20T13:24:31Z");
  let nowCalls = 0;
  Date.now = () => nowCalls++ === 0 ? startedAt : completedAt;
  let providerCalls = 0;
  installYahooOnly(startedAt, [epoch("2026-07-20T13:23:00Z")]);
  const providerFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { providerCalls += 1; return providerFetch(...args); };
  const response = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=STRICT",
  ));
  assert.ok(providerCalls > 0, "fixture confirms the request began on the live path");
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.marketContract.view, "DECISION_FREEZE");
  assert.equal(body.marketContract.quote.value, null);
  for (const liveAlias of ["price", "bars", "asOf", "realtime", "freshness"]) {
    assert.equal(liveAlias in body, false, `${liveAlias} cannot escape after a cutoff crossing`);
  }
});

test("after cutoff, freeze view fails before providers and exposes no live legacy aliases", async () => {
  const now = Date.parse("2026-07-20T13:26:00Z");
  Date.now = () => now;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({
      chart: { result: [{
        timestamp: [epoch("2026-07-20T13:23:00Z")],
        indicators: { quote: [{ open: [999], high: [999], low: [999], close: [999], volume: [1] }] },
      }] },
    });
  };

  const response = await GET(new Request(
    "https://example.test/api/market?targetDate=2026-07-20&view=DECISION_FREEZE",
  ));
  assert.equal(response.status, 503);
  assert.equal(providerCalls, 0, "a post-cutoff provider correction cannot reconstruct the freeze");
  const body = await response.json();
  assert.equal(body.error, "DECISION_FREEZE_ARCHIVE_UNAVAILABLE");
  assert.equal(body.marketContract.archive.status, "UNAVAILABLE");
  assert.equal(body.marketContract.quote.value, null);
  assert.equal(body.marketContract.quote.freshness, "FROZEN");
  for (const liveAlias of ["price", "bars", "asOf", "source", "realtime", "freshness"]) {
    assert.equal(liveAlias in body, false, `${liveAlias} must not leak a fresh post-cutoff response`);
  }
});

test("a future-skew-only quote is rejected and cannot populate live aliases", async () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  assert.equal(selectMarketQuote([{
    provider: "alpaca_iex",
    price: 999,
    observedAtMs: now + 120_000,
    fetchedAtMs: now,
    source: "future fixture",
  }], "PREMARKET", now), null);

  Date.now = () => now;
  process.env.APCA_API_KEY_ID = "test-key";
  process.env.APCA_API_SECRET_KEY = "test-secret";
  delete process.env.FINNHUB_API_KEY;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "query1.finance.yahoo.com") {
      if (url.searchParams.get("interval") === "1m") return Response.json({ error: "down" }, { status: 503 });
      return Response.json({
        chart: { result: [{
          timestamp: [epoch("2026-07-16T13:30:00Z"), epoch("2026-07-17T13:30:00Z")],
          indicators: { quote: [{
            open: [209, 202.64], high: [212, 206.645], low: [207, 197.97], close: [210, 202.81], volume: [1, 1],
          }] },
        }] },
      });
    }
    if (url.pathname.endsWith("/bars")) return Response.json({ bars: [
      { t: "2026-07-16T04:00:00Z", o: 209, h: 212, l: 207, c: 210, v: 1 },
      { t: "2026-07-17T04:00:00Z", o: 202.64, h: 206.645, l: 197.97, c: 202.81, v: 1 },
    ] });
    if (url.pathname.endsWith("/snapshot")) return Response.json({
      latestTrade: { p: 999, t: new Date(now + 120_000).toISOString() },
      prevDailyBar: { t: "2026-07-17T04:00:00Z", o: 202.64, h: 206.645, l: 197.97, c: 202.81, v: 1 },
    });
    throw new Error(`Unexpected request: ${url}`);
  };

  const response = await GET(new Request("https://example.test/api/market?targetDate=2026-07-20"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.price, null);
  assert.equal(body.asOf, "");
  assert.equal(body.realtime, false);
  assert.equal(body.marketContract.quote.value, null);
  assert.notEqual(body.freshness.quote.state, "current");
});
