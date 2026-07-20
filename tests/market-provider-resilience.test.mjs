import assert from "node:assert/strict";
import test from "node:test";

import {
  __providerRequestForTests,
  __resetMarketRouteCachesForTests,
} from "../app/api/market/route.ts";

test("provider requests coalesce by provider/product key while unrelated keys proceed", async () => {
  __resetMarketRouteCachesForTests();
  let releaseQuote;
  const quoteGate = new Promise((resolve) => {
    releaseQuote = resolve;
  });
  let quoteCalls = 0;
  const quoteOperation = async () => {
    quoteCalls += 1;
    await quoteGate;
    return { price: 170.25, fetchedAt: 123 };
  };

  const quoteA = __providerRequestForTests("quote", quoteOperation);
  const quoteB = __providerRequestForTests("quote", quoteOperation);
  await Promise.resolve();
  assert.equal(quoteCalls, 1, "same-key callers must share one upstream operation");

  let historyCalls = 0;
  const history = await __providerRequestForTests("history", async () => {
    historyCalls += 1;
    return "history-ready";
  });
  assert.equal(history, "history-ready");
  assert.equal(historyCalls, 1, "one slow provider/product must not block another key");

  releaseQuote();
  const [first, second] = await Promise.all([quoteA, quoteB]);
  assert.strictEqual(first, second, "coalesced callers receive the exact same result object");
  assert.equal(quoteCalls, 1);
});

test("concurrent provider failures share one attempt and immediately enter negative cache", async () => {
  __resetMarketRouteCachesForTests();
  const now = () => 1_000_000;
  let calls = 0;
  const failure = new Error("upstream unavailable");
  const operation = async () => {
    calls += 1;
    throw failure;
  };

  const requests = Array.from({ length: 8 }, () =>
    __providerRequestForTests("failed-quote", operation, now));
  const settled = await Promise.allSettled(requests);
  assert.equal(calls, 1);
  assert.ok(settled.every((result) => result.status === "rejected" && result.reason === failure));

  const deferred = await __providerRequestForTests("failed-quote", operation, now)
    .then(() => null, (error) => error);
  assert.equal(calls, 1, "negative cache must not execute another upstream request");
  assert.equal(deferred?.code, "PROVIDER_RETRY_DEFERRED");
  assert.equal(deferred?.retryAt, 1_002_000);
});

test("provider backoff is bounded, opens after repeated failures, and resets after recovery", async () => {
  __resetMarketRouteCachesForTests();
  let currentTime = 2_000_000;
  const now = () => currentTime;
  let failureCalls = 0;
  const fail = async () => {
    failureCalls += 1;
    throw new Error(`failure ${failureCalls}`);
  };
  const expectedDelays = [2_000, 4_000, 10_000, 20_000, 40_000, 60_000, 60_000];

  for (const delay of expectedDelays) {
    await assert.rejects(__providerRequestForTests("recovering-provider", fail, now), /failure/);
    const deferred = await __providerRequestForTests("recovering-provider", fail, now)
      .then(() => null, (error) => error);
    assert.equal(deferred?.code, "PROVIDER_RETRY_DEFERRED");
    assert.equal(deferred?.retryAt - currentTime, delay);
    currentTime = deferred.retryAt;
  }
  assert.equal(failureCalls, expectedDelays.length);

  let recoveryCalls = 0;
  const recovered = await __providerRequestForTests("recovering-provider", async () => {
    recoveryCalls += 1;
    return "recovered";
  }, now);
  assert.equal(recovered, "recovered");
  assert.equal(recoveryCalls, 1);

  await assert.rejects(__providerRequestForTests("recovering-provider", fail, now), /failure/);
  const resetDeferred = await __providerRequestForTests("recovering-provider", fail, now)
    .then(() => null, (error) => error);
  assert.equal(
    resetDeferred?.retryAt - currentTime,
    2_000,
    "a successful half-open request must reset the failure counter",
  );
});
