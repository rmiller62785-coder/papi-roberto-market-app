import assert from "node:assert/strict";
import test from "node:test";

import {
  MemoryNonceStore,
  SignedSitesIngestionClient,
  signBrowserAccessToken,
  signSitesIngestion,
  consumeBrowserAccessToken,
  verifyBrowserAccessToken,
  verifySitesIngestionRequest,
} from "../src/auth.ts";

const now = Date.parse("2026-07-20T13:20:00Z");
const url = "https://example.test/internal/market-stream?feed=iex";
const secret = "test-only-ingestion-secret";
const audience = "aperture-sites-market-ingestion";
const nonce = "0123456789abcdef0123456789abcdef";
const body = JSON.stringify({ serviceSequence: 10 });

async function signedRequest(payload = body, timestamp = now, requestNonce = nonce, target = url, signedAudience = audience) {
  const headers = await signSitesIngestion({ secret, audience: signedAudience, timestamp, nonce: requestNonce, method: "POST", url: target, body: payload });
  return new Request(target, { method: "POST", headers, body: payload });
}

test("HMAC binds audience, authority, method, path, query, body, timestamp, and nonce", async () => {
  const result = await verifySitesIngestionRequest({ request: await signedRequest(), secret, audience, nonces: new MemoryNonceStore(() => now), now });
  assert.deepEqual(result, { ok: true, body, audience });

  const wrongAudience = await verifySitesIngestionRequest({ request: await signedRequest(body, now, "audience0123456789", url, "wrong"), secret, audience, nonces: new MemoryNonceStore(() => now), now });
  assert.deepEqual(wrongAudience, { ok: false, reason: "AUDIENCE_INVALID" });

  const signedForOtherAuthority = await signedRequest(body, now, "authority0123456789", "https://other.test/internal/market-stream?feed=iex");
  const copiedHeaders = new Headers(signedForOtherAuthority.headers);
  const authorityTamper = await verifySitesIngestionRequest({ request: new Request(url, { method: "POST", headers: copiedHeaders, body }), secret, audience, nonces: new MemoryNonceStore(() => now), now });
  assert.deepEqual(authorityTamper, { ok: false, reason: "SIGNATURE_INVALID" });
});

test("future-dated nonce remains reserved for its entire acceptance window", async () => {
  let clock = now;
  const store = new MemoryNonceStore(() => clock);
  const timestamp = now + 60_000;
  assert.equal((await verifySitesIngestionRequest({ request: await signedRequest(body, timestamp), secret, audience, nonces: store, now })).ok, true);
  clock = now + 60_001;
  const replay = await verifySitesIngestionRequest({ request: await signedRequest(body, timestamp), secret, audience, nonces: store, now: clock });
  assert.deepEqual(replay, { ok: false, reason: "REPLAY" });
});

test("stale, tampered, and oversized requests fail closed", async () => {
  const stale = await verifySitesIngestionRequest({ request: await signedRequest(body, now - 60_001, "stale0123456789abcdef"), secret, audience, nonces: new MemoryNonceStore(() => now), now });
  assert.deepEqual(stale, { ok: false, reason: "STALE" });
  const headers = await signSitesIngestion({ secret, audience, timestamp: now, nonce: "tamper0123456789abcdef", method: "POST", url, body });
  const tampered = await verifySitesIngestionRequest({ request: new Request(url, { method: "POST", headers, body: "{}" }), secret, audience, nonces: new MemoryNonceStore(() => now), now });
  assert.deepEqual(tampered, { ok: false, reason: "SIGNATURE_INVALID" });
  const oversized = await verifySitesIngestionRequest({ request: await signedRequest(body, now, "oversize0123456789abc"), secret, audience, nonces: new MemoryNonceStore(() => now), now, maximumBodyBytes: 2 });
  assert.deepEqual(oversized, { ok: false, reason: "BODY_TOO_LARGE" });
});

test("browser tokens are origin/audience bound and short lived", async () => {
  const token = await signBrowserAccessToken({ secret, audience: "aperture-market-stream-browser", origin: "https://app.test", expiresAt: now + 30_000, nonce });
  assert.equal(await verifyBrowserAccessToken({ token, secret, audience: "aperture-market-stream-browser", origin: "https://app.test", now }), true);
  assert.equal(await verifyBrowserAccessToken({ token, secret, audience: "aperture-market-stream-browser", origin: "https://evil.test", now }), false);
  assert.equal(await verifyBrowserAccessToken({ token, secret, audience: "aperture-market-stream-browser", origin: "https://app.test", now: now + 30_001 }), false);
});

test("browser tokens are atomically one-use to prevent replayed socket and HTTP fan-out", async () => {
  const token = await signBrowserAccessToken({ secret, audience: "aperture-market-stream-browser", origin: "https://app.test", expiresAt: now + 30_000, nonce });
  const nonces = new MemoryNonceStore(() => now);
  const input = { token, secret, audience: "aperture-market-stream-browser", origin: "https://app.test", now, nonces };
  const [first, replay] = await Promise.all([consumeBrowserAccessToken(input), consumeBrowserAccessToken(input)]);
  assert.deepEqual([first, replay].sort(), [false, true]);
});

test("Sites delivery requires a valid contiguous acknowledgement and rejects non-2xx", async () => {
  const batch = { schemaVersion: "aperture-market-stream-v2", streamId: "stream-1", fromSequence: 1, toSequence: 1, emissions: [{}] };
  const input = { url, secret, audience, sitesAccessBypassToken: "sites-access-token" };
  const failing = new SignedSitesIngestionClient({ ...input, fetcher: async () => new Response("no", { status: 500 }) });
  await assert.rejects(() => failing.send(batch), /INGESTION_HTTP_500/);
  let forwardedAuthorization = null;
  let redirectMode = null;
  const accepting = new SignedSitesIngestionClient({ ...input, fetcher: async (_url, init) => {
    forwardedAuthorization = new Headers(init.headers).get("OAI-Sites-Authorization");
    redirectMode = init.redirect;
    return Response.json({ ok: true, streamId: "stream-1", highestContiguousSequence: 1 });
  } });
  assert.equal((await accepting.send(batch)).highestContiguousSequence, 1);
  assert.equal(forwardedAuthorization, "Bearer sites-access-token");
  assert.equal(redirectMode, "manual");
  const redirecting = new SignedSitesIngestionClient({ ...input, fetcher: async () => new Response(null, { status: 302, headers: { location: "https://evil.test/collect" } }) });
  await assert.rejects(() => redirecting.send(batch), /INGESTION_HTTP_302/);
  const invalid = new SignedSitesIngestionClient({ ...input, fetcher: async () => Response.json({ ok: true, streamId: "other", highestContiguousSequence: 1 }) });
  await assert.rejects(() => invalid.send(batch), /INGESTION_ACK_INVALID/);
});
