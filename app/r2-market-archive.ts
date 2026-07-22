import { canonicalMooJson, mooCanonicalDigest, mooSha256Hex } from "./moo-contract.ts";

export const MARKET_ARCHIVE_SCHEMA = "aperture-market-archive-v1" as const;

export type MarketArchiveRecord = {
  streamId: string;
  serviceSequence: number;
  connectionEpoch: number;
  availableAt: number;
  payloadHash: string;
  payload: unknown;
};

export type MarketArchiveManifest = {
  schemaVersion: typeof MARKET_ARCHIVE_SCHEMA;
  objectKey: string;
  provider: string;
  feed: string;
  symbol: string;
  sessionDate: string;
  streamId: string;
  firstSequence: number;
  lastSequence: number;
  firstAvailableAt: number;
  lastAvailableAt: number;
  sealedAt: number;
  rowCount: number;
  byteLength: number;
  contentHash: string;
  manifestHash: string;
};

export type MarketArchiveSegment = {
  manifest: MarketArchiveManifest;
  body: Uint8Array;
};

export type R2ArchiveHead = {
  size: number;
  customMetadata?: Record<string, string>;
};

export type R2ArchiveObject = R2ArchiveHead & {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type R2ArchiveBucket = {
  head(key: string): Promise<R2ArchiveHead | null>;
  get(key: string): Promise<R2ArchiveObject | null>;
  put(
    key: string,
    body: Uint8Array,
    options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> },
  ): Promise<unknown>;
};

export type MarketArchiveWriteResult = {
  status: "CREATED" | "EXISTS_VERIFIED";
  verified: true;
  manifest: MarketArchiveManifest;
};

export class MarketArchiveConflictError extends Error {
  readonly code = "MARKET_ARCHIVE_OBJECT_CONFLICT";
  constructor(key: string) {
    super(`A different archive object already exists at ${key}`);
    this.name = "MarketArchiveConflictError";
  }
}

export class MarketArchiveVerificationError extends Error {
  readonly code = "MARKET_ARCHIVE_VERIFICATION_FAILED";
  constructor(key: string) {
    super(`The written archive object could not be verified at ${key}`);
    this.name = "MarketArchiveVerificationError";
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_PART = /^[A-Za-z0-9._:@+\-=]{1,256}$/;
const HASH = /^(?:sha256:)?[0-9a-f]{64}$/;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function timestamp(value: unknown, label: string): asserts value is number {
  invariant(typeof value === "number" && Number.isSafeInteger(value) && value >= 0, `${label} must be a timestamp`);
}

function validDate(value: string) {
  if (!DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function safePart(value: string, label: string) {
  invariant(typeof value === "string" && SAFE_PART.test(value), `${label} is invalid`);
  return encodeURIComponent(value);
}

function normalizedHash(value: string) {
  return value.startsWith("sha256:") ? value.slice(7) : value;
}

function validateRecord(record: MarketArchiveRecord, expectedStreamId: string, prior?: MarketArchiveRecord) {
  invariant(record && typeof record === "object", "archive record is invalid");
  invariant(record.streamId === expectedStreamId, "archive records must share one streamId");
  invariant(Number.isSafeInteger(record.serviceSequence) && record.serviceSequence > 0, "serviceSequence must be positive");
  invariant(Number.isSafeInteger(record.connectionEpoch) && record.connectionEpoch >= 0, "connectionEpoch must be nonnegative");
  timestamp(record.availableAt, "availableAt");
  invariant(typeof record.payloadHash === "string" && HASH.test(record.payloadHash), "payloadHash is invalid");
  const computedPayloadHash = mooSha256Hex(canonicalMooJson(record.payload));
  invariant(computedPayloadHash === normalizedHash(record.payloadHash), "payloadHash does not match the canonical payload");
  if (prior) {
    invariant(record.serviceSequence === prior.serviceSequence + 1, "archive serviceSequence must form one contiguous prefix");
    invariant(record.connectionEpoch >= prior.connectionEpoch, "archive connectionEpoch cannot regress");
    invariant(record.availableAt >= prior.availableAt, "archive availableAt cannot regress");
  }
}

/**
 * Build a deterministic, immutable JSONL segment from a contiguous receiver
 * prefix. The archive preserves the complete emission payload and all
 * availability timestamps; it never reconstructs observations from later
 * market history.
 */
export function buildR2MarketArchiveSegment(input: {
  provider: string;
  feed: string;
  symbol: string;
  sessionDate: string;
  streamId: string;
  sealedAt: number;
  records: MarketArchiveRecord[];
}): MarketArchiveSegment {
  const provider = safePart(input.provider, "provider");
  const feed = safePart(input.feed, "feed");
  const symbol = safePart(input.symbol, "symbol");
  const stream = safePart(input.streamId, "streamId");
  invariant(validDate(input.sessionDate), "sessionDate must be a real YYYY-MM-DD date");
  timestamp(input.sealedAt, "sealedAt");
  invariant(Array.isArray(input.records) && input.records.length > 0, "archive segment must contain records");

  input.records.forEach((record, index) => validateRecord(record, input.streamId, input.records[index - 1]));
  const first = input.records[0];
  const last = input.records.at(-1)!;
  invariant(last.availableAt <= input.sealedAt, "archive cannot seal evidence that was not yet available");

  const jsonl = `${input.records.map((record) => canonicalMooJson(record)).join("\n")}\n`;
  const body = new TextEncoder().encode(jsonl);
  const contentHash = `sha256:${mooSha256Hex(jsonl)}`;
  const objectKey = [
    "market-stream", MARKET_ARCHIVE_SCHEMA,
    `provider=${provider}`, `feed=${feed}`, `symbol=${symbol}`,
    `session=${input.sessionDate}`, `stream=${stream}`,
    `sequence=${String(first.serviceSequence).padStart(12, "0")}-${String(last.serviceSequence).padStart(12, "0")}`,
    `${contentHash}.jsonl`,
  ].join("/");
  const base = {
    schemaVersion: MARKET_ARCHIVE_SCHEMA,
    objectKey,
    provider: input.provider,
    feed: input.feed,
    symbol: input.symbol,
    sessionDate: input.sessionDate,
    streamId: input.streamId,
    firstSequence: first.serviceSequence,
    lastSequence: last.serviceSequence,
    firstAvailableAt: first.availableAt,
    lastAvailableAt: last.availableAt,
    sealedAt: input.sealedAt,
    rowCount: input.records.length,
    byteLength: body.byteLength,
    contentHash,
  };
  const manifest: MarketArchiveManifest = {
    ...base,
    manifestHash: mooCanonicalDigest(base, []),
  };
  return { manifest, body };
}

function metadata(manifest: MarketArchiveManifest) {
  return {
    schema: manifest.schemaVersion,
    contentHash: manifest.contentHash,
    manifestHash: manifest.manifestHash,
    rowCount: String(manifest.rowCount),
    firstSequence: String(manifest.firstSequence),
    lastSequence: String(manifest.lastSequence),
  };
}

export function archiveHeadMatches(head: R2ArchiveHead | null, manifest: MarketArchiveManifest) {
  if (!head || head.size !== manifest.byteLength) return false;
  const expected = metadata(manifest);
  return Object.entries(expected).every(([key, value]) => head.customMetadata?.[key] === value);
}

async function archiveObjectMatches(bucket: R2ArchiveBucket, manifest: MarketArchiveManifest) {
  const head = await bucket.head(manifest.objectKey);
  if (!archiveHeadMatches(head, manifest)) return false;
  const object = await bucket.get(manifest.objectKey);
  if (!object || !archiveHeadMatches(object, manifest)) return false;
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength !== manifest.byteLength) return false;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}` === manifest.contentHash;
}

/**
 * Write once and verify by independent HEAD metadata. Callers may prune hot
 * data only after this returns a verified result. A mismatched pre-existing
 * key is an explicit conflict and is never overwritten.
 */
export async function putR2MarketArchiveSegment(
  bucket: R2ArchiveBucket,
  segment: MarketArchiveSegment,
): Promise<MarketArchiveWriteResult> {
  const existing = await bucket.head(segment.manifest.objectKey);
  if (existing) {
    if (!await archiveObjectMatches(bucket, segment.manifest)) {
      throw new MarketArchiveConflictError(segment.manifest.objectKey);
    }
    return { status: "EXISTS_VERIFIED", verified: true, manifest: segment.manifest };
  }
  await bucket.put(segment.manifest.objectKey, segment.body, {
    httpMetadata: { contentType: "application/x-ndjson" },
    customMetadata: metadata(segment.manifest),
  });
  if (!await archiveObjectMatches(bucket, segment.manifest)) {
    throw new MarketArchiveVerificationError(segment.manifest.objectKey);
  }
  return { status: "CREATED", verified: true, manifest: segment.manifest };
}

export function archiveWriteAllowsHotPrune(result: MarketArchiveWriteResult | null | undefined) {
  return result?.verified === true && ["CREATED", "EXISTS_VERIFIED"].includes(result.status);
}
