import assert from "node:assert/strict";
import test from "node:test";

import { AlpacaRestRecoveryClient } from "../src/provider-rest.ts";
import { fetchAdaptiveProviderRecoverySegment } from "../src/recovery.ts";

const base = Date.parse("2026-07-20T13:20:00Z");

test("REST recovery pins feed, overlaps caller watermark, paginates, and excludes unfinished bars", async () => {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url: String(url), headers: init.headers });
    const path = new URL(url).pathname;
    if (path.endsWith("/trades")) return Response.json({ trades: [{ i: 1, x: "Q", p: 200, s: 1, c: ["@"], t: "2026-07-20T13:20:01.000000001Z", z: "C" }], next_page_token: null });
    if (path.endsWith("/quotes")) return Response.json({ quotes: [{ bx: "Q", bp: 199.9, bs: 1, ax: "P", ap: 200.1, as: 2, c: ["R"], t: "2026-07-20T13:20:02.000000001Z", z: "C" }], next_page_token: null });
    return Response.json({ bars: [
      { o: 200, h: 201, l: 199, c: 200.5, v: 100, n: 10, vw: 200.2, t: "2026-07-20T13:20:00Z" },
      { o: 201, h: 202, l: 200, c: 201.5, v: 50, n: 5, vw: 201.2, t: "2026-07-20T13:21:00Z" },
    ], next_page_token: null });
  };
  const client = new AlpacaRestRecoveryClient({ feed: "iex", keyId: "key", secretKey: "secret", fetcher, now: () => base + 61_100 });
  const events = await client.fetchEvents({ symbol: "NVDA", feed: "iex", atOrAfterProviderAt: base, beforeOrAt: base + 61_000 });
  assert.deepEqual(events.map((event) => event.kind), ["BAR", "TRADE", "QUOTE"]);
  assert.equal(events.every((event) => event.transport === "REST_RECOVERY"), true);
  assert.equal(events.filter((event) => event.kind === "BAR").length, 1);
  assert.equal(requests.length, 3);
  assert.equal(new URL(requests[0].url).searchParams.get("feed"), "iex");
  assert.equal(new URL(requests[0].url).searchParams.get("start"), "2026-07-20T13:20:00.000000000Z");
  assert.equal(new URL(requests[0].url).searchParams.get("end"), "2026-07-20T13:21:01.000999999Z");
  assert.equal(requests[0].headers["APCA-API-SECRET-KEY"], "secret");
  const sip = new AlpacaRestRecoveryClient({ feed: "sip", keyId: "key", secretKey: "secret", fetcher, now: () => base + 61_100 });
  const sipEvents = await sip.fetchEvents({ symbol: "NVDA", feed: "sip", atOrAfterProviderAt: base, beforeOrAt: base + 61_000 });
  assert.equal(sipEvents.every((event) => event.coverage.executionEligible), true);
  await assert.rejects(() => client.fetchEvents({ symbol: "NVDA", feed: "sip", atOrAfterProviderAt: base, beforeOrAt: base + 1 }), /RECOVERY_FEED_MISMATCH/);
});

test("inclusive millisecond recovery boundaries retain the final nanosecond", async () => {
  const timestamp = "2026-07-20T13:20:00.000999999Z";
  const fetcher = async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/trades")) return Response.json({ trades: [{ i: 99, x: "Q", p: 200, s: 1, c: ["@"], t: timestamp, z: "C" }], next_page_token: null });
    const key = path.endsWith("/quotes") ? "quotes" : "bars";
    return Response.json({ [key]: [], next_page_token: null });
  };
  const client = new AlpacaRestRecoveryClient({ feed: "iex", keyId: "key", secretKey: "secret", fetcher, now: () => base + 100 });
  const events = await client.fetchEvents({ symbol: "NVDA", feed: "iex", atOrAfterProviderAt: base, beforeOrAt: base });
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceTimestamp.epochNanos.endsWith("000999999"), true);
});

test("REST recovery rejects repeating page tokens instead of looping or skipping", async () => {
  const fetcher = async (url) => {
    const path = new URL(url).pathname;
    const key = path.endsWith("/trades") ? "trades" : path.endsWith("/quotes") ? "quotes" : "bars";
    return Response.json({ [key]: [], next_page_token: "same-token" });
  };
  const client = new AlpacaRestRecoveryClient({ feed: "iex", keyId: "key", secretKey: "secret", fetcher, now: () => base });
  await assert.rejects(() => client.fetchEvents({ symbol: "NVDA", feed: "iex", atOrAfterProviderAt: base, beforeOrAt: base + 1 }), /ALPACA_RECOVERY_PAGE_TOKEN_LOOP/);
});

test("dense SIP recovery adaptively bisects a page-capped window and advances a bounded prefix", async () => {
  const requestedEnds = [];
  const fetcher = async (url) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const key = path.endsWith("/trades") ? "trades" : path.endsWith("/quotes") ? "quotes" : "bars";
    if (key !== "trades") return Response.json({ [key]: [], next_page_token: null });
    const start = Date.parse(parsed.searchParams.get("start"));
    const end = Date.parse(parsed.searchParams.get("end"));
    const page = Number(parsed.searchParams.get("page_token") ?? 0);
    requestedEnds.push(end);
    const dense = end - start + 1 > 60_000;
    const item = { i: `${start}-${end}-${page}`, x: "Q", p: 200, s: 1, c: ["@"], t: new Date(start + page).toISOString(), z: "C" };
    return Response.json({ trades: [item], next_page_token: dense || page === 0 ? String(page + 1) : null });
  };
  const client = new AlpacaRestRecoveryClient({ feed: "sip", keyId: "key", secretKey: "secret", fetcher, now: () => base + 1_000_000, maximumPages: 2 });
  const segment = await fetchAdaptiveProviderRecoverySegment({
    provider: client,
    feed: "sip",
    startAt: base,
    throughAt: base + 15 * 60_000 - 1,
  });
  assert.ok(segment.windowMs <= 60_000);
  assert.equal(segment.beforeOrAt, base + segment.windowMs - 1);
  assert.equal(segment.events.length, 2);
  assert.equal(segment.events.every((event) => event.coverage.executionEligible), true);
  assert.ok(new Set(requestedEnds).size > 1, "the capped 15-minute window was bisected");
});
