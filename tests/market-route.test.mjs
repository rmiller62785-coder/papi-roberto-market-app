import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetMarketRouteCachesForTests,
  GET,
  marketQuoteHealth,
  marketSessionState,
  marketTargetSessionDate,
  selectMarketQuote,
} from "../app/api/market/route.ts";

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalEnv = {
  alpacaKey: process.env.APCA_API_KEY_ID,
  alpacaSecret: process.env.APCA_API_SECRET_KEY,
  finnhub: process.env.FINNHUB_API_KEY,
};

const json = (value, status = 200) => Response.json(value, { status });
const epoch = (value) => Math.floor(Date.parse(value) / 1000);

function yahooChart(interval, nowMs) {
  if (interval === "1d") {
    return {
      chart: {
        result: [{
          timestamp: [epoch("2026-07-15T13:30:00Z"), epoch("2026-07-16T13:30:00Z"), epoch("2026-07-17T13:30:00Z")],
          indicators: { quote: [{
            open: [210, 209, 202.64], high: [213, 212, 206.645], low: [208, 207, 197.97], close: [211, 210, 202.81], volume: [1, 1, 1],
          }] },
        }],
      },
    };
  }
  const observed = Math.floor((nowMs - 30_000) / 1000);
  return {
    chart: {
      result: [{
        timestamp: [observed],
        meta: { chartPreviousClose: 202.81 },
        indicators: { quote: [{ open: [203], high: [203.2], low: [202.9], close: [203.1], volume: [1000] }] },
      }],
    },
  };
}

function yahooChartMissingExpectedPriorSession(interval, nowMs) {
  if (interval === "1d") {
    return {
      chart: {
        result: [{
          // Friday 2026-07-17 is deliberately absent even though Monday
          // 2026-07-20 expects it as the immediately prior Nasdaq session.
          timestamp: [epoch("2026-07-15T13:30:00Z"), epoch("2026-07-16T13:30:00Z")],
          indicators: { quote: [{
            open: [210, 209], high: [213, 212], low: [208, 207], close: [211, 210], volume: [1, 1],
          }] },
        }],
      },
    };
  }
  const observed = Math.floor((nowMs - 30_000) / 1000);
  return {
    chart: {
      result: [{
        timestamp: [observed],
        // Yahoo exposes a plausible previous-close value but no session date.
        // It must remain diagnostic evidence rather than a forecast input.
        meta: { chartPreviousClose: 202.81 },
        indicators: { quote: [{ open: [203], high: [203.2], low: [202.9], close: [203.1], volume: [1000] }] },
      }],
    },
  };
}

function alpacaBars() {
  return {
    bars: [
      { t: "2026-07-15T04:00:00Z", o: 210, h: 213, l: 208, c: 211, v: 1 },
      { t: "2026-07-16T04:00:00Z", o: 209, h: 212, l: 207, c: 210, v: 1 },
      { t: "2026-07-17T04:00:00Z", o: 202.64, h: 206.645, l: 197.97, c: 202.81, v: 1 },
    ],
  };
}

function alpacaSnapshot(nowMs) {
  return {
    latestTrade: { p: 203.05, t: new Date(nowMs - 20_000).toISOString() },
    dailyBar: { t: "2026-07-20T04:00:00Z", o: 203, h: 203.2, l: 202.9, c: 203.05, v: 100 },
    prevDailyBar: { t: "2026-07-17T04:00:00Z", o: 202.64, h: 206.645, l: 197.97, c: 202.81, v: 1 },
  };
}

function installAlpacaEnv() {
  process.env.APCA_API_KEY_ID = "test-key";
  process.env.APCA_API_SECRET_KEY = "test-secret";
  delete process.env.FINNHUB_API_KEY;
}

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

test("canonical calendar keeps July 2, 2026 open through 16:00 ET", () => {
  const afternoon = Date.parse("2026-07-02T17:01:00Z");
  assert.equal(marketSessionState(afternoon).session, "MARKET OPEN");
  assert.equal(marketTargetSessionDate(afternoon), "2026-07-02");
  assert.equal(marketTargetSessionDate(Date.parse("2026-07-02T20:01:00Z")), "2026-07-06");
});

test("stale, untimestamped, and future-skew Alpaca candidates cannot suppress a current fallback", () => {
  const now = Date.parse("2026-07-20T12:00:00Z");
  const chosen = selectMarketQuote([
    { provider: "alpaca_iex", price: 201, observedAtMs: now - 86_400_000, fetchedAtMs: now, source: "alpaca" },
    { provider: "finnhub", price: 203, observedAtMs: now - 20_000, fetchedAtMs: now, source: "finnhub" },
  ], "PREMARKET", now);
  assert.equal(chosen?.provider, "finnhub");
  assert.equal(chosen?.health.currentForSession, true);

  const futureRejected = selectMarketQuote([
    { provider: "alpaca_iex", price: 205, observedAtMs: now + 120_000, fetchedAtMs: now, source: "alpaca" },
    { provider: "yahoo", price: 203.1, observedAtMs: now - 30_000, fetchedAtMs: now, source: "yahoo" },
  ], "PREMARKET", now);
  assert.equal(futureRejected?.provider, "yahoo");
  assert.equal(marketQuoteHealth(now + 120_000, "PREMARKET", now).futureSkew, true);
});

test("closed markets preserve a last-observation state without calling it current", () => {
  const now = Date.parse("2026-07-19T18:00:00Z");
  const health = marketQuoteHealth(now - 48 * 60 * 60_000, "CLOSED", now);
  assert.equal(health.state, "market_closed");
  assert.equal(health.stale, false);
  assert.equal(health.currentForSession, false);
});

test("Yahoo can fail completely while Alpaca quote and SIP history keep the endpoint available", async () => {
  __resetMarketRouteCachesForTests();
  installAlpacaEnv();
  const now = Date.parse("2026-07-20T12:00:00Z");
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "query1.finance.yahoo.com") return json({ error: "down" }, 503);
    if (url.pathname.endsWith("/bars")) return json(alpacaBars());
    if (url.pathname.endsWith("/snapshot")) return json(alpacaSnapshot(now));
    throw new Error(`Unexpected request: ${url}`);
  };

  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.price, 203.05);
  assert.equal(body.previousClose, 202.81);
  assert.equal(body.previousCloseSession, "2026-07-17");
  assert.equal(body.daily.length, 3);
  assert.equal(body.bars.length, 0);
  assert.equal(body.freshness.history.dailyProvider, "alpaca_sip");
  assert.equal(body.freshness.history.minuteStatus, "error");
  assert.equal(body.sources.find((source) => source.id === "yahoo").status, "error");
});

test("Yahoo daily and minute failures degrade independently", async () => {
  delete process.env.APCA_API_KEY_ID;
  delete process.env.APCA_API_SECRET_KEY;
  delete process.env.FINNHUB_API_KEY;
  const now = Date.parse("2026-07-20T12:00:00Z");
  Date.now = () => now;

  for (const failedInterval of ["1d", "1m"]) {
    __resetMarketRouteCachesForTests();
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const interval = url.searchParams.get("interval");
      if (interval === failedInterval) return json({ error: "temporary" }, 503);
      return json(yahooChart(interval, now));
    };
    const response = await GET();
    assert.equal(response.status, 200, failedInterval);
    const body = await response.json();
    assert.equal(body.freshness.history.dailyStatus, failedInterval === "1d" ? "error" : "ok");
    assert.equal(body.freshness.history.minuteStatus, failedInterval === "1m" ? "error" : "ok");
    assert.equal(body.sources.find((source) => source.id === "yahoo").status, "stale");
    assert.equal(body.daily.length > 0, failedInterval !== "1d");
    assert.equal(body.bars.length > 0, failedInterval !== "1m");
  }
});

test("missing expected prior session never substitutes or mislabels an older or undated close", async () => {
  __resetMarketRouteCachesForTests();
  delete process.env.APCA_API_KEY_ID;
  delete process.env.APCA_API_SECRET_KEY;
  delete process.env.FINNHUB_API_KEY;
  const now = Date.parse("2026-07-20T12:00:00Z");
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== "query1.finance.yahoo.com") throw new Error(`Unexpected request: ${url}`);
    return json(yahooChartMissingExpectedPriorSession(url.searchParams.get("interval"), now));
  };

  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.price, 203.1);
  assert.equal(body.previousClose, null);
  assert.equal(body.previousCloseSession, null);
  assert.equal(body.previousCloseExpectedSession, "2026-07-17");
  assert.equal(body.previousCloseStatus, "degraded");
  assert.deepEqual(
    {
      status: body.freshness.previousClose.status,
      expectedSession: body.freshness.previousClose.expectedSession,
      actualSession: body.freshness.previousClose.actualSession,
      provider: body.freshness.previousClose.provider,
      value: body.freshness.previousClose.value,
      dateVerified: body.freshness.previousClose.dateVerified,
      usedInForecast: body.freshness.previousClose.usedInForecast,
    },
    {
      status: "degraded",
      expectedSession: "2026-07-17",
      actualSession: "2026-07-16",
      provider: "yahoo_daily",
      value: 210,
      dateVerified: true,
      usedInForecast: false,
    },
  );
  const source = body.sources.find((item) => item.id === "previous_close");
  assert.equal(source.status, "stale");
  assert.match(source.detail, /2026-07-16.*expected 2026-07-17.*excluded/);
});

test("expired Yahoo data is served stale-if-error instead of disappearing", async () => {
  __resetMarketRouteCachesForTests();
  delete process.env.APCA_API_KEY_ID;
  delete process.env.APCA_API_SECRET_KEY;
  delete process.env.FINNHUB_API_KEY;
  let now = Date.parse("2026-07-20T12:00:00Z");
  let failYahoo = false;
  Date.now = () => now;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname !== "query1.finance.yahoo.com") throw new Error(`Unexpected request: ${url}`);
    if (failYahoo) return json({ error: "temporary" }, 503);
    return json(yahooChart(url.searchParams.get("interval"), now));
  };

  assert.equal((await GET()).status, 200);
  now += 61_000;
  failYahoo = true;
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.bars.length, 1);
  assert.equal(body.daily.length, 3);
  assert.equal(body.freshness.history.dailyStatus, "stale");
  assert.equal(body.freshness.history.minuteStatus, "stale");
  assert.match(body.freshness.history.minuteError, /Yahoo chart feed failed/);
  assert.equal(body.sources.find((source) => source.id === "yahoo").status, "stale");
});
