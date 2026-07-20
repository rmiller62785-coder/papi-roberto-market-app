import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetPolymarketCacheForTests,
  POLYMARKET_MAX_BASELINE_AGE_MS,
  pullPolymarketEvidence,
  roundRobinUnique,
} from "../app/polymarket.ts";

const now = Date.parse("2026-07-18T16:00:00Z");
const cutoff = Date.parse("2026-07-17T20:00:00Z");
const yesToken = "yes-token";

test.beforeEach(() => __resetPolymarketCacheForTests());

test("bounded discovery reserves detail slots across registry queries", () => {
  assert.deepEqual(
    roundRobinUnique([["a1", "a2", "a3"], ["b1", "b2"], ["c1"], ["d1", "d2"]], 6),
    ["a1", "b1", "c1", "d1", "a2", "b2"],
  );
});

function market(overrides = {}) {
  return {
    id: "market-1",
    question: "Will the U.S. strike Iran before August 1?",
    description: "Resolves Yes if the United States conducts a military strike against Iran.",
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    outcomes: '["Yes","No"]',
    clobTokenIds: JSON.stringify([yesToken, "no-token"]),
    liquidityNum: 50_000,
    volume24hr: 20_000,
    endDate: "2026-08-01T23:59:00Z",
    updatedAt: "2026-07-18T15:55:00Z",
    ...overrides,
  };
}

function event(markets = [market()]) {
  return {
    id: "event-1",
    slug: "us-strikes-iran-before-august",
    active: true,
    closed: false,
    markets,
  };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetcher({
  searchEvent = event(),
  books = [{
    asset_id: yesToken,
    timestamp: String(now),
    bids: [{ price: "0.10" }, { price: "0.40" }, { price: "0.25" }],
    asks: [{ price: "0.90" }, { price: "0.50" }, { price: "0.42" }],
  }],
  history = [{ t: Math.floor(cutoff / 1000) - 60, p: 0.25 }],
} = {}) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname === "/public-search") {
      return json(url.searchParams.get("q") === "US Iran strike" ? { events: [{ id: "event-1" }] } : { events: [] });
    }
    if (url.pathname === "/events/event-1") return json(searchEvent);
    if (url.pathname === "/books" && init.method === "POST") return json(books);
    if (url.pathname === "/prices-history") return json({ history });
    return json({ error: "unexpected request" }, 404);
  };
}

test("only a fixed-registry relevant market can produce a probability shock", async () => {
  const relevant = await pullPolymarketEvidence({ priorCloseCutoffMs: cutoff, now, fetcher: mockFetcher() });
  const irrelevant = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: mockFetcher({
      searchEvent: event([market({
        id: "gpu-market",
        question: "Will B200 GPU rental prices rise in August?",
        description: "A GPU rental market unrelated to a registered geopolitical outcome.",
      })]),
    }),
  });

  assert.equal(relevant.status, "live");
  assert.equal(relevant.signalState, "active");
  assert.equal(relevant.markets.length, 1);
  assert.equal(relevant.nvdaDirection, null);
  assert.ok(Math.abs(relevant.signedRiskOffShock - 0.16) < 1e-9);
  assert.ok(Math.abs(relevant.rangeSignal - 0.16) < 1e-9);
  assert.equal(irrelevant.status, "limited");
  assert.equal(irrelevant.signalState, "neutral");
  assert.equal(irrelevant.rangeSignal, 0);
});

test("public discovery, book, and history reads send no authentication secrets", async () => {
  const seen = [];
  const base = mockFetcher();
  const result = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: async (input, init = {}) => {
      seen.push(new Headers(init.headers));
      return base(input, init);
    },
  });
  assert.equal(result.status, "live");
  for (const headers of seen) {
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("poly-api-key"), false);
    assert.equal(headers.has("poly-signature"), false);
  }
});

test("a transient public API failure exposes last-known-good evidence but applies zero", async () => {
  const first = await pullPolymarketEvidence({ priorCloseCutoffMs: cutoff, now, fetcher: mockFetcher() });
  assert.equal(first.signalState, "active");
  const failed = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now: now + 60_000,
    fetcher: async () => json({ error: "rate limited" }, 429),
  });
  assert.equal(failed.status, "limited");
  assert.equal(failed.signalState, "neutral");
  assert.equal(failed.rangeSignal, 0);
  assert.equal(failed.primaryMarketId, null);
  assert.equal(failed.markets.length, first.markets.length);
  assert.match(failed.reason, /display-only and contributes zero/i);
});

test("a wider-than-ten-point order book is neutral and excluded", async () => {
  const result = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: mockFetcher({
      books: [{
        asset_id: yesToken,
        timestamp: String(now),
        bids: [{ price: "0.20" }],
        asks: [{ price: "0.31" }],
      }],
    }),
  });

  assert.equal(result.status, "limited");
  assert.equal(result.signalState, "neutral");
  assert.equal(result.rangeSignal, 0);
  assert.match(result.reason, /wider-than-10-point/i);
});

test("best bid and ask are derived from an unsorted book", async () => {
  const result = await pullPolymarketEvidence({ priorCloseCutoffMs: cutoff, now, fetcher: mockFetcher() });
  const selected = result.markets[0];

  assert.equal(selected.bestBid, 0.4);
  assert.equal(selected.bestAsk, 0.42);
  assert.ok(Math.abs(selected.currentProbability - 0.41) < 1e-9);
});

test("history points after the prior-close cutoff are rejected", async () => {
  const result = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: mockFetcher({
      history: [
        { t: Math.floor(cutoff / 1000) - 60, p: 0.2 },
        { t: Math.floor(cutoff / 1000) + 60, p: 0.8 },
      ],
    }),
  });

  assert.equal(result.markets[0].priorCloseProbability, 0.2);
  assert.equal(result.markets[0].baselineObservedAt, cutoff - 60_000);
  assert.ok(Math.abs(result.signedRiskOffShock - 0.21) < 1e-9);
  assert.ok(Math.abs(result.rangeSignal - 0.21) < 1e-9);
});

test("a baseline just inside the prior-close age bound can activate", async () => {
  const observedAt = cutoff - POLYMARKET_MAX_BASELINE_AGE_MS + 1;
  const result = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: mockFetcher({ history: [{ t: observedAt / 1000, p: 0.25 }] }),
  });
  assert.equal(result.status, "live");
  assert.equal(result.signalState, "active");
  assert.equal(result.markets[0].baselineObservedAt, observedAt);
});

test("a baseline just outside the prior-close age bound is display-only and applies zero", async () => {
  const observedAt = cutoff - POLYMARKET_MAX_BASELINE_AGE_MS - 1;
  const result = await pullPolymarketEvidence({
    priorCloseCutoffMs: cutoff,
    now,
    fetcher: mockFetcher({ history: [{ t: observedAt / 1000, p: 0.25 }] }),
  });
  assert.equal(result.status, "limited");
  assert.equal(result.signalState, "neutral");
  assert.equal(result.rangeSignal, 0);
  assert.equal(result.primaryMarketId, null);
  assert.equal(result.markets.length, 1);
  assert.equal(result.markets[0].baselineObservedAt, null);
  assert.match(result.reason, /within two hours|display-only/i);
});

for (const [label, timestamp] of [
  ["missing", undefined],
  ["stale", String(now - 16 * 60_000)],
  ["future", String(now + 61_000)],
]) {
  test(`${label} order-book timestamps cannot activate Polymarket evidence`, async () => {
    const result = await pullPolymarketEvidence({
      priorCloseCutoffMs: cutoff,
      now,
      fetcher: mockFetcher({
        books: [{
          asset_id: yesToken,
          timestamp,
          bids: [{ price: "0.40" }],
          asks: [{ price: "0.42" }],
        }],
      }),
    });

    assert.equal(result.status, "limited");
    assert.equal(result.signalState, "neutral");
    assert.equal(result.rangeSignal, 0);
    assert.match(result.reason, /missing, stale, or future timestamps/i);
  });
}
