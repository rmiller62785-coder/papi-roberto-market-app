import { paperSha256 } from "./auth.ts";

export const PAPER_BROKER_SCHEMA = "aperture-paper-broker-v1" as const;
export const ALPACA_PAPER_ORIGIN = "https://paper-api.alpaca.markets" as const;
export const ALPACA_PAPER_REQUEST_TIMEOUT_MS = 8_000;
export const PAPER_CONFIRMATION_TTL_MS = 30_000;
export const AMBIGUOUS_RETRY_DELAY_MS = 15_000;
// Reconciliation and submission are each bounded to eight seconds. Keep the
// persisted in-flight lease longer than both calls combined so a concurrent
// retry cannot start a second external flight while the first still owns it.
export const PAPER_SUBMISSION_LEASE_MS = (2 * ALPACA_PAPER_REQUEST_TIMEOUT_MS) + 4_000;

export type PaperOrderSide = "buy" | "sell";

export type PaperMooCommand = {
  schemaVersion: "paper-moo-command-v1";
  commandId: string;
  intentId: string;
  idempotencyKey: string;
  actorEmail: string;
  targetSession: string;
  calendar: {
    venue: "NASDAQ";
    calendarVersion: string;
    isTradingSession: true;
  };
  confirmation: {
    explicit: true;
    phrase: string;
    confirmedAt: number;
    expiresAt: number;
  };
  order: {
    symbol: "NVDA";
    side: PaperOrderSide;
    quantity: number;
    type: "market";
    timeInForce: "opg";
    extendedHours: false;
  };
};

export type PaperBrokerEnv = {
  PAPER_BROKER: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  APCA_API_KEY_ID: string;
  APCA_API_SECRET_KEY: string;
  PAPER_COMMAND_SECRET: string;
  PAPER_COMMAND_AUDIENCE: string;
  PAPER_ORDER_ADMIN_EMAILS: string;
  PAPER_ORDER_SUBMISSION_ENABLED: string;
  PAPER_SHORTS_ENABLED: string;
  PAPER_MAX_SHARES: string;
};

export type PaperBrokerConfig = {
  submissionEnabled: boolean;
  shortsEnabled: boolean;
  maximumShares: number;
  audience: string;
  admins: Set<string>;
};

export type PaperCommandValidation =
  | { valid: true; command: PaperMooCommand }
  | { valid: false; errors: string[] };

function booleanFlag(value: string, name: string) {
  if (value !== "true" && value !== "false") throw new Error(`${name}_INVALID`);
  return value === "true";
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function newYorkParts(timestamp: number) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

export function newYorkWallTimeUtc(date: string, hour: number, minute: number, second = 0) {
  if (!validDate(date)) throw new RangeError("TARGET_SESSION_INVALID");
  const [year, month, day] = date.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = targetAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = newYorkParts(guess);
    const representedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = targetAsUtc - representedAsUtc;
    guess += correction;
    if (correction === 0) break;
  }
  const verified = newYorkParts(guess);
  if (`${verified.year}-${String(verified.month).padStart(2, "0")}-${String(verified.day).padStart(2, "0")}` !== date ||
      verified.hour !== hour || verified.minute !== minute || verified.second !== second) {
    throw new RangeError("NEW_YORK_WALL_TIME_INVALID");
  }
  return guess;
}

function weekdaySession(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function validatePaperBrokerEnv(env: PaperBrokerEnv): PaperBrokerConfig {
  if (!nonempty(env.APCA_API_KEY_ID) || !nonempty(env.APCA_API_SECRET_KEY)) throw new Error("ALPACA_PAPER_CREDENTIALS_MISSING");
  if (new TextEncoder().encode(env.PAPER_COMMAND_SECRET ?? "").byteLength < 32) throw new Error("PAPER_COMMAND_SECRET_TOO_SHORT");
  if (!/^[-a-z0-9.]{8,100}$/.test(env.PAPER_COMMAND_AUDIENCE ?? "")) throw new Error("PAPER_COMMAND_AUDIENCE_INVALID");
  const admins = new Set((env.PAPER_ORDER_ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!admins.size || [...admins].some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("PAPER_ORDER_ADMIN_EMAILS_INVALID");
  const maximumShares = Number(env.PAPER_MAX_SHARES);
  if (!Number.isSafeInteger(maximumShares) || maximumShares < 1 || maximumShares > 100) throw new Error("PAPER_MAX_SHARES_INVALID");
  return {
    submissionEnabled: booleanFlag(env.PAPER_ORDER_SUBMISSION_ENABLED, "PAPER_ORDER_SUBMISSION_ENABLED"),
    shortsEnabled: booleanFlag(env.PAPER_SHORTS_ENABLED, "PAPER_SHORTS_ENABLED"),
    maximumShares,
    audience: env.PAPER_COMMAND_AUDIENCE,
    admins,
  };
}

export function validatePaperMooCommand(value: unknown, config: PaperBrokerConfig, now = Date.now()): PaperCommandValidation {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { valid: false, errors: ["COMMAND_INVALID"] };
  const command = value as PaperMooCommand;
  if (command.schemaVersion !== "paper-moo-command-v1") errors.push("SCHEMA_VERSION_INVALID");
  if (!safeId(command.commandId)) errors.push("COMMAND_ID_INVALID");
  if (!safeId(command.intentId)) errors.push("INTENT_ID_INVALID");
  if (!safeId(command.idempotencyKey)) errors.push("IDEMPOTENCY_KEY_INVALID");
  const actor = typeof command.actorEmail === "string" ? command.actorEmail.trim().toLowerCase() : "";
  if (!config.admins.has(actor)) errors.push("ACTOR_NOT_AUTHORIZED");
  if (!validDate(command.targetSession)) errors.push("TARGET_SESSION_INVALID");
  if (validDate(command.targetSession) && !weekdaySession(command.targetSession)) errors.push("TARGET_SESSION_NOT_WEEKDAY");
  if (command.calendar?.venue !== "NASDAQ" || command.calendar?.isTradingSession !== true || !nonempty(command.calendar?.calendarVersion)) {
    errors.push("TRADING_SESSION_PROOF_INVALID");
  }
  const order = command.order;
  if (order?.symbol !== "NVDA") errors.push("SYMBOL_INVALID");
  if (order?.side !== "buy" && order?.side !== "sell") errors.push("SIDE_INVALID");
  if (order?.side === "sell" && !config.shortsEnabled) errors.push("SHORTS_DISABLED");
  if (!Number.isSafeInteger(order?.quantity) || order.quantity < 1 || order.quantity > config.maximumShares) errors.push("QUANTITY_INVALID");
  if (order?.type !== "market") errors.push("ORDER_TYPE_INVALID");
  if (order?.timeInForce !== "opg") errors.push("TIME_IN_FORCE_INVALID");
  if (order?.extendedHours !== false) errors.push("EXTENDED_HOURS_INVALID");

  const confirmedAt = command.confirmation?.confirmedAt;
  const expiresAt = command.confirmation?.expiresAt;
  const expectedPhrase = order?.side === "buy" || order?.side === "sell"
    ? `PAPER NVDA ${order.side.toUpperCase()} ${order.quantity}`
    : "";
  if (command.confirmation?.explicit !== true || command.confirmation?.phrase !== expectedPhrase) errors.push("EXPLICIT_CONFIRMATION_INVALID");
  if (!Number.isSafeInteger(confirmedAt) || !Number.isSafeInteger(expiresAt) || expiresAt <= confirmedAt ||
      expiresAt > confirmedAt + PAPER_CONFIRMATION_TTL_MS || now > expiresAt || confirmedAt > now + 1_000) {
    errors.push("CONFIRMATION_TIME_INVALID");
  }
  if (validDate(command.targetSession)) {
    const freezeAt = newYorkWallTimeUtc(command.targetSession, 9, 24, 30);
    const submitCutoffAt = newYorkWallTimeUtc(command.targetSession, 9, 25, 0);
    const finalEntryAt = newYorkWallTimeUtc(command.targetSession, 9, 28, 0);
    if (now < freezeAt) errors.push("DECISION_NOT_FROZEN");
    if (now >= submitCutoffAt) errors.push("SUBMISSION_WINDOW_CLOSED");
    if (now >= finalEntryAt) errors.push("FINAL_ENTRY_CLOSED");
    if (Number.isSafeInteger(confirmedAt) && (confirmedAt < freezeAt || confirmedAt >= submitCutoffAt)) {
      errors.push("CONFIRMATION_OUTSIDE_WINDOW");
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, command: { ...command, actorEmail: actor } };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function paperCommandDigest(command: PaperMooCommand) {
  return paperSha256(canonical(command));
}

export async function deterministicClientOrderId(command: PaperMooCommand) {
  const digest = await paperSha256(`${command.intentId}\n${command.idempotencyKey}\n${command.targetSession}\n${command.order.side}\n${command.order.quantity}`);
  const session = command.targetSession.replaceAll("-", "");
  return `apnvda-${session}-${command.order.side === "buy" ? "b" : "s"}-${digest.slice(0, 32)}`;
}
