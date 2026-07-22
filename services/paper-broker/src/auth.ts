export const PAPER_COMMAND_MAX_SKEW_MS = 30_000;
export const PAPER_COMMAND_MAX_BODY_BYTES = 32_000;

export type PaperNonceStore = {
  rememberOnce(scopedNonce: string, expiresAt: number): Promise<boolean>;
};

export type PaperCommandAuthFailure =
  | "AUDIENCE_INVALID"
  | "BODY_TOO_LARGE"
  | "HEADERS_INVALID"
  | "REPLAY"
  | "SIGNATURE_INVALID"
  | "STALE";

const encoder = new TextEncoder();

async function boundedBody(request: Request, maximumBytes: number) {
  const declared = request.headers.get("content-length");
  if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        try { await reader.cancel("BODY_TOO_LARGE"); } catch { /* The size limit remains authoritative. */ }
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/../g)!, (pair) => Number.parseInt(pair, 16));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function paperSha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hmac(secret: string, value: string) {
  if (encoder.encode(secret).byteLength < 32) throw new Error("PAPER_COMMAND_SECRET_TOO_SHORT");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function canonicalRequest(input: {
  audience: string;
  method: string;
  url: string;
  timestamp: number;
  nonce: string;
  bodyHash: string;
}) {
  const url = new URL(input.url);
  return [
    input.audience,
    url.host.toLowerCase(),
    input.method.toUpperCase(),
    `${url.pathname}${url.search}`,
    String(input.timestamp),
    input.nonce,
    input.bodyHash,
  ].join("\n");
}

export async function signPaperCommand(input: {
  secret: string;
  audience: string;
  timestamp: number;
  nonce: string;
  method: string;
  url: string;
  body?: string;
}) {
  const body = input.body ?? "";
  const bodyHash = await paperSha256(body);
  const signature = await hmac(input.secret, canonicalRequest({ ...input, bodyHash }));
  return new Headers({
    "content-type": "application/json",
    "x-aperture-audience": input.audience,
    "x-aperture-body-sha256": bodyHash,
    "x-aperture-nonce": input.nonce,
    "x-aperture-signature": signature,
    "x-aperture-timestamp": String(input.timestamp),
  });
}

export async function verifyPaperCommandRequest(input: {
  request: Request;
  secret: string;
  audience: string;
  nonces: PaperNonceStore;
  now?: number;
  maximumBodyBytes?: number;
}): Promise<{ ok: true; body: string } | { ok: false; reason: PaperCommandAuthFailure }> {
  const now = input.now ?? Date.now();
  const headers = input.request.headers;
  const audience = headers.get("x-aperture-audience") ?? "";
  const nonce = headers.get("x-aperture-nonce") ?? "";
  const bodyHash = headers.get("x-aperture-body-sha256") ?? "";
  const suppliedSignature = headers.get("x-aperture-signature") ?? "";
  const timestamp = Number(headers.get("x-aperture-timestamp"));
  if (audience !== input.audience) return { ok: false, reason: "AUDIENCE_INVALID" };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !Number.isSafeInteger(timestamp) ||
      !/^[0-9a-f]{64}$/.test(bodyHash) || !/^[0-9a-f]{64}$/.test(suppliedSignature)) {
    return { ok: false, reason: "HEADERS_INVALID" };
  }
  if (Math.abs(now - timestamp) > PAPER_COMMAND_MAX_SKEW_MS) return { ok: false, reason: "STALE" };
  const body = await boundedBody(input.request, input.maximumBodyBytes ?? PAPER_COMMAND_MAX_BODY_BYTES);
  if (body == null) return { ok: false, reason: "BODY_TOO_LARGE" };
  const actualBodyHash = await paperSha256(body);
  const expectedSignature = await hmac(input.secret, canonicalRequest({
    audience,
    method: input.request.method,
    url: input.request.url,
    timestamp,
    nonce,
    bodyHash: actualBodyHash,
  }));
  const suppliedBytes = hexToBytes(suppliedSignature);
  const expectedBytes = hexToBytes(expectedSignature)!;
  if (actualBodyHash !== bodyHash || !suppliedBytes || !constantTimeEqual(suppliedBytes, expectedBytes)) {
    return { ok: false, reason: "SIGNATURE_INVALID" };
  }
  const expiry = Math.max(timestamp, now) + PAPER_COMMAND_MAX_SKEW_MS + 1;
  if (!await input.nonces.rememberOnce(`${audience}:${nonce}`, expiry)) return { ok: false, reason: "REPLAY" };
  return { ok: true, body };
}
