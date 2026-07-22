import {
  MARKET_STREAM_SCHEMA,
  type IngestionAck,
  type IngestionBatch,
} from "./contracts.ts";

const HEADER_TIMESTAMP = "x-aperture-timestamp";
const HEADER_NONCE = "x-aperture-nonce";
const HEADER_AUDIENCE = "x-aperture-audience";
const HEADER_SIGNATURE = "x-aperture-signature";
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_BODY_BYTES = 512_000;
const MAX_BROWSER_TOKEN_TTL_MS = 5 * 60_000;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

export interface NonceStore {
  rememberOnce(scopedNonce: string, expiresAt: number): Promise<boolean>;
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const result = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) result[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  return result;
}

async function bodyHash(body: string) {
  return hex(await crypto.subtle.digest("SHA-256", bytes(body)));
}

async function hmacKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey("raw", bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
}

async function requestCanonical(input: { audience: string; timestamp: string; nonce: string; method: string; url: string; body: string }) {
  const url = new URL(input.url);
  return `${input.audience}.${input.timestamp}.${input.nonce}.${input.method.toUpperCase()}.${url.origin}${url.pathname}${url.search}.${await bodyHash(input.body)}`;
}

async function signValue(secret: string, value: string) {
  const key = await hmacKey(secret, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, bytes(value)));
}

async function verifyValue(secret: string, value: string, signature: string) {
  const supplied = fromHex(signature);
  if (!supplied) return false;
  const key = await hmacKey(secret, ["verify"]);
  return crypto.subtle.verify("HMAC", key, supplied, bytes(value));
}

export async function signSitesIngestion(input: {
  secret: string;
  audience: string;
  timestamp: number;
  nonce: string;
  method: string;
  url: string;
  body: string;
}) {
  if (bytes(input.body).byteLength > MAX_BODY_BYTES) throw new Error("INGESTION_BODY_TOO_LARGE");
  const timestamp = String(input.timestamp);
  const value = await requestCanonical({ ...input, timestamp });
  const signature = await signValue(input.secret, value);
  return new Headers({
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: input.nonce,
    [HEADER_AUDIENCE]: input.audience,
    [HEADER_SIGNATURE]: signature,
    "content-type": "application/json",
  });
}

export type SignedRequestResult =
  | { ok: true; body: string; audience: string }
  | { ok: false; reason: "MISSING" | "STALE" | "NONCE_INVALID" | "AUDIENCE_INVALID" | "BODY_TOO_LARGE" | "SIGNATURE_INVALID" | "REPLAY" };

export async function verifySitesIngestionRequest(input: {
  request: Request;
  secret: string;
  audience: string;
  nonces: NonceStore;
  now: number;
  maximumClockSkewMs?: number;
  maximumBodyBytes?: number;
}): Promise<SignedRequestResult> {
  const timestamp = input.request.headers.get(HEADER_TIMESTAMP);
  const nonce = input.request.headers.get(HEADER_NONCE);
  const audience = input.request.headers.get(HEADER_AUDIENCE);
  const signature = input.request.headers.get(HEADER_SIGNATURE);
  if (!timestamp || !nonce || !audience || !signature) return { ok: false, reason: "MISSING" };
  if (audience !== input.audience) return { ok: false, reason: "AUDIENCE_INVALID" };
  const at = Number(timestamp);
  const skew = input.maximumClockSkewMs ?? MAX_CLOCK_SKEW_MS;
  if (!Number.isSafeInteger(at) || Math.abs(input.now - at) > skew) return { ok: false, reason: "STALE" };
  if (!NONCE.test(nonce)) return { ok: false, reason: "NONCE_INVALID" };
  const declaredLength = Number(input.request.headers.get("content-length"));
  const maximumBodyBytes = input.maximumBodyBytes ?? MAX_BODY_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) return { ok: false, reason: "BODY_TOO_LARGE" };
  const body = await input.request.text();
  if (bytes(body).byteLength > maximumBodyBytes) return { ok: false, reason: "BODY_TOO_LARGE" };
  const value = await requestCanonical({ audience, timestamp, nonce, method: input.request.method, url: input.request.url, body });
  if (!await verifyValue(input.secret, value, signature)) return { ok: false, reason: "SIGNATURE_INVALID" };
  // A future-dated request remains acceptable through signed timestamp + skew.
  if (!await input.nonces.rememberOnce(`${audience}:${nonce}`, at + skew)) return { ok: false, reason: "REPLAY" };
  return { ok: true, body, audience };
}

/** Test-only store. Production receivers must use an atomic durable insert. */
export class MemoryNonceStore implements NonceStore {
  readonly #values = new Map<string, number>();
  readonly #now: () => number;
  constructor(now: () => number = Date.now) { this.#now = now; }
  async rememberOnce(nonce: string, expiresAt: number) {
    const now = this.#now();
    for (const [value, expiry] of this.#values) if (expiry < now) this.#values.delete(value);
    if (this.#values.has(nonce)) return false;
    this.#values.set(nonce, expiresAt);
    return true;
  }
}

function browserCanonical(input: { audience: string; origin: string; expiresAt: number; nonce: string }) {
  return `browser.${input.audience}.${new URL(input.origin).origin}.${input.expiresAt}.${input.nonce}`;
}

export async function signBrowserAccessToken(input: {
  secret: string;
  audience: string;
  origin: string;
  expiresAt: number;
  nonce: string;
}) {
  if (!NONCE.test(input.nonce)) throw new Error("NONCE_INVALID");
  return `${input.expiresAt}.${input.nonce}.${await signValue(input.secret, browserCanonical(input))}`;
}

export async function verifyBrowserAccessToken(input: {
  token: string;
  secret: string;
  audience: string;
  origin: string;
  now: number;
}) {
  const [expiresRaw, nonce, signature, ...rest] = input.token.split(".");
  if (rest.length || !NONCE.test(nonce ?? "")) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < input.now || expiresAt > input.now + MAX_BROWSER_TOKEN_TTL_MS) return false;
  return verifyValue(input.secret, browserCanonical({ audience: input.audience, origin: input.origin, expiresAt, nonce }), signature ?? "");
}

/** Verify and atomically consume a browser token. A token authorizes one HTTP request or one socket upgrade. */
export async function consumeBrowserAccessToken(input: {
  token: string;
  secret: string;
  audience: string;
  origin: string;
  now: number;
  nonces: NonceStore;
}) {
  const [expiresRaw, nonce, signature, ...rest] = input.token.split(".");
  if (rest.length || !NONCE.test(nonce ?? "")) return false;
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < input.now || expiresAt > input.now + MAX_BROWSER_TOKEN_TTL_MS) return false;
  const canonical = browserCanonical({ audience: input.audience, origin: input.origin, expiresAt, nonce });
  if (!await verifyValue(input.secret, canonical, signature ?? "")) return false;
  const origin = new URL(input.origin).origin;
  return input.nonces.rememberOnce(`${input.audience}:${origin}:${nonce}`, expiresAt);
}

export class SignedSitesIngestionClient {
  readonly #url: string;
  readonly #secret: string;
  readonly #audience: string;
  readonly #sitesAccessBypassToken: string;
  readonly #fetcher: typeof fetch;
  constructor(input: { url: string; secret: string; audience: string; sitesAccessBypassToken: string; fetcher?: typeof fetch }) {
    this.#url = input.url;
    this.#secret = input.secret;
    this.#audience = input.audience;
    this.#sitesAccessBypassToken = input.sitesAccessBypassToken;
    this.#fetcher = input.fetcher ?? fetch;
  }
  async send(batch: IngestionBatch, now = Date.now()): Promise<IngestionAck> {
    if (batch.schemaVersion !== MARKET_STREAM_SCHEMA || !batch.emissions.length) throw new Error("INGESTION_BATCH_INVALID");
    const body = JSON.stringify(batch);
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const headers = await signSitesIngestion({
      secret: this.#secret,
      audience: this.#audience,
      timestamp: now,
      nonce,
      method: "POST",
      url: this.#url,
      body,
    });
    // Sites custom access protects every application route before the request
    // reaches Next. This Worker-only token crosses that outer gate; the
    // audience-bound HMAC above still authenticates the ingestion payload.
    headers.set("OAI-Sites-Authorization", `Bearer ${this.#sitesAccessBypassToken}`);
    // Never forward the HMAC or Sites bypass bearer to a redirect target.
    const response = await this.#fetcher(this.#url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`INGESTION_HTTP_${response.status}`);
    const ack = await response.json() as Partial<IngestionAck>;
    if (ack.ok !== true || ack.streamId !== batch.streamId || !Number.isSafeInteger(ack.highestContiguousSequence) ||
      ack.highestContiguousSequence! < batch.fromSequence || ack.highestContiguousSequence! > batch.toSequence) {
      throw new Error("INGESTION_ACK_INVALID");
    }
    return ack as IngestionAck;
  }
}
