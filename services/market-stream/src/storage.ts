import type { NonceStore } from "./auth.ts";
import {
  type AuthoritativeMinute,
  type MarketStreamEmission,
  type MarketStreamState,
  type PriorityProjectionRequest,
  type ProviderMarketEvent,
} from "./contracts.ts";

export type SqlValue = string | number | null | ArrayBuffer;
export type SqlCursorLike<T> = Iterable<T> & { toArray(): T[] };
export type SqlStorageLike = { exec<T = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): SqlCursorLike<T> };
export type DurableSqlStorageLike = {
  sql: SqlStorageLike;
  transactionSync<T>(callback: () => T): T;
  setAlarm(at: number): Promise<void>;
  getAlarm?(): Promise<number | null>;
  deleteAlarm(): Promise<void>;
};

type OutboxRow = {
  stream_id: string;
  service_sequence: number;
  payload: string;
  attempts: number;
  next_attempt_at: number;
};

export type ProviderRecoveryCheckpoint = { startAt: number; throughAt: number };
export type FullSessionRecoveryProof = ProviderRecoveryCheckpoint & { completed: boolean };

/**
 * The Sites receiver performs several point-in-time D1 writes per emission.
 * Keep delivery pages deliberately smaller than the transport/authentication
 * ceiling so a growing outbox cannot turn one request into a D1 overload.
 */
export const OUTBOX_DELIVERY_MAX_ROWS = 12;
export const OUTBOX_DELIVERY_MAX_BYTES = 24 * 1024;

function first<T>(cursor: SqlCursorLike<T>) {
  return cursor.toArray()[0];
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function compactStatePayload(state: MarketStreamState) {
  const payload = JSON.stringify(state);
  if (new TextEncoder().encode(payload).byteLength > 512_000) throw new Error("COMPACT_STATE_LIMIT_EXCEEDED");
  return payload;
}

export class MarketStreamRepository {
  readonly storage: DurableSqlStorageLike;
  constructor(storage: DurableSqlStorageLike) { this.storage = storage; }

  initializeSchema() {
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS stream_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS provider_events (event_key TEXT PRIMARY KEY, source_observed_at INTEGER NOT NULL, received_at INTEGER NOT NULL, processed_at INTEGER NOT NULL, available_at INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL)");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS provider_events_observed_idx ON provider_events(source_observed_at, event_key)");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS provider_events_available_idx ON provider_events(available_at)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS provider_trade_index (provider_trade_id TEXT PRIMARY KEY, event_key TEXT NOT NULL, source_observed_at INTEGER NOT NULL)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS provider_recovery (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), start_at INTEGER NOT NULL, through_at INTEGER NOT NULL)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS provider_recovery_proof (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), start_at INTEGER NOT NULL, through_at INTEGER NOT NULL, completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)))");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS minute_versions (bar_key TEXT NOT NULL, revision INTEGER NOT NULL, minute_start INTEGER NOT NULL, minute_end INTEGER NOT NULL, status TEXT NOT NULL, available_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (bar_key, revision))");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS minute_versions_time_idx ON minute_versions(minute_start, revision)");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS minute_versions_end_idx ON minute_versions(minute_end)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS emissions (stream_id TEXT NOT NULL, service_sequence INTEGER NOT NULL, connection_epoch INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (stream_id, service_sequence))");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS outbox (stream_id TEXT NOT NULL, service_sequence INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (stream_id, service_sequence))");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS outbox_ready_idx ON outbox(stream_id, next_attempt_at, service_sequence)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS delivery_ack (stream_id TEXT PRIMARY KEY, highest_contiguous_sequence INTEGER NOT NULL, acknowledged_at INTEGER NOT NULL)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS delivery_failure_state (stream_id TEXT PRIMARY KEY, from_sequence INTEGER NOT NULL, to_sequence INTEGER NOT NULL, error_code TEXT NOT NULL, failed_at INTEGER NOT NULL, next_retry_at INTEGER NOT NULL, attempts INTEGER NOT NULL)");
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS ingestion_nonces (scope TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (scope, nonce))");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS ingestion_nonces_expiry_idx ON ingestion_nonces(expires_at)");
  }

  loadState() {
    const row = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "state"));
    return row ? parseJson<MarketStreamState>(row.value) : null;
  }

  saveInitialState(state: MarketStreamState) {
    this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", "state", compactStatePayload(state));
  }

  hasEvent(eventKey: string) {
    return Boolean(first(this.storage.sql.exec<{ found: number }>("SELECT 1 AS found FROM provider_events WHERE event_key = ? LIMIT 1", eventKey)));
  }

  latestMinute(barKey: string) {
    const row = first(this.storage.sql.exec<{ payload: string }>("SELECT payload FROM minute_versions WHERE bar_key = ? ORDER BY revision DESC LIMIT 1", barKey));
    return row ? parseJson<AuthoritativeMinute>(row.payload) : null;
  }

  commit(input: { state: MarketStreamState; emissions: MarketStreamEmission[]; event?: ProviderMarketEvent | null }) {
    this.storage.transactionSync(() => {
      if (input.event) {
        this.storage.sql.exec(
          "INSERT OR IGNORE INTO provider_events(event_key, source_observed_at, received_at, processed_at, available_at, kind, payload) VALUES(?, ?, ?, ?, ?, ?, ?)",
          input.event.eventKey, input.event.sourceObservedAt, input.event.receivedAt, input.event.processedAt, input.event.availableAt, input.event.kind, JSON.stringify(input.event),
        );
        if (input.event.kind === "TRADE" && input.event.trade) {
          this.storage.sql.exec(
            "INSERT INTO provider_trade_index(provider_trade_id, event_key, source_observed_at) VALUES(?, ?, ?) ON CONFLICT(provider_trade_id) DO UPDATE SET event_key = excluded.event_key, source_observed_at = excluded.source_observed_at",
            input.event.trade.providerTradeId, input.event.eventKey, input.event.sourceObservedAt,
          );
        }
        if (input.event.kind === "CORRECTION" && input.event.correction) {
          const originalObservedAt = this.tradeObservedAt(input.event.correction.originalTradeId);
          if (originalObservedAt != null) {
            this.storage.sql.exec(
              "INSERT INTO provider_trade_index(provider_trade_id, event_key, source_observed_at) VALUES(?, ?, ?) ON CONFLICT(provider_trade_id) DO UPDATE SET event_key = excluded.event_key, source_observed_at = excluded.source_observed_at",
              input.event.correction.correctedTradeId, input.event.eventKey, originalObservedAt,
            );
          }
        }
      }
      this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", "state", compactStatePayload(input.state));
      for (const emission of input.emissions) {
        const payload = JSON.stringify(emission);
        this.storage.sql.exec("INSERT INTO emissions(stream_id, service_sequence, connection_epoch, created_at, payload) VALUES(?, ?, ?, ?, ?)",
          emission.streamId, emission.serviceSequence, emission.connectionEpoch, emission.availableAt, payload);
        this.storage.sql.exec("INSERT INTO outbox(stream_id, service_sequence, created_at, payload, attempts, next_attempt_at) VALUES(?, ?, ?, ?, 0, 0)",
          emission.streamId, emission.serviceSequence, emission.availableAt, payload);
        if (emission.minute) {
          this.storage.sql.exec("INSERT INTO minute_versions(bar_key, revision, minute_start, minute_end, status, available_at, payload) VALUES(?, ?, ?, ?, ?, ?, ?)",
            emission.minute.barKey, emission.minute.revision, emission.minute.minuteStart, emission.minute.minuteEnd, emission.minute.status, emission.minute.availableAt, JSON.stringify(emission.minute));
        }
        if (emission.type === "CONNECTION" && emission.sourceEvent == null && emission.delta.providerState === "LIVE") {
          this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            "priority_live_proof", payload);
        }
        if (emission.feed === "sip" && emission.type === "CONNECTION" && emission.sourceEvent == null &&
          emission.delta.providerState != null) {
          this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            "priority_state_head", payload);
        }
        const selectedQuote = input.state.latestQuote;
        if (emission.type === "EVENT" && emission.sourceEvent?.kind === "QUOTE" &&
          emission.sourceEvent.transport === "WEBSOCKET" && emission.coverage.executionEligible &&
          emission.delta.latestQuote?.eventKey === emission.sourceEvent.eventKey &&
          selectedQuote?.eventKey === emission.sourceEvent.eventKey) {
          this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            "priority_quote", payload);
        }
      }
      const retainAfter = Math.max(0, input.state.serviceSequence - 20_000);
      this.storage.sql.exec("DELETE FROM emissions WHERE stream_id = ? AND service_sequence < ?", input.state.streamId, retainAfter);
    });
  }

  listCompletedMinutes(limit = 240) {
    const safeLimit = Math.max(1, Math.min(1_000, Math.trunc(limit)));
    const rows = this.storage.sql.exec<{ payload: string }>(
      "SELECT mv.payload FROM minute_versions mv JOIN (SELECT bar_key, MAX(revision) revision FROM minute_versions WHERE status IN ('FINAL', 'CORRECTED') GROUP BY bar_key) latest ON latest.bar_key = mv.bar_key AND latest.revision = mv.revision ORDER BY mv.minute_start DESC LIMIT ?",
      safeLimit,
    ).toArray();
    return rows.map((row) => parseJson<AuthoritativeMinute>(row.payload)).reverse();
  }

  highestAck(streamId: string) {
    const row = first(this.storage.sql.exec<{ highest_contiguous_sequence: number }>("SELECT highest_contiguous_sequence FROM delivery_ack WHERE stream_id = ?", streamId));
    return row?.highest_contiguous_sequence ?? 0;
  }

  readyOutbox(
    streamId: string,
    now: number,
    maximumRows = OUTBOX_DELIVERY_MAX_ROWS,
    maximumBytes = OUTBOX_DELIVERY_MAX_BYTES,
  ) {
    const ack = this.highestAck(streamId);
    const rows = this.storage.sql.exec<OutboxRow>(
      "SELECT stream_id, service_sequence, payload, attempts, next_attempt_at FROM outbox WHERE stream_id = ? AND service_sequence > ? ORDER BY service_sequence ASC LIMIT ?",
      streamId, ack, Math.max(1, Math.min(100, maximumRows)),
    ).toArray();
    const selected: Array<OutboxRow & { emission: MarketStreamEmission }> = [];
    let bytes = 0;
    let expected = ack + 1;
    for (const row of rows) {
      if (row.service_sequence !== expected || row.next_attempt_at > now) break;
      const size = new TextEncoder().encode(row.payload).byteLength;
      if (selected.length && bytes + size > maximumBytes) break;
      bytes += size; expected += 1;
      selected.push({ ...row, emission: parseJson<MarketStreamEmission>(row.payload) });
    }
    return selected;
  }

  priorityProjection(): PriorityProjectionRequest | null {
    const state = this.loadState();
    if (!state || state.feed !== "sip") return null;
    const stateRow = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "priority_state_head"));
    const proofRow = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "priority_live_proof"));
    const quoteRow = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "priority_quote"));
    if (!stateRow) return null;
    const stateHead = parseJson<MarketStreamEmission>(stateRow.value);
    const ackRow = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "priority_projection_ack"));
    const acknowledged = Number(ackRow?.value ?? 0);
    if (stateHead.streamId !== state.streamId || stateHead.feed !== "sip" ||
      stateHead.connectionEpoch !== state.connectionEpoch || stateHead.delta.providerState == null) return null;
    if (state.providerState === "LIVE" && state.coverage.executionEligible && proofRow && quoteRow) {
      const liveProof = parseJson<MarketStreamEmission>(proofRow.value);
      const quote = parseJson<MarketStreamEmission>(quoteRow.value);
      if (liveProof.streamId === state.streamId && quote.streamId === state.streamId &&
        liveProof.connectionEpoch === state.connectionEpoch && quote.connectionEpoch === state.connectionEpoch &&
        liveProof.type === "CONNECTION" && liveProof.sourceEvent == null && liveProof.delta.providerState === "LIVE" &&
        quote.type === "EVENT" && quote.sourceEvent?.kind === "QUOTE" && quote.sourceEvent.transport === "WEBSOCKET" &&
        liveProof.serviceSequence < quote.serviceSequence && quote.serviceSequence >= stateHead.serviceSequence &&
        quote.serviceSequence > acknowledged) {
        return {
          schemaVersion: state.schemaVersion,
          requestType: "PRIORITY_QUOTE_PROJECTION",
          streamId: state.streamId,
          liveProof,
          quote,
        };
      }
    }
    if (stateHead.serviceSequence <= acknowledged) return null;
    return {
      schemaVersion: state.schemaVersion,
      requestType: "PRIORITY_STATE_PROJECTION",
      streamId: state.streamId,
      state: stateHead,
    };
  }

  acknowledgePriorityProjection(serviceSequence: number) {
    const current = first(this.storage.sql.exec<{ value: string }>("SELECT value FROM stream_meta WHERE key = ?", "priority_projection_ack"));
    const acknowledged = Number(current?.value ?? 0);
    if (!Number.isSafeInteger(serviceSequence) || serviceSequence <= acknowledged) return;
    this.storage.sql.exec("INSERT INTO stream_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      "priority_projection_ack", String(serviceSequence));
  }

  priorityDeliveryHealth() {
    const projection = this.priorityProjection();
    const acknowledged = Number(first(this.storage.sql.exec<{ value: string }>(
      "SELECT value FROM stream_meta WHERE key = ?", "priority_projection_ack"))?.value ?? 0);
    return {
      highestAcknowledgedSequence: Number.isSafeInteger(acknowledged) ? acknowledged : 0,
      pendingSequence: projection?.requestType === "PRIORITY_QUOTE_PROJECTION"
        ? projection.quote.serviceSequence
        : projection?.state.serviceSequence ?? null,
      pendingType: projection?.requestType ?? null,
    };
  }

  acknowledge(streamId: string, sequence: number, at: number) {
    this.storage.transactionSync(() => {
      const current = this.highestAck(streamId);
      if (sequence < current) return;
      this.storage.sql.exec("INSERT INTO delivery_ack(stream_id, highest_contiguous_sequence, acknowledged_at) VALUES(?, ?, ?) ON CONFLICT(stream_id) DO UPDATE SET highest_contiguous_sequence = excluded.highest_contiguous_sequence, acknowledged_at = excluded.acknowledged_at",
        streamId, sequence, at);
      this.storage.sql.exec("DELETE FROM outbox WHERE stream_id = ? AND service_sequence <= ?", streamId, sequence);
    });
  }

  recordDeliveryFailure(input: {
    streamId: string;
    fromSequence: number;
    toSequence: number;
    attempts: number;
    errorCode: string;
    failedAt: number;
    nextRetryAt: number;
  }) {
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        "UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE stream_id = ? AND service_sequence = ?",
        input.attempts, input.nextRetryAt, input.streamId, input.fromSequence,
      );
      this.storage.sql.exec(
        "INSERT INTO delivery_failure_state(stream_id, from_sequence, to_sequence, error_code, failed_at, next_retry_at, attempts) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stream_id) DO UPDATE SET from_sequence = excluded.from_sequence, to_sequence = excluded.to_sequence, error_code = excluded.error_code, failed_at = excluded.failed_at, next_retry_at = excluded.next_retry_at, attempts = excluded.attempts",
        input.streamId, input.fromSequence, input.toSequence, input.errorCode, input.failedAt, input.nextRetryAt, input.attempts,
      );
    });
  }

  deliveryHealth(streamId: string) {
    const row = first(this.storage.sql.exec<{
      backlog: number;
      oldest: number | null;
      attempts: number | null;
      pending_from: number | null;
      pending_to: number | null;
    }>(
      "SELECT COUNT(*) AS backlog, MIN(created_at) AS oldest, MAX(attempts) AS attempts, MIN(service_sequence) AS pending_from, MAX(service_sequence) AS pending_to FROM outbox WHERE stream_id = ?", streamId,
    ));
    const next = first(this.storage.sql.exec<{ next_attempt_at: number }>(
      "SELECT next_attempt_at FROM outbox WHERE stream_id = ? ORDER BY service_sequence ASC LIMIT 1", streamId,
    ));
    const failure = first(this.storage.sql.exec<{
      from_sequence: number;
      to_sequence: number;
      error_code: string;
      failed_at: number;
      next_retry_at: number;
      attempts: number;
    }>(
      "SELECT from_sequence, to_sequence, error_code, failed_at, next_retry_at, attempts FROM delivery_failure_state WHERE stream_id = ?", streamId,
    ));
    return {
      highestContiguousAck: this.highestAck(streamId),
      backlog: row?.backlog ?? 0,
      oldestPendingAt: row?.oldest ?? null,
      maximumAttempts: row?.attempts ?? 0,
      pendingFromSequence: row?.pending_from ?? null,
      pendingToSequence: row?.pending_to ?? null,
      nextRetryAt: next?.next_attempt_at ?? null,
      lastFailure: failure ? {
        fromSequence: failure.from_sequence,
        toSequence: failure.to_sequence,
        errorCode: failure.error_code,
        failedAt: failure.failed_at,
        nextRetryAt: failure.next_retry_at,
        attempts: failure.attempts,
      } : null,
    };
  }

  recoverEmissions(streamId: string, afterSequence: number, limit = 500) {
    const rows = this.storage.sql.exec<{ service_sequence: number; payload: string }>(
      "SELECT service_sequence, payload FROM emissions WHERE stream_id = ? AND service_sequence > ? ORDER BY service_sequence ASC LIMIT ?",
      streamId, afterSequence, Math.max(1, Math.min(500, limit)),
    ).toArray();
    return rows.map((row) => parseJson<MarketStreamEmission>(row.payload));
  }

  recoveryPage(streamId: string, afterSequence: number, limit = 500) {
    const emissions = this.recoverEmissions(streamId, afterSequence, limit);
    const nextAfterSequence = emissions.at(-1)?.serviceSequence ?? afterSequence;
    const row = first(this.storage.sql.exec<{ found: number }>(
      "SELECT 1 AS found FROM emissions WHERE stream_id = ? AND service_sequence > ? LIMIT 1",
      streamId, nextAfterSequence,
    ));
    return { emissions, nextAfterSequence, hasMore: Boolean(row) };
  }

  tradeObservedAt(providerTradeId: string) {
    const row = first(this.storage.sql.exec<{ source_observed_at: number }>(
      "SELECT source_observed_at FROM provider_trade_index WHERE provider_trade_id = ?",
      providerTradeId,
    ));
    return row?.source_observed_at ?? null;
  }

  beginProviderRecovery(startAt: number, throughAt: number) {
    const start = Math.max(0, Math.trunc(startAt));
    const through = Math.max(start, Math.trunc(throughAt));
    this.storage.transactionSync(() => {
      const current = this.providerRecoveryCheckpoint();
      const nextStart = current ? Math.min(current.startAt, start) : start;
      const nextThrough = current ? Math.max(current.throughAt, through) : through;
      this.storage.sql.exec(
        "INSERT INTO provider_recovery(singleton, start_at, through_at) VALUES(1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET start_at = excluded.start_at, through_at = excluded.through_at",
        nextStart, nextThrough,
      );
    });
  }

  /** Persist a full-session proof job for an integrity event with no known minute. */
  beginFullSessionProviderRecovery(startAt: number, throughAt: number) {
    const start = Math.max(0, Math.trunc(startAt));
    const through = Math.max(start, Math.trunc(throughAt));
    this.storage.transactionSync(() => {
      const current = this.providerRecoveryCheckpoint();
      const nextStart = current ? Math.min(current.startAt, start) : start;
      const nextThrough = current ? Math.max(current.throughAt, through) : through;
      this.storage.sql.exec(
        "INSERT INTO provider_recovery(singleton, start_at, through_at) VALUES(1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET start_at = excluded.start_at, through_at = excluded.through_at",
        nextStart, nextThrough,
      );
      const proof = this.fullSessionRecoveryProof();
      this.storage.sql.exec(
        "INSERT INTO provider_recovery_proof(singleton, start_at, through_at, completed) VALUES(1, ?, ?, 0) ON CONFLICT(singleton) DO UPDATE SET start_at = ?, through_at = ?, completed = 0",
        proof ? Math.min(proof.startAt, start) : start,
        proof ? Math.max(proof.throughAt, through) : through,
        proof ? Math.min(proof.startAt, start) : start,
        proof ? Math.max(proof.throughAt, through) : through,
      );
    });
  }

  providerRecoveryCheckpoint(): ProviderRecoveryCheckpoint | null {
    const row = first(this.storage.sql.exec<{ start_at: number; through_at: number }>(
      "SELECT start_at, through_at FROM provider_recovery WHERE singleton = 1",
    ));
    return row ? { startAt: row.start_at, throughAt: row.through_at } : null;
  }

  fullSessionRecoveryProof(): FullSessionRecoveryProof | null {
    const row = first(this.storage.sql.exec<{ start_at: number; through_at: number; completed: number }>(
      "SELECT start_at, through_at, completed FROM provider_recovery_proof WHERE singleton = 1",
    ));
    return row ? { startAt: row.start_at, throughAt: row.through_at, completed: row.completed === 1 } : null;
  }

  clearFullSessionRecoveryProof() {
    this.storage.sql.exec("DELETE FROM provider_recovery_proof WHERE singleton = 1");
  }

  advanceProviderRecovery(expectedStartAt: number, completedThrough: number) {
    return this.storage.transactionSync(() => {
      const current = this.providerRecoveryCheckpoint();
      if (!current || current.startAt !== expectedStartAt || completedThrough < expectedStartAt) return false;
      this.storage.sql.exec(
        "UPDATE provider_recovery_proof SET completed = 1 WHERE singleton = 1 AND completed = 0 AND through_at <= ?",
        completedThrough,
      );
      const next = completedThrough + 1;
      if (next > current.throughAt) this.storage.sql.exec("DELETE FROM provider_recovery WHERE singleton = 1");
      else this.storage.sql.exec("UPDATE provider_recovery SET start_at = ? WHERE singleton = 1", next);
      return true;
    });
  }

  oldestEmissionSequence(streamId: string) {
    const row = first(this.storage.sql.exec<{ oldest: number | null }>("SELECT MIN(service_sequence) AS oldest FROM emissions WHERE stream_id = ?", streamId));
    return row?.oldest ?? null;
  }

  emissionEpoch(streamId: string, serviceSequence: number) {
    const row = first(this.storage.sql.exec<{ connection_epoch: number }>(
      "SELECT connection_epoch FROM emissions WHERE stream_id = ? AND service_sequence = ?",
      streamId, serviceSequence,
    ));
    return row?.connection_epoch ?? null;
  }

  prune(
    now: number,
    eventRetentionMs = 2 * 60 * 60_000,
    minuteRetentionMs = 7 * 24 * 60 * 60_000,
    tradeIndexRetentionMs = 7 * 24 * 60 * 60_000,
  ) {
    this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM provider_events WHERE available_at < ?", Math.max(0, now - eventRetentionMs));
      this.storage.sql.exec("DELETE FROM minute_versions WHERE minute_end < ?", Math.max(0, now - minuteRetentionMs));
      // Corrections and cancels can refer to a trade long after the raw event's
      // short replay horizon. Retain the ID-to-minute mapping across the full
      // relevant session (plus weekends/holidays) instead of pruning at 2h.
      this.storage.sql.exec("DELETE FROM provider_trade_index WHERE source_observed_at < ?", Math.max(0, now - tradeIndexRetentionMs));
      this.storage.sql.exec("DELETE FROM ingestion_nonces WHERE expires_at < ?", now);
    });
  }
}

/** Receiver-side primitive for a Durable Object ingestion endpoint. */
export class DurableSqlNonceStore implements NonceStore {
  readonly storage: DurableSqlStorageLike;
  readonly scope: string;
  readonly now: () => number;
  constructor(storage: DurableSqlStorageLike, scope: string, now: () => number = Date.now) {
    this.storage = storage; this.scope = scope; this.now = now;
  }
  async rememberOnce(scopedNonce: string, expiresAt: number) {
    return this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM ingestion_nonces WHERE expires_at < ?", this.now());
      const existing = first(this.storage.sql.exec<{ found: number }>("SELECT 1 AS found FROM ingestion_nonces WHERE scope = ? AND nonce = ?", this.scope, scopedNonce));
      if (existing) return false;
      this.storage.sql.exec("INSERT INTO ingestion_nonces(scope, nonce, expires_at) VALUES(?, ?, ?)", this.scope, scopedNonce, expiresAt);
      return true;
    });
  }
}
