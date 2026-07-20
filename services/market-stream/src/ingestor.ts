import {
  MARKET_STREAM_SCHEMA,
  coverageForFeed,
  type AlpacaFeed,
  type ProviderMarketEvent,
  type SourceTimestamp,
} from "./contracts.ts";
export { resolveAlpacaFeed } from "./config.ts";

export type ProviderSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState?: number;
};

export type ProviderSocketHandlers = {
  open(): void;
  message(data: string): void;
  close(code: number, reason: string): void;
  error(reason: unknown): void;
};

export interface ProviderSocketConnector {
  connect(url: string, handlers: ProviderSocketHandlers): ProviderSocket;
}

export type AlpacaIngestorConfig = {
  feed: AlpacaFeed;
  symbol: "NVDA";
  keyId: string;
  secretKey: string;
  silenceTimeoutMs: number;
  handshakeTimeoutMs: number;
  baseBackoffMs: number;
  maximumBackoffMs: number;
  sessionActivityAt?: (at: number) => "ACTIVE" | "QUIET";
  nextActiveAt?: (at: number) => number;
};

export type ProviderConnectionState = "CONNECTING" | "AUTHENTICATING" | "SUBSCRIBING" | "LIVE" | "SILENT" | "BACKOFF" | "DEGRADED";

export type AlpacaIngestorHooks = {
  now(): number;
  onEvents(events: ProviderMarketEvent[]): void | Promise<void>;
  onConnection(state: ProviderConnectionState, nextReconnectAt: number | null, detail?: string): void | Promise<void>;
};

export function alpacaStreamUrl(feed: AlpacaFeed) {
  return `wss://stream.data.alpaca.markets/v2/${feed}`;
}

export function reconnectBackoffMs(attempt: number, baseMs = 1_000, maximumMs = 30_000) {
  const exponent = Math.max(0, Math.min(20, Math.trunc(attempt)));
  return Math.min(maximumMs, baseMs * 2 ** exponent);
}

const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function observedFixed(year: number, month: number, day: number) {
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCDay() === 6) at.setUTCDate(at.getUTCDate() - 1);
  else if (at.getUTCDay() === 0) at.setUTCDate(at.getUTCDate() + 1);
  return dateKey(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return dateKey(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const last = new Date(Date.UTC(year, month, 0));
  last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
  return dateKey(year, month, last.getUTCDate());
}

function goodFriday(year: number) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  const friday = new Date(Date.UTC(year, month - 1, day - 2));
  return dateKey(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate());
}

function holidayKeys(year: number) {
  return new Set([
    observedFixed(year, 1, 1), nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), goodFriday(year),
    lastWeekday(year, 5, 1), observedFixed(year, 6, 19), observedFixed(year, 7, 4), nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4), observedFixed(year, 12, 25), observedFixed(year + 1, 1, 1),
  ]);
}

function earlyCloseKeys(year: number) {
  const thanksgiving = new Date(`${nthWeekday(year, 11, 4, 4)}T00:00:00Z`);
  thanksgiving.setUTCDate(thanksgiving.getUTCDate() + 1);
  const values = [dateKey(year, 7, 3), dateKey(thanksgiving.getUTCFullYear(), thanksgiving.getUTCMonth() + 1, thanksgiving.getUTCDate()), dateKey(year, 12, 24)];
  return new Set(values.filter((value) => {
    const day = new Date(`${value}T00:00:00Z`).getUTCDay();
    return day >= 1 && day <= 5 && !holidayKeys(year).has(value);
  }));
}

function easternParts(at: number) {
  const parts = Object.fromEntries(ET_PARTS.formatToParts(new Date(at)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

/** Alpaca equities are expected to be active only during 04:00-20:00 ET trading-day coverage. */
export function alpacaSessionActivityAt(at: number): "ACTIVE" | "QUIET" {
  const part = easternParts(at);
  const key = dateKey(part.year, part.month, part.day);
  const weekday = new Date(Date.UTC(part.year, part.month - 1, part.day)).getUTCDay();
  const holiday = holidayKeys(part.year - 1).has(key) || holidayKeys(part.year).has(key) || holidayKeys(part.year + 1).has(key);
  const minute = part.hour * 60 + part.minute;
  const extendedCloseMinute = earlyCloseKeys(part.year).has(key) ? 17 * 60 : 20 * 60;
  return weekday >= 1 && weekday <= 5 && !holiday && minute >= 4 * 60 && minute < extendedCloseMinute ? "ACTIVE" : "QUIET";
}

/** Start of the active 04:00 ET provider session containing `at`. */
export function alpacaActiveSessionStartAt(at: number) {
  if (!Number.isSafeInteger(at) || at < 0) throw new TypeError("SESSION_TIMESTAMP_INVALID");
  let candidate = Math.floor(at / 60_000) * 60_000;
  const searchFloor = Math.max(0, candidate - 10 * 24 * 60 * 60_000);
  while (candidate > searchFloor && alpacaSessionActivityAt(candidate) !== "ACTIVE") candidate -= 60_000;
  if (alpacaSessionActivityAt(candidate) !== "ACTIVE") return Math.floor(at / 60_000) * 60_000;
  const floor = Math.max(0, candidate - 24 * 60 * 60_000);
  while (candidate > floor && alpacaSessionActivityAt(candidate - 60_000) === "ACTIVE") candidate -= 60_000;
  return candidate;
}

export function nextAlpacaActiveAt(at: number) {
  const start = Math.floor(at / 60_000) * 60_000 + 60_000;
  for (let candidate = start; candidate <= start + 10 * 24 * 60 * 60_000; candidate += 60_000) {
    if (alpacaSessionActivityAt(candidate) === "ACTIVE") return candidate;
  }
  return at + 24 * 60 * 60_000;
}

function safeInteger(value: unknown, positive = false) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) ? value : null;
}

function cents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function strings(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null;
}

function code(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 8 ? value : null;
}

/** Preserve Alpaca's nanosecond timestamp while also exposing a safe millisecond index. */
export function parseAlpacaTimestamp(value: unknown): SourceTimestamp | null {
  if (typeof value !== "string") return null;
  const matched = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!matched) return null;
  const wholeSecond = Date.parse(`${matched[1]}Z`);
  if (!Number.isSafeInteger(wholeSecond) || wholeSecond < 0) return null;
  const fraction = matched[2] ?? "";
  const nanos = fraction.padEnd(9, "0");
  const epochNanos = (BigInt(wholeSecond) * 1_000_000n + BigInt(nanos || "0")).toString();
  const epochMs = wholeSecond + Number(nanos.slice(0, 3) || "0");
  return { raw: value, epochMs, epochNanos, fractionalDigits: fraction.length };
}

function encode(parts: Array<string | number>) {
  return parts.map((part) => encodeURIComponent(String(part))).join(":");
}

function baseEvent(input: { feed: AlpacaFeed; receivedAt: number; processedAt: number; transport: "WEBSOCKET" | "REST_RECOVERY"; providerEntitlementConfirmed: boolean }, timestamp: SourceTimestamp) {
  return {
    schemaVersion: MARKET_STREAM_SCHEMA,
    symbol: "NVDA" as const,
    source: "alpaca" as const,
    transport: input.transport,
    feed: input.feed,
    coverage: coverageForFeed(input.feed, input.providerEntitlementConfirmed),
    sourceTimestamp: timestamp,
    sourceObservedAt: timestamp.epochMs,
    receivedAt: input.receivedAt,
    processedAt: input.processedAt,
    availableAt: Math.max(input.receivedAt, input.processedAt),
  };
}

/** Normalize only documented Alpaca stock data frames; control frames remain with the supervisor. */
export function normalizeAlpacaMessages(
  raw: string,
  input: { feed: AlpacaFeed; receivedAt: number; processedAt?: number; transport?: "WEBSOCKET" | "REST_RECOVERY"; providerEntitlementConfirmed?: boolean },
): ProviderMarketEvent[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const receivedAt = safeInteger(input.receivedAt);
  const processedAt = safeInteger(input.processedAt ?? input.receivedAt);
  if (receivedAt == null || processedAt == null) return [];
  const timing = { feed: input.feed, receivedAt, processedAt, transport: input.transport ?? "WEBSOCKET" as const,
    providerEntitlementConfirmed: input.providerEntitlementConfirmed === true };
  const events: ProviderMarketEvent[] = [];
  for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!candidate || typeof candidate !== "object") continue;
    const message = candidate as Record<string, unknown>;
    if (String(message.S ?? "").toUpperCase() !== "NVDA") continue;
    const timestamp = parseAlpacaTimestamp(message.t);
    if (!timestamp) continue;
    const providerSequence = safeInteger(message.seq ?? message.sequence);
    const base = baseEvent(timing, timestamp);
    if (message.T === "t") {
      const providerTradeId = typeof message.i === "string" || typeof message.i === "number" ? String(message.i) : null;
      const priceCents = cents(message.p);
      const size = safeInteger(message.s, true);
      const exchange = code(message.x);
      const tape = code(message.z);
      const conditions = strings(message.c);
      if (!providerTradeId || priceCents == null || size == null || !exchange || !tape || !conditions) continue;
      events.push({ ...base, eventKey: encode(["alpaca", input.feed, "NVDA", "TRADE", providerTradeId]), providerEventId: providerTradeId,
        kind: "TRADE", providerSequence, trade: { providerTradeId, priceCents, size, exchange, tape, conditions }, quote: null, bar: null, correction: null, cancel: null });
    } else if (message.T === "q") {
      const bidCents = cents(message.bp); const askCents = cents(message.ap);
      const bidSize = safeInteger(message.bs); const askSize = safeInteger(message.as);
      const bidExchange = code(message.bx); const askExchange = code(message.ax); const tape = code(message.z); const conditions = strings(message.c);
      if (bidCents == null || askCents == null || askCents < bidCents || bidSize == null || askSize == null || !bidExchange || !askExchange || !tape || !conditions) continue;
      const identity = [timestamp.epochNanos, bidExchange, bidCents, bidSize, askExchange, askCents, askSize, tape, conditions.join(",")];
      events.push({ ...base, eventKey: encode(["alpaca", input.feed, "NVDA", "QUOTE", ...identity]), providerEventId: null,
        kind: "QUOTE", providerSequence, trade: null, quote: { bidCents, askCents, bidSize, askSize, bidExchange, askExchange, tape, conditions }, bar: null, correction: null, cancel: null });
    } else if (message.T === "b" || message.T === "u") {
      const openCents = cents(message.o); const highCents = cents(message.h); const lowCents = cents(message.l); const closeCents = cents(message.c);
      const volume = safeInteger(message.v); const tradeCount = safeInteger(message.n); const vwapCents = message.vw == null ? null : cents(message.vw);
      if (openCents == null || highCents == null || lowCents == null || closeCents == null || volume == null || tradeCount == null ||
        lowCents > openCents || lowCents > closeCents || highCents < openCents || highCents < closeCents || highCents < lowCents) continue;
      const minuteStart = Math.floor(timestamp.epochMs / 60_000) * 60_000;
      const barKey = encode(["alpaca", input.feed, "NVDA", minuteStart]);
      const update = message.T === "u";
      const identity = [barKey, openCents, highCents, lowCents, closeCents, volume, tradeCount, vwapCents ?? "na"];
      events.push({ ...base, eventKey: encode(["alpaca", input.feed, "NVDA", update ? "BAR_UPDATE" : "BAR", ...identity]), providerEventId: null,
        kind: update ? "BAR_UPDATE" : "BAR", providerSequence, trade: null, quote: null,
        bar: { barKey, minuteStart, minuteEnd: minuteStart + 60_000, openCents, highCents, lowCents, closeCents, volume, tradeCount, vwapCents, update }, correction: null, cancel: null });
    } else if (message.T === "c") {
      const originalTradeId = typeof message.oi === "string" || typeof message.oi === "number" ? String(message.oi) : null;
      const correctedTradeId = typeof message.ci === "string" || typeof message.ci === "number" ? String(message.ci) : null;
      const originalPriceCents = cents(message.op); const correctedPriceCents = cents(message.cp);
      const originalSize = safeInteger(message.os, true); const correctedSize = safeInteger(message.cs, true);
      const originalConditions = strings(message.oc); const correctedConditions = strings(message.cc); const exchange = code(message.x); const tape = code(message.z);
      if (!originalTradeId || !correctedTradeId || originalPriceCents == null || correctedPriceCents == null || originalSize == null || correctedSize == null || !originalConditions || !correctedConditions || !exchange || !tape) continue;
      events.push({ ...base, eventKey: encode(["alpaca", input.feed, "NVDA", "CORRECTION", correctedTradeId]), providerEventId: correctedTradeId,
        kind: "CORRECTION", providerSequence, trade: null, quote: null, bar: null,
        correction: { originalTradeId, correctedTradeId, originalPriceCents, originalSize, originalConditions, correctedPriceCents, correctedSize, correctedConditions, exchange, tape }, cancel: null });
    } else if (message.T === "x") {
      const providerTradeId = typeof message.i === "string" || typeof message.i === "number" ? String(message.i) : null;
      const priceCents = cents(message.p); const size = safeInteger(message.s, true); const exchange = code(message.x); const tape = code(message.z);
      const action = message.a === "C" || message.a === "E" ? message.a : null;
      if (!providerTradeId || priceCents == null || size == null || !exchange || !tape || !action) continue;
      events.push({ ...base, eventKey: encode(["alpaca", input.feed, "NVDA", "CANCEL", providerTradeId, action, timestamp.epochNanos]), providerEventId: providerTradeId,
        kind: "CANCEL", providerSequence, trade: null, quote: null, bar: null, correction: null,
        cancel: { providerTradeId, action, priceCents, size, exchange, tape } });
    }
  }
  return events;
}

type ProtocolPhase = "IDLE" | "CONNECTING" | "AWAITING_CONNECTED" | "AUTHENTICATING" | "SUBSCRIBING" | "LIVE" | "BACKOFF" | "STOPPED";

export class AlpacaStreamSupervisor {
  readonly #config: AlpacaIngestorConfig;
  readonly #connector: ProviderSocketConnector;
  readonly #hooks: AlpacaIngestorHooks;
  #socket: ProviderSocket | null = null;
  #phase: ProtocolPhase = "IDLE";
  #phaseDeadlineAt: number | null = null;
  #lastMessageAt: number | null = null;
  #nextReconnectAt: number | null = null;
  #attempt = 0;
  #generation = 0;
  #messageChain: Promise<void> = Promise.resolve();

  constructor(config: AlpacaIngestorConfig, connector: ProviderSocketConnector, hooks: AlpacaIngestorHooks) {
    if (!config.keyId || !config.secretKey) throw new Error("ALPACA_CREDENTIALS_REQUIRED");
    this.#config = config; this.#connector = connector; this.#hooks = hooks;
  }

  get status() {
    return { phase: this.#phase, lastMessageAt: this.#lastMessageAt, nextReconnectAt: this.#nextReconnectAt, attempt: this.#attempt, connected: this.#phase === "LIVE", generation: this.#generation };
  }

  start() {
    if (this.#socket || this.#phase === "STOPPED") return;
    const now = this.#hooks.now();
    if (this.#nextReconnectAt != null && now < this.#nextReconnectAt) return;
    if ((this.#config.sessionActivityAt ?? alpacaSessionActivityAt)(now) === "QUIET") {
      this.#phase = "BACKOFF";
      this.#nextReconnectAt = (this.#config.nextActiveAt ?? nextAlpacaActiveAt)(now);
      void Promise.resolve(this.#hooks.onConnection("BACKOFF", this.#nextReconnectAt, "market quiet window")).catch(() => undefined);
      return;
    }
    const generation = ++this.#generation;
    this.#phase = "CONNECTING"; this.#phaseDeadlineAt = now + this.#config.handshakeTimeoutMs; this.#lastMessageAt = null; this.#nextReconnectAt = null;
    void Promise.resolve(this.#hooks.onConnection("CONNECTING", null))
      .catch(() => this.#scheduleReconnect(generation, "connection-state persistence failure"));
    const socket = this.#connector.connect(alpacaStreamUrl(this.#config.feed), {
      open: () => { if (generation === this.#generation) { this.#phase = "AWAITING_CONNECTED"; this.#phaseDeadlineAt = this.#hooks.now() + this.#config.handshakeTimeoutMs; } },
      message: (raw) => { if (generation === this.#generation) this.#enqueueMessage(generation, raw); },
      close: (_code, reason) => { if (generation === this.#generation) this.#scheduleReconnect(generation, reason || "provider close"); },
      error: () => { if (generation === this.#generation) this.#scheduleReconnect(generation, "provider error"); },
    });
    if (generation === this.#generation) this.#socket = socket;
  }

  tick() {
    const now = this.#hooks.now();
    if (this.#socket && this.#phaseDeadlineAt != null && now > this.#phaseDeadlineAt) return this.#scheduleReconnect(this.#generation, "protocol deadline");
    if (this.#socket && this.#phase === "LIVE" && this.#lastMessageAt != null && now - this.#lastMessageAt > this.#config.silenceTimeoutMs) {
      if ((this.#config.sessionActivityAt ?? alpacaSessionActivityAt)(now) === "QUIET") return;
      void Promise.resolve(this.#hooks.onConnection("SILENT", null, "provider silence watchdog")).catch(() => undefined);
      return this.#scheduleReconnect(this.#generation, "provider silence watchdog");
    }
    if (!this.#socket && this.#phase === "BACKOFF" && this.#nextReconnectAt != null && now >= this.#nextReconnectAt) this.start();
  }

  stop() {
    const socket = this.#socket;
    this.#generation += 1; this.#socket = null; this.#phase = "STOPPED"; this.#phaseDeadlineAt = null; this.#nextReconnectAt = null;
    try { socket?.close(1000, "supervisor stopped"); } catch { /* closed */ }
  }

  #enqueueMessage(generation: number, raw: string) {
    const run = async () => { if (generation === this.#generation) await this.#processMessage(generation, raw); };
    this.#messageChain = this.#messageChain.then(run, run).catch(() => this.#scheduleReconnect(generation, "message processing failure"));
  }

  async #processMessage(generation: number, raw: string) {
    const now = this.#hooks.now(); this.#lastMessageAt = now;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return; }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of messages) {
      if (!candidate || typeof candidate !== "object") continue;
      const message = candidate as Record<string, unknown>;
      if (message.T === "error") return this.#scheduleReconnect(generation, `alpaca error ${String(message.code ?? "unknown")}`);
      if (message.T === "success" && message.msg === "connected" && this.#phase === "AWAITING_CONNECTED") {
        this.#phase = "AUTHENTICATING"; this.#phaseDeadlineAt = now + this.#config.handshakeTimeoutMs;
        await this.#hooks.onConnection("AUTHENTICATING", null);
        this.#socket?.send(JSON.stringify({ action: "auth", key: this.#config.keyId, secret: this.#config.secretKey }));
      } else if (message.T === "success" && message.msg === "authenticated" && this.#phase === "AUTHENTICATING") {
        this.#phase = "SUBSCRIBING"; this.#phaseDeadlineAt = now + this.#config.handshakeTimeoutMs;
        await this.#hooks.onConnection("SUBSCRIBING", null);
        this.#socket?.send(JSON.stringify({ action: "subscribe", trades: ["NVDA"], quotes: ["NVDA"], bars: ["NVDA"], updatedBars: ["NVDA"], corrections: ["NVDA"], cancelErrors: ["NVDA"] }));
      } else if (message.T === "subscription" && this.#phase === "SUBSCRIBING") {
        const subscribed = [message.trades, message.quotes, message.bars, message.updatedBars, message.corrections, message.cancelErrors]
          .every((value) => Array.isArray(value) && value.includes("NVDA"));
        if (!subscribed) return this.#scheduleReconnect(generation, "subscription acknowledgement incomplete");
        this.#phase = "LIVE"; this.#phaseDeadlineAt = null; this.#attempt = 0; this.#nextReconnectAt = null;
        await this.#hooks.onConnection("LIVE", null);
      }
    }
    if (this.#phase !== "LIVE") return;
    const events = normalizeAlpacaMessages(raw, { feed: this.#config.feed, receivedAt: now, processedAt: this.#hooks.now(), providerEntitlementConfirmed: true });
    if (events.length) await this.#hooks.onEvents(events);
  }

  #scheduleReconnect(generation: number, detail: string) {
    if (generation !== this.#generation || this.#phase === "STOPPED" || (this.#phase === "BACKOFF" && this.#nextReconnectAt != null)) return;
    const socket = this.#socket; this.#socket = null; this.#phaseDeadlineAt = null;
    this.#generation += 1;
    try { socket?.close(1012, detail.slice(0, 120)); } catch { /* closed */ }
    const now = this.#hooks.now();
    const quiet = (this.#config.sessionActivityAt ?? alpacaSessionActivityAt)(now) === "QUIET";
    const delay = quiet
      ? Math.max(0, (this.#config.nextActiveAt ?? nextAlpacaActiveAt)(now) - now)
      : reconnectBackoffMs(this.#attempt, this.#config.baseBackoffMs, this.#config.maximumBackoffMs);
    if (!quiet) this.#attempt += 1;
    this.#nextReconnectAt = now + delay; this.#phase = "BACKOFF";
    void Promise.resolve(this.#hooks.onConnection("BACKOFF", this.#nextReconnectAt, detail)).catch(() => undefined);
  }
}

export class WorkerWebSocketConnector implements ProviderSocketConnector {
  connect(url: string, handlers: ProviderSocketHandlers): ProviderSocket {
    const socket = new WebSocket(url);
    socket.addEventListener("open", handlers.open);
    socket.addEventListener("message", (event) => handlers.message(String(event.data)));
    socket.addEventListener("close", (event) => handlers.close(event.code, event.reason));
    socket.addEventListener("error", handlers.error);
    return socket;
  }
}
