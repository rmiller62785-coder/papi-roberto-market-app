import { DatabaseSync } from "node:sqlite";

export const NOW = Date.parse("2026-07-20T13:24:40Z");
export const SECRET = "paper-command-secret-at-least-thirty-two-bytes";
export const AUDIENCE = "aperture-paper-broker-command";

export function cursor(rows = []) {
  return { *[Symbol.iterator]() { yield* rows; }, toArray() { return rows; } };
}

export function memoryStorage() {
  const database = new DatabaseSync(":memory:");
  return {
    sql: {
      exec(query, ...bindings) {
        const statement = database.prepare(query);
        if (statement.columns().length) return cursor(statement.all(...bindings));
        statement.run(...bindings);
        return cursor();
      },
    },
    transactionSync(callback) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const value = callback();
        database.exec("COMMIT");
        return value;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export function environment(overrides = {}) {
  return {
    PAPER_BROKER: {},
    APCA_API_KEY_ID: "paper-key",
    APCA_API_SECRET_KEY: "paper-secret",
    PAPER_COMMAND_SECRET: SECRET,
    PAPER_COMMAND_AUDIENCE: AUDIENCE,
    PAPER_ORDER_ADMIN_EMAILS: "owner@example.test",
    PAPER_ORDER_SUBMISSION_ENABLED: "false",
    PAPER_SHORTS_ENABLED: "false",
    PAPER_MAX_SHARES: "1",
    ...overrides,
  };
}

export function command(overrides = {}) {
  const side = overrides.order?.side ?? "buy";
  const quantity = overrides.order?.quantity ?? 1;
  return {
    schemaVersion: "paper-moo-command-v1",
    commandId: "command-20260720-0001",
    intentId: "intent-20260720-0001",
    idempotencyKey: "idempotency-20260720-0001",
    actorEmail: "owner@example.test",
    targetSession: "2026-07-20",
    calendar: { venue: "NASDAQ", calendarVersion: "nasdaq-calendar-v1", isTradingSession: true },
    confirmation: {
      explicit: true,
      phrase: `PAPER NVDA ${side.toUpperCase()} ${quantity}`,
      confirmedAt: NOW,
      expiresAt: NOW + 29_000,
    },
    order: { symbol: "NVDA", side, quantity, type: "market", timeInForce: "opg", extendedHours: false },
    ...overrides,
  };
}

export function alpacaOrder(overrides = {}) {
  return {
    id: "provider-order-0001",
    clientOrderId: "client-order-0001",
    symbol: "NVDA",
    side: "buy",
    quantity: "1",
    filledQuantity: "0",
    filledAveragePrice: null,
    type: "market",
    timeInForce: "opg",
    extendedHours: false,
    status: "accepted",
    submittedAt: "2026-07-20T13:24:41Z",
    updatedAt: "2026-07-20T13:24:41Z",
    ...overrides,
  };
}
