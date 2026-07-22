import type { PaperNonceStore } from "./auth.ts";

export type SqlValue = string | number | null | ArrayBuffer;
export type SqlCursorLike<T> = Iterable<T> & { toArray(): T[] };
export type PaperSqlStorage = {
  sql: { exec<T = Record<string, SqlValue>>(query: string, ...bindings: SqlValue[]): SqlCursorLike<T> };
  transactionSync<T>(callback: () => T): T;
};

export type StoredCommandStatus = "PREPARED" | "AMBIGUOUS" | "SUBMITTED" | "REJECTED";
export type StoredCommand = {
  idempotency_key: string;
  command_id: string;
  intent_id: string;
  request_hash: string;
  client_order_id: string;
  status: StoredCommandStatus;
  provider_order_id: string | null;
  response_json: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  retry_after: number | null;
};

export type AppendOrderEvent = {
  eventKey: string;
  providerOrderId: string;
  clientOrderId: string;
  eventType: string;
  providerAt: number;
  receivedAt: number;
  processedAt: number;
  source: string;
  payloadHash: string;
  payload: string;
};

export type AppendPaperFill = {
  executionId: string;
  providerOrderId: string;
  clientOrderId: string;
  quantity: string;
  price: string;
  providerAt: number;
  receivedAt: number;
  processedAt: number;
  payloadHash: string;
  payload: string;
};

function first<T>(cursor: SqlCursorLike<T>) { return cursor.toArray()[0]; }

export class PaperBrokerRepository implements PaperNonceStore {
  readonly storage: PaperSqlStorage;
  readonly now: () => number;
  constructor(storage: PaperSqlStorage, now: () => number = Date.now) { this.storage = storage; this.now = now; }

  initializeSchema() {
    this.storage.sql.exec("CREATE TABLE IF NOT EXISTS command_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS command_nonces_expiry_idx ON command_nonces(expires_at)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS paper_commands (
      idempotency_key TEXT PRIMARY KEY,command_id TEXT NOT NULL UNIQUE,intent_id TEXT NOT NULL,request_hash TEXT NOT NULL,
      client_order_id TEXT NOT NULL UNIQUE,status TEXT NOT NULL CHECK(status IN ('PREPARED','AMBIGUOUS','SUBMITTED','REJECTED')),
      provider_order_id TEXT,response_json TEXT,error_code TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,retry_after INTEGER)`);
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS paper_commands_status_idx ON paper_commands(status,updated_at)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS paper_order_events (
      event_key TEXT PRIMARY KEY,provider_order_id TEXT NOT NULL,client_order_id TEXT NOT NULL,event_type TEXT NOT NULL,
      provider_at INTEGER NOT NULL,received_at INTEGER NOT NULL,processed_at INTEGER NOT NULL,source TEXT NOT NULL,
      payload_hash TEXT NOT NULL,payload TEXT NOT NULL)`);
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS paper_order_events_order_idx ON paper_order_events(provider_order_id,provider_at,event_key)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS paper_fill_executions (
      execution_id TEXT PRIMARY KEY,provider_order_id TEXT NOT NULL,client_order_id TEXT NOT NULL,quantity TEXT NOT NULL,price TEXT NOT NULL,
      provider_at INTEGER NOT NULL,received_at INTEGER NOT NULL,processed_at INTEGER NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL)`);
    this.storage.sql.exec("CREATE INDEX IF NOT EXISTS paper_fill_order_idx ON paper_fill_executions(provider_order_id,provider_at,execution_id)");
    this.storage.sql.exec(`CREATE TABLE IF NOT EXISTS paper_event_quarantine (
      quarantine_id INTEGER PRIMARY KEY AUTOINCREMENT,identity_key TEXT NOT NULL,reason TEXT NOT NULL,payload_hash TEXT NOT NULL,
      payload TEXT NOT NULL,quarantined_at INTEGER NOT NULL)`);
  }

  async rememberOnce(scopedNonce: string, expiresAt: number) {
    return this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM command_nonces WHERE expires_at < ?", this.now());
      if (first(this.storage.sql.exec<{ found: number }>("SELECT 1 AS found FROM command_nonces WHERE nonce=?", scopedNonce))) return false;
      this.storage.sql.exec("INSERT INTO command_nonces(nonce,expires_at) VALUES(?,?)", scopedNonce, expiresAt);
      return true;
    });
  }

  beginCommand(input: {
    idempotencyKey: string; commandId: string; intentId: string; requestHash: string; clientOrderId: string; at: number;
  }): { state: "CREATED" | "EXISTING" | "CONFLICT"; command: StoredCommand } {
    return this.storage.transactionSync(() => {
      const existing = this.command(input.idempotencyKey);
      if (existing) {
        const identical = existing.command_id === input.commandId && existing.intent_id === input.intentId &&
          existing.request_hash === input.requestHash && existing.client_order_id === input.clientOrderId;
        return { state: identical ? "EXISTING" : "CONFLICT", command: existing };
      }
      this.storage.sql.exec(`INSERT INTO paper_commands(
        idempotency_key,command_id,intent_id,request_hash,client_order_id,status,created_at,updated_at)
        VALUES(?,?,?,?,?,'PREPARED',?,?)`,
      input.idempotencyKey, input.commandId, input.intentId, input.requestHash, input.clientOrderId, input.at, input.at);
      return { state: "CREATED", command: this.command(input.idempotencyKey)! };
    });
  }

  command(idempotencyKey: string) {
    return first(this.storage.sql.exec<StoredCommand>("SELECT * FROM paper_commands WHERE idempotency_key=?", idempotencyKey)) ?? null;
  }

  /** Atomically reserve the only external submission/reconciliation flight for this command. */
  claimCommand(idempotencyKey: string, at: number, leaseUntil: number) {
    return this.storage.transactionSync(() => {
      const existing = this.command(idempotencyKey);
      if (!existing) throw new Error("PAPER_COMMAND_NOT_FOUND");
      const claimable = existing.status === "PREPARED" ||
        (existing.status === "AMBIGUOUS" && existing.retry_after != null && existing.retry_after <= at);
      if (!claimable) return { claimed: false, command: existing };
      this.storage.sql.exec(`UPDATE paper_commands SET status='AMBIGUOUS',error_code='SUBMISSION_IN_FLIGHT',
        retry_after=?,updated_at=? WHERE idempotency_key=? AND status=? AND updated_at=?`,
      leaseUntil, at, idempotencyKey, existing.status, existing.updated_at);
      const updated = this.command(idempotencyKey)!;
      return { claimed: updated.updated_at === at && updated.retry_after === leaseUntil, command: updated };
    });
  }

  updateCommand(idempotencyKey: string, input: {
    status: StoredCommandStatus; providerOrderId?: string | null; responseJson?: string | null;
    errorCode?: string | null; retryAfter?: number | null; at: number;
  }) {
    this.storage.sql.exec(`UPDATE paper_commands SET status=?,provider_order_id=?,response_json=?,error_code=?,retry_after=?,updated_at=?
      WHERE idempotency_key=?`, input.status, input.providerOrderId ?? null, input.responseJson ?? null,
    input.errorCode ?? null, input.retryAfter ?? null, input.at, idempotencyKey);
    return this.command(idempotencyKey)!;
  }

  appendOrderEvent(event: AppendOrderEvent) {
    return this.storage.transactionSync(() => {
      const existing = first(this.storage.sql.exec<{ payload_hash: string }>("SELECT payload_hash FROM paper_order_events WHERE event_key=?", event.eventKey));
      if (existing) {
        if (existing.payload_hash === event.payloadHash) return "EXISTS_IDENTICAL" as const;
        this.quarantine(event.eventKey, "ORDER_EVENT_IDENTITY_CONFLICT", event.payloadHash, event.payload, event.processedAt);
        return "CONFLICT" as const;
      }
      this.storage.sql.exec(`INSERT INTO paper_order_events(event_key,provider_order_id,client_order_id,event_type,provider_at,
        received_at,processed_at,source,payload_hash,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      event.eventKey, event.providerOrderId, event.clientOrderId, event.eventType, event.providerAt,
      event.receivedAt, event.processedAt, event.source, event.payloadHash, event.payload);
      return "CREATED" as const;
    });
  }

  appendFill(fill: AppendPaperFill) {
    return this.storage.transactionSync(() => {
      const existing = first(this.storage.sql.exec<{ payload_hash: string }>("SELECT payload_hash FROM paper_fill_executions WHERE execution_id=?", fill.executionId));
      if (existing) {
        if (existing.payload_hash === fill.payloadHash) return "EXISTS_IDENTICAL" as const;
        this.quarantine(fill.executionId, "FILL_EXECUTION_ID_CONFLICT", fill.payloadHash, fill.payload, fill.processedAt);
        return "CONFLICT" as const;
      }
      this.storage.sql.exec(`INSERT INTO paper_fill_executions(execution_id,provider_order_id,client_order_id,quantity,price,
        provider_at,received_at,processed_at,payload_hash,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      fill.executionId, fill.providerOrderId, fill.clientOrderId, fill.quantity, fill.price,
      fill.providerAt, fill.receivedAt, fill.processedAt, fill.payloadHash, fill.payload);
      return "CREATED" as const;
    });
  }

  health() {
    const commands = first(this.storage.sql.exec<{ total: number; ambiguous: number; submitted: number; rejected: number }>(
      `SELECT COUNT(*) AS total,SUM(CASE WHEN status='AMBIGUOUS' THEN 1 ELSE 0 END) AS ambiguous,
       SUM(CASE WHEN status='SUBMITTED' THEN 1 ELSE 0 END) AS submitted,SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) AS rejected FROM paper_commands`,
    ));
    const events = first(this.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM paper_order_events"));
    const fills = first(this.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM paper_fill_executions"));
    const quarantine = first(this.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM paper_event_quarantine"));
    return {
      commands: { total: commands?.total ?? 0, ambiguous: commands?.ambiguous ?? 0, submitted: commands?.submitted ?? 0, rejected: commands?.rejected ?? 0 },
      orderEvents: events?.total ?? 0,
      fills: fills?.total ?? 0,
      quarantined: quarantine?.total ?? 0,
    };
  }

  private quarantine(identity: string, reason: string, payloadHash: string, payload: string, at: number) {
    this.storage.sql.exec("INSERT INTO paper_event_quarantine(identity_key,reason,payload_hash,payload,quarantined_at) VALUES(?,?,?,?,?)",
      identity, reason, payloadHash, payload, at);
  }
}
