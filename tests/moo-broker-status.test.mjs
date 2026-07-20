import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetAlpacaBrokerStatusCacheForTests,
  normalizeBorrowStatus,
  pullAlpacaBrokerStatus,
} from "../app/alpaca-broker-status.ts";

const credentials = { keyId: "test-key", secretKey: "test-secret" };
const now = Date.parse("2026-07-20T12:00:00Z");
const json = (value, status = 200) => Response.json(value, { status });

test.afterEach(__resetAlpacaBrokerStatusCacheForTests);

test("missing credentials fail closed without making an upstream request", async () => {
  let calls = 0;
  const result = await pullAlpacaBrokerStatus({
    now,
    credentials: null,
    fetcher: async () => {
      calls += 1;
      throw new Error("must not be called");
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.configured, false);
  assert.equal(result.status, "offline");
  assert.equal(result.shortable, null);
  assert.equal(result.borrowStatus, null);
  assert.equal(result.freshness.state, "unavailable");
  assert.equal(JSON.stringify(result).includes(credentials.secretKey), false);
});

test("current borrow_status is preferred and credentials remain server-side", async () => {
  let requestHeaders;
  const result = await pullAlpacaBrokerStatus({
    now,
    credentials,
    fetcher: async (_input, init) => {
      requestHeaders = init.headers;
      return json({
        symbol: "NVDA",
        status: "active",
        tradable: true,
        shortable: true,
        borrow_status: "hard_to_borrow",
        easy_to_borrow: true,
      });
    },
  });

  assert.equal(requestHeaders["APCA-API-KEY-ID"], credentials.keyId);
  assert.equal(requestHeaders["APCA-API-SECRET-KEY"], credentials.secretKey);
  assert.equal(result.configured, true);
  assert.equal(result.assetStatus, "active");
  assert.equal(result.tradable, true);
  assert.equal(result.shortable, true);
  assert.equal(result.borrowStatus, "hard_to_borrow");
  assert.equal(result.borrowStatusSource, "borrow_status");
  assert.equal(result.indicativeOnly, true);
  assert.equal(result.locateGuaranteed, false);
  assert.equal(JSON.stringify(result).includes(credentials.keyId), false);
  assert.match(result.detail, /does not reserve or guarantee shares/i);
});

test("deprecated easy_to_borrow is normalized only when borrow_status is absent", () => {
  assert.deepEqual(
    normalizeBorrowStatus({ shortable: true, easy_to_borrow: true }),
    { borrowStatus: "easy_to_borrow", borrowStatusSource: "easy_to_borrow" },
  );
  assert.deepEqual(
    normalizeBorrowStatus({ shortable: true, easy_to_borrow: false }),
    { borrowStatus: "hard_to_borrow", borrowStatusSource: "easy_to_borrow" },
  );
  assert.deepEqual(
    normalizeBorrowStatus({ shortable: false, easy_to_borrow: false }),
    { borrowStatus: "unavailable", borrowStatusSource: "easy_to_borrow" },
  );
});

test("a successful check is reused for sixty seconds and marked cached", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return json({ symbol: "NVDA", status: "active", tradable: true, shortable: true, borrow_status: "easy_to_borrow" });
  };
  const first = await pullAlpacaBrokerStatus({ now, credentials, fetcher });
  const second = await pullAlpacaBrokerStatus({ now: now + 59_000, credentials, fetcher });

  assert.equal(calls, 1);
  assert.equal(first.freshness.state, "fresh");
  assert.equal(second.freshness.state, "cached");
  assert.equal(second.freshness.ageMs, 59_000);
});

test("simultaneous cache misses share one upstream request", async () => {
  let calls = 0;
  let release;
  const responseGate = new Promise((resolve) => { release = resolve; });
  const fetcher = async () => {
    calls += 1;
    await responseGate;
    return json({ symbol: "NVDA", status: "active", tradable: true, shortable: true, borrow_status: "easy_to_borrow" });
  };

  const first = pullAlpacaBrokerStatus({ now, credentials, fetcher });
  const second = pullAlpacaBrokerStatus({ now, credentials, fetcher });
  assert.equal(calls, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(firstResult.status, "live");
  assert.equal(secondResult.status, "live");
  assert.equal(firstResult.checkedAt, secondResult.checkedAt);
});

test("provider failures return a public-safe offline state", async () => {
  const result = await pullAlpacaBrokerStatus({
    now,
    credentials,
    fetcher: async () => json({ message: "forbidden" }, 403),
  });

  assert.equal(result.configured, true);
  assert.equal(result.status, "offline");
  assert.equal(result.shortable, null);
  assert.equal(result.borrowStatus, null);
  assert.match(result.detail, /temporarily unavailable \(HTTP 403\)/i);
  assert.equal(JSON.stringify(result).includes(credentials.secretKey), false);
});

test("an expired last-known-good value is explicitly stale on provider failure", async () => {
  await pullAlpacaBrokerStatus({
    now,
    credentials,
    fetcher: async () => json({ symbol: "NVDA", status: "active", tradable: true, shortable: true, borrow_status: "easy_to_borrow" }),
  });
  const result = await pullAlpacaBrokerStatus({
    now: now + 61_000,
    credentials,
    fetcher: async () => json({ message: "down" }, 503),
  });

  assert.equal(result.status, "limited");
  assert.equal(result.freshness.state, "stale");
  assert.equal(result.freshness.ageMs, 61_000);
  assert.equal(result.borrowStatus, "easy_to_borrow");
  assert.match(result.detail, /shown as stale/i);
});
