import { newYorkDateKey } from "./market-session.ts";
import {
  buildR2MarketArchiveSegment,
  putR2MarketArchiveSegment,
  type MarketArchiveRecord,
  type R2ArchiveBucket,
} from "./r2-market-archive.ts";

export const MARKET_ARCHIVE_BATCH_ROWS = 500;

type LedgerRow = {
  stream_id: string;
  service_sequence: number;
  connection_epoch: number;
  available_at: number;
  payload_hash: string;
  payload_json: string;
  provider: string;
  feed: string;
  symbol: string;
};

type ResumableArchiveSegment = {
  segment_id: string;
  stream_id: string;
  provider: string;
  feed: string;
  symbol: string;
  session_date: string;
  from_sequence: number;
  to_sequence: number;
  object_key: string;
  content_hash: string;
  row_count: number;
  byte_length: number;
  created_at: number;
};

export type D1MarketArchiveRun = {
  status: "EMPTY" | "VERIFIED";
  segmentId: string | null;
  objectKey: string | null;
  rowCount: number;
  fromSequence: number | null;
  toSequence: number | null;
};

function rowValid(row: LedgerRow) {
  return typeof row.stream_id === "string" && row.stream_id.length > 0 &&
    Number.isSafeInteger(row.service_sequence) && row.service_sequence > 0 &&
    Number.isSafeInteger(row.connection_epoch) && row.connection_epoch >= 0 &&
    Number.isSafeInteger(row.available_at) && row.available_at >= 0 &&
    typeof row.payload_hash === "string" && /^(?:sha256:)?[0-9a-f]{64}$/.test(row.payload_hash) &&
    typeof row.payload_json === "string" && typeof row.provider === "string" &&
    typeof row.feed === "string" && typeof row.symbol === "string";
}

function archiveRecord(row: LedgerRow): MarketArchiveRecord {
  if (!rowValid(row)) throw new TypeError("Persisted market-stream ledger row is invalid");
  let payload: unknown;
  try { payload = JSON.parse(row.payload_json); }
  catch (error) { throw new TypeError("Persisted market-stream payload is invalid JSON", { cause: error }); }
  return {
    streamId: row.stream_id,
    serviceSequence: row.service_sequence,
    connectionEpoch: row.connection_epoch,
    availableAt: row.available_at,
    payloadHash: row.payload_hash,
    payload,
  };
}

/**
 * Copy one contiguous, single-session receiver prefix into immutable R2 and
 * record the independently verified object in D1. Hot ledger rows are retained;
 * pruning requires a separate retention policy and is never implied here.
 */
export async function archiveD1MarketStreamPrefix(input: {
  database: D1Database;
  bucket: R2ArchiveBucket;
  sealedAt?: number;
  maximumRows?: number;
}): Promise<D1MarketArchiveRun> {
  const sealedAt = input.sealedAt ?? Date.now();
  const maximumRows = input.maximumRows ?? MARKET_ARCHIVE_BATCH_ROWS;
  if (!Number.isSafeInteger(sealedAt) || sealedAt < 0) throw new TypeError("sealedAt is invalid");
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1 || maximumRows > 5_000) {
    throw new TypeError("maximumRows must be between 1 and 5000");
  }

  const first = await input.database.prepare(`WITH archive_heads AS (
      SELECT stream_id,MAX(to_sequence) AS to_sequence FROM market_archive_segments
      WHERE state='VERIFIED' GROUP BY stream_id
    ), candidates AS (
      SELECT stream.stream_id,stream.provider,stream.feed,stream.symbol,
        COALESCE(head.to_sequence,0)+1 AS next_sequence
      FROM market_stream_ingest_streams AS stream
      LEFT JOIN archive_heads AS head ON head.stream_id=stream.stream_id
    ) SELECT emission.stream_id,emission.service_sequence,
      emission.connection_epoch,emission.available_at,emission.payload_hash,emission.payload_json,
      candidate.provider,candidate.feed,candidate.symbol
    FROM candidates AS candidate
    JOIN market_stream_ingest_emissions AS emission ON emission.stream_id=candidate.stream_id
      AND emission.service_sequence=candidate.next_sequence
    WHERE emission.available_at<=?
    ORDER BY emission.created_at ASC,emission.stream_id ASC,emission.service_sequence ASC LIMIT 1`)
    .bind(sealedAt).first<LedgerRow>();
  if (!first) return { status: "EMPTY", segmentId: null, objectKey: null, rowCount: 0, fromSequence: null, toSequence: null };
  if (!rowValid(first)) throw new TypeError("Persisted market-stream archive anchor is invalid");

  const sessionDate = newYorkDateKey(first.available_at);
  const resumable = await input.database.prepare(`SELECT
      segment_id,stream_id,provider,feed,symbol,session_date,from_sequence,to_sequence,
      object_key,content_hash,row_count,byte_length,created_at
    FROM market_archive_segments
    WHERE stream_id=? AND from_sequence=? AND state IN ('PENDING','FAILED')
    ORDER BY created_at ASC LIMIT 1`)
    .bind(first.stream_id, first.service_sequence).first<ResumableArchiveSegment>();
  if (resumable && (
    typeof resumable.segment_id !== "string" || resumable.stream_id !== first.stream_id ||
    resumable.provider !== first.provider || resumable.feed !== first.feed || resumable.symbol !== first.symbol ||
    resumable.session_date !== sessionDate || resumable.from_sequence !== first.service_sequence ||
    !Number.isSafeInteger(resumable.to_sequence) || resumable.to_sequence < resumable.from_sequence ||
    !Number.isSafeInteger(resumable.row_count) || resumable.row_count !== resumable.to_sequence - resumable.from_sequence + 1 ||
    !Number.isSafeInteger(resumable.byte_length) || resumable.byte_length < 1 ||
    !Number.isSafeInteger(resumable.created_at) || resumable.created_at < first.available_at ||
    typeof resumable.object_key !== "string" || typeof resumable.content_hash !== "string"
  )) throw new Error("MARKET_ARCHIVE_INDEX_CONFLICT");
  const maximumSequence = resumable?.to_sequence ?? Number.MAX_SAFE_INTEGER;
  const rowLimit = resumable?.row_count ?? maximumRows;
  const segmentSealedAt = resumable?.created_at ?? sealedAt;
  const selected = await input.database.prepare(`SELECT emission.stream_id,emission.service_sequence,
      emission.connection_epoch,emission.available_at,emission.payload_hash,emission.payload_json,
      stream.provider,stream.feed,stream.symbol
    FROM market_stream_ingest_emissions AS emission
    JOIN market_stream_ingest_streams AS stream ON stream.stream_id=emission.stream_id
    WHERE emission.stream_id=? AND emission.service_sequence>=? AND emission.service_sequence<=? AND emission.available_at<=?
      AND NOT EXISTS (SELECT 1 FROM market_archive_segments AS segment
        WHERE segment.state='VERIFIED' AND segment.stream_id=emission.stream_id
          AND emission.service_sequence BETWEEN segment.from_sequence AND segment.to_sequence)
    ORDER BY emission.service_sequence ASC LIMIT ?`)
    .bind(first.stream_id, first.service_sequence, maximumSequence, segmentSealedAt, rowLimit)
    .all<LedgerRow>();

  const rows: LedgerRow[] = [];
  for (const row of selected.results ?? []) {
    if (!rowValid(row)) throw new TypeError("Persisted market-stream ledger row is invalid");
    const expected = first.service_sequence + rows.length;
    if (row.service_sequence !== expected || newYorkDateKey(row.available_at) !== sessionDate) break;
    rows.push(row);
  }
  if (!rows.length) throw new Error("MARKET_ARCHIVE_PREFIX_UNAVAILABLE");
  if (resumable && rows.length !== resumable.row_count) throw new Error("MARKET_ARCHIVE_RESUME_ROWS_UNAVAILABLE");

  const segment = buildR2MarketArchiveSegment({
    provider: first.provider,
    feed: first.feed,
    symbol: first.symbol,
    sessionDate,
    streamId: first.stream_id,
    sealedAt: segmentSealedAt,
    records: rows.map(archiveRecord),
  });
  const manifest = segment.manifest;
  const segmentId = manifest.manifestHash;
  if (resumable && (
    resumable.segment_id !== segmentId || resumable.object_key !== manifest.objectKey ||
    resumable.content_hash !== manifest.contentHash || resumable.byte_length !== manifest.byteLength
  )) throw new Error("MARKET_ARCHIVE_INDEX_CONFLICT");
  await input.database.prepare(`INSERT INTO market_archive_segments (
      segment_id,stream_id,provider,feed,symbol,session_date,from_sequence,to_sequence,object_key,content_hash,
      row_count,byte_length,state,created_at,verified_at,failure_code
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,NULL,NULL)
    ON CONFLICT(segment_id) DO UPDATE SET state='PENDING',failure_code=NULL
      WHERE market_archive_segments.state='FAILED'
        AND market_archive_segments.stream_id=excluded.stream_id
        AND market_archive_segments.object_key=excluded.object_key
        AND market_archive_segments.content_hash=excluded.content_hash
        AND market_archive_segments.row_count=excluded.row_count
        AND market_archive_segments.byte_length=excluded.byte_length`).bind(
      segmentId, manifest.streamId, manifest.provider, manifest.feed, manifest.symbol, manifest.sessionDate,
      manifest.firstSequence, manifest.lastSequence, manifest.objectKey, manifest.contentHash,
      manifest.rowCount, manifest.byteLength, manifest.sealedAt,
    ).run();

  try {
    await putR2MarketArchiveSegment(input.bucket, segment);
    const result = await input.database.prepare(`UPDATE market_archive_segments
      SET state='VERIFIED',verified_at=?,failure_code=NULL
      WHERE segment_id=? AND object_key=? AND content_hash=? AND row_count=? AND byte_length=?
        AND state IN ('PENDING','VERIFIED')`).bind(
        sealedAt, segmentId, manifest.objectKey, manifest.contentHash, manifest.rowCount, manifest.byteLength,
      ).run();
    if (typeof result.meta?.changes === "number" && result.meta.changes < 1) {
      throw new Error("MARKET_ARCHIVE_INDEX_CONFLICT");
    }
  } catch (error) {
    await input.database.prepare(`UPDATE market_archive_segments
      SET state='FAILED',failure_code=? WHERE segment_id=? AND state='PENDING'`)
      .bind(error instanceof Error ? error.name.slice(0, 128) : "ARCHIVE_WRITE_FAILED", segmentId).run();
    throw error;
  }

  return {
    status: "VERIFIED",
    segmentId,
    objectKey: manifest.objectKey,
    rowCount: manifest.rowCount,
    fromSequence: manifest.firstSequence,
    toSequence: manifest.lastSequence,
  };
}
