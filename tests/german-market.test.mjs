import assert from "node:assert/strict";
import test from "node:test";

import { GERMAN_MAX_SPREAD_BPS, parseTradegateNvdaHtml, pullGermanMarketEvidence } from "../app/german-market.ts";

const now = Date.parse("2026-07-20T12:05:00Z");
const priorClose = Date.parse("2026-07-17T20:00:00Z");
const targetOpen = Date.parse("2026-07-20T13:30:00Z");

function tradegate({ date = "20/07/2026", time = "14:00:00", isin = "US67066G1040", name = "Nvidia Corp.", symbol = "NVD", bid = 149.90, ask = 150.10, bidSize = 1_200, askSize = 900 } = {}) {
  return `<html><h1>${name}</h1><table><tr><td>${symbol}</td><td>${isin}</td></tr></table>
    <strong id="bid">${bid}</strong><strong id="ask">${ask}</strong>
    <td id="bidsize">${bidSize}</td><td id="asksize">${askSize}</td>
    <td id="high">151.00</td><td id="low">148.00</td><strong id="last">150.00</strong>
    <td id="delta">+0.75%</td><td id="stueck">12&nbsp;345</td>
    <span id="rt_datum">${date}</span><span id="rt_zeit">${time}</span></html>`;
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function fetcher({ html = tradegate(), fxAt = now - 5 * 60_000, fx = 1.14, fxStatus = 200, prior = 170, session = "2026-07-17" } = {}) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname.includes("tradegate")) return new Response(html, { headers: { "Content-Type": "text/html" } });
    if (url.pathname.includes("EURUSD")) {
      if (fxStatus !== 200) return json({ error: "down" }, fxStatus);
      return json({ chart: { result: [{ timestamp: [Math.floor(fxAt / 1000)], indicators: { quote: [{ close: [fx] }] } }] } });
    }
    if (url.pathname.endsWith("/NVDA")) {
      const observed = Date.parse(`${session}T13:30:00Z`);
      return json({ chart: { result: [{ timestamp: [Math.floor(observed / 1000)], indicators: { quote: [{ close: [prior] }] } }] } });
    }
    return json({ error: "unexpected" }, 404);
  };
}

const options = (overrides = {}) => ({
  targetDate: "2026-07-20",
  expectedPreviousSession: "2026-07-17",
  priorSessionCloseMs: priorClose,
  targetOpenMs: targetOpen,
  now,
  fetcher: fetcher(),
  ...overrides,
});

test("parses the exact Tradegate NVIDIA contract and Berlin timestamp", () => {
  const parsed = parseTradegateNvdaHtml(tradegate());
  assert.ok(parsed);
  assert.equal(parsed.observedAt, Date.parse("2026-07-20T12:00:00Z"));
  assert.equal(parsed.quote.midpointEur, 150);
  assert.ok(parsed.quote.spreadBps < GERMAN_MAX_SPREAD_BPS);
  assert.equal(parsed.quote.volume, 12_345);
  assert.equal(parsed.quote.changePct, 0.75);
});

test("fresh FX-converted German evidence is range-only and never strict-entitled", async () => {
  const result = await pullGermanMarketEvidence(options());
  assert.equal(result.status, "live");
  assert.equal(result.signalState, "active");
  assert.ok(Math.abs(result.impliedUsd - 171) < 1e-9);
  assert.ok(Math.abs(result.impliedGapPct - (100 / 170)) < 1e-9);
  assert.ok(result.rangeSignal > 0);
  assert.equal(result.nvdaDirection, null);
  assert.equal(result.calibrationStatus, "UNCALIBRATED");
  assert.equal(result.effectMode, "RANGE_ONLY");
  assert.equal(result.strictEligible, false);
});

test("wrong security or ISIN is rejected", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ html: tradegate({ isin: "US0000000000", name: "Other Corp.", symbol: "OTH" }) }) }));
  assert.equal(result.status, "offline");
  assert.equal(result.signalState, "unavailable");
  assert.equal(result.quote, null);
});

test("missing FX preserves the quote as limited but contributes no signal", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ fxStatus: 503 }) }));
  assert.equal(result.status, "limited");
  assert.ok(result.quote);
  assert.equal(result.eurUsd, null);
  assert.equal(result.rangeSignal, 0);
  assert.equal(result.strictEligible, false);
});

test("an unusably wide German spread is display-only and neutral", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ html: tradegate({ bid: 149, ask: 151 }) }) }));
  assert.equal(result.status, "limited");
  assert.ok(result.quote.spreadBps > GERMAN_MAX_SPREAD_BPS);
  assert.equal(result.rangeSignal, 0);
  assert.equal(result.signal, 0);
  assert.match(result.reason, /spread exceeds/i);
});

for (const [side, sizes] of [
  ["bid", { bidSize: 0 }],
  ["ask", { askSize: -1 }],
]) {
  test(`nonpositive ${side} depth is display-only and neutral`, async () => {
    const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ html: tradegate(sizes) }) }));
    assert.equal(result.status, "limited");
    assert.equal(result.rangeSignal, 0);
    assert.equal(result.signal, 0);
    assert.match(result.reason, /zero or nonpositive quoted depth/i);
  });
}

test("stale or closed German observations are limited and neutral", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ html: tradegate({ date: "17/07/2026", time: "22:00:00" }) }) }));
  assert.equal(result.status, "limited");
  assert.equal(result.signalState, "unavailable");
  assert.equal(result.rangeSignal, 0);
  assert.match(result.reason, /closed|older than 10 minutes/i);
});

test("future-skewed German timestamps are held neutral", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ html: tradegate({ time: "14:07:00" }) }) }));
  assert.equal(result.status, "limited");
  assert.equal(result.rangeSignal, 0);
  assert.match(result.reason, /future timestamp/i);
});

test("a close from the wrong U.S. session cannot anchor German evidence", async () => {
  const result = await pullGermanMarketEvidence(options({ fetcher: fetcher({ session: "2026-07-16" }) }));
  assert.equal(result.status, "limited");
  assert.equal(result.previousUsCloseUsd, null);
  assert.equal(result.rangeSignal, 0);
});
