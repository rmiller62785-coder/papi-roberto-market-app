import { ALPACA_PAPER_ORIGIN, ALPACA_PAPER_REQUEST_TIMEOUT_MS, type PaperMooCommand } from "./contracts.ts";
import { paperSha256 } from "./auth.ts";

const MAX_RESPONSE_BYTES = 128_000;

export type AlpacaPaperOrder = {
  id: string;
  clientOrderId: string;
  symbol: "NVDA";
  side: "buy" | "sell";
  quantity: string;
  filledQuantity: string;
  filledAveragePrice: string | null;
  type: "market";
  timeInForce: "opg";
  extendedHours: false;
  status: string;
  submittedAt: string | null;
  updatedAt: string | null;
};

export type AlpacaPaperHealthReference = {
  provider: "Alpaca Paper Trading API";
  environment: "paper";
  checkedAt: number;
  state: "LIVE" | "DEGRADED" | "UNAVAILABLE";
  account: {
    status: string;
    currency: string;
    buyingPower: string;
    cash: string;
    equity: string;
    portfolioValue: string;
    tradingBlocked: boolean;
    accountBlocked: boolean;
    tradeSuspendedByUser: boolean;
    shortingEnabled: boolean;
  } | null;
  nvdaPosition: {
    present: true;
    side: "long" | "short";
    quantity: string;
    averageEntryPrice: string | null;
    currentPrice: string | null;
    marketValue: string | null;
    unrealizedProfitLoss: string | null;
  } | { present: false } | null;
  openNvdaMooOrders: {
    count: number;
    byStatus: Record<string, number>;
  } | null;
  errors: string[];
  identifiersRedacted: true;
  liveTradingHostUsed: false;
};

export class AlpacaPaperApiError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  constructor(code: string, status: number | null, retryable: boolean, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "AlpacaPaperApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

type RawOrder = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decimalText(value: unknown) {
  const selected = text(value);
  return selected != null && /^-?(?:\d+)(?:\.\d+)?$/.test(selected) ? selected : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseAccount(value: unknown): NonNullable<AlpacaPaperHealthReference["account"]> {
  const raw = record(value);
  const status = text(raw?.status);
  const currency = text(raw?.currency);
  const buyingPower = decimalText(raw?.buying_power);
  const cash = decimalText(raw?.cash);
  const equity = decimalText(raw?.equity);
  const portfolioValue = decimalText(raw?.portfolio_value);
  const tradingBlocked = booleanValue(raw?.trading_blocked);
  const accountBlocked = booleanValue(raw?.account_blocked);
  const tradeSuspendedByUser = booleanValue(raw?.trade_suspended_by_user);
  const shortingEnabled = booleanValue(raw?.shorting_enabled);
  if (!status || !currency || buyingPower == null || cash == null || equity == null || portfolioValue == null ||
      tradingBlocked == null || accountBlocked == null || tradeSuspendedByUser == null || shortingEnabled == null) {
    throw new AlpacaPaperApiError("ALPACA_ACCOUNT_SCHEMA_INVALID", null, false);
  }
  return {
    status,
    currency,
    buyingPower,
    cash,
    equity,
    portfolioValue,
    tradingBlocked,
    accountBlocked,
    tradeSuspendedByUser,
    shortingEnabled,
  };
}

function parsePosition(value: unknown): Exclude<AlpacaPaperHealthReference["nvdaPosition"], null> {
  const raw = record(value);
  const symbol = text(raw?.symbol);
  const side = text(raw?.side);
  const quantity = decimalText(raw?.qty);
  if (symbol !== "NVDA" || (side !== "long" && side !== "short") || quantity == null) {
    throw new AlpacaPaperApiError("ALPACA_POSITION_SCHEMA_INVALID", null, false);
  }
  const optionalDecimal = (field: string) => {
    const value = raw?.[field];
    if (value == null) return null;
    const parsed = decimalText(value);
    if (parsed == null) throw new AlpacaPaperApiError("ALPACA_POSITION_SCHEMA_INVALID", null, false);
    return parsed;
  };
  return {
    present: true,
    side,
    quantity,
    averageEntryPrice: optionalDecimal("avg_entry_price"),
    currentPrice: optionalDecimal("current_price"),
    marketValue: optionalDecimal("market_value"),
    unrealizedProfitLoss: optionalDecimal("unrealized_pl"),
  };
}

function parseOpenNvdaMooOrders(value: unknown): NonNullable<AlpacaPaperHealthReference["openNvdaMooOrders"]> {
  if (!Array.isArray(value)) throw new AlpacaPaperApiError("ALPACA_ORDERS_SCHEMA_INVALID", null, false);
  const byStatus: Record<string, number> = {};
  let count = 0;
  for (const item of value) {
    const raw = record(item);
    if (!raw) throw new AlpacaPaperApiError("ALPACA_ORDERS_SCHEMA_INVALID", null, false);
    if (text(raw.symbol) !== "NVDA" || text(raw.type ?? raw.order_type) !== "market" || text(raw.time_in_force) !== "opg") continue;
    const status = text(raw.status);
    const side = text(raw.side);
    if (!text(raw.id) || !text(raw.client_order_id) || !status || (side !== "buy" && side !== "sell") ||
        decimalText(raw.qty) == null || raw.extended_hours !== false) {
      throw new AlpacaPaperApiError("ALPACA_ORDERS_SCHEMA_INVALID", null, false);
    }
    count += 1;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  return { count, byStatus };
}

async function boundedResponseText(response: Response, maximumBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return null;
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        try { await reader.cancel("RESPONSE_TOO_LARGE"); } catch { /* The size limit remains authoritative. */ }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function parseOrder(value: unknown, expectedClientOrderId: string, expected?: PaperMooCommand): AlpacaPaperOrder {
  if (!value || typeof value !== "object") throw new AlpacaPaperApiError("ALPACA_ORDER_SCHEMA_INVALID", null, false);
  const raw = value as RawOrder;
  const id = text(raw.id);
  const clientOrderId = text(raw.client_order_id);
  const symbol = text(raw.symbol);
  const side = text(raw.side);
  const quantity = text(raw.qty);
  const type = text(raw.type ?? raw.order_type);
  const timeInForce = text(raw.time_in_force);
  const status = text(raw.status);
  const extendedHours = raw.extended_hours;
  if (!id || clientOrderId !== expectedClientOrderId || symbol !== "NVDA" ||
      (side !== "buy" && side !== "sell") || !quantity || type !== "market" ||
      timeInForce !== "opg" || extendedHours !== false || !status) {
    throw new AlpacaPaperApiError("ALPACA_ORDER_SCHEMA_INVALID", null, false);
  }
  if (expected && (side !== expected.order.side || quantity !== String(expected.order.quantity))) {
    throw new AlpacaPaperApiError("ALPACA_ORDER_IDENTITY_MISMATCH", null, false);
  }
  return {
    id,
    clientOrderId,
    symbol: "NVDA",
    side,
    quantity,
    filledQuantity: text(raw.filled_qty) ?? "0",
    filledAveragePrice: text(raw.filled_avg_price),
    type: "market",
    timeInForce: "opg",
    extendedHours: false,
    status,
    submittedAt: text(raw.submitted_at),
    updatedAt: text(raw.updated_at),
  };
}

export class AlpacaPaperClient {
  readonly #keyId: string;
  readonly #secretKey: string;
  readonly #fetcher: typeof fetch;
  constructor(input: { keyId: string; secretKey: string; fetcher?: typeof fetch }) {
    this.#keyId = input.keyId;
    this.#secretKey = input.secretKey;
    this.#fetcher = input.fetcher ?? ((request, init) => globalThis.fetch(request, init));
  }

  async getByClientOrderId(clientOrderId: string, expected?: PaperMooCommand) {
    const url = new URL("/v2/orders:by_client_order_id", ALPACA_PAPER_ORIGIN);
    url.searchParams.set("client_order_id", clientOrderId);
    const response = await this.#request(url, { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) throw this.#httpError(response.status);
    return parseOrder(await this.#json(response), clientOrderId, expected);
  }

  async submitMoo(command: PaperMooCommand, clientOrderId: string) {
    const url = new URL("/v2/orders", ALPACA_PAPER_ORIGIN);
    const response = await this.#request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "NVDA",
        side: command.order.side,
        qty: String(command.order.quantity),
        type: "market",
        time_in_force: "opg",
        extended_hours: false,
        client_order_id: clientOrderId,
      }),
    });
    if (!response.ok) throw this.#httpError(response.status);
    return parseOrder(await this.#json(response), clientOrderId, command);
  }

  /** Read-only, identifier-redacted reference for the HMAC-protected health route. */
  async getPaperHealthReference(checkedAt = Date.now()): Promise<AlpacaPaperHealthReference> {
    const accountUrl = new URL("/v2/account", ALPACA_PAPER_ORIGIN);
    const positionUrl = new URL("/v2/positions/NVDA", ALPACA_PAPER_ORIGIN);
    const ordersUrl = new URL("/v2/orders", ALPACA_PAPER_ORIGIN);
    ordersUrl.searchParams.set("status", "open");
    ordersUrl.searchParams.set("limit", "50");
    ordersUrl.searchParams.set("direction", "desc");
    ordersUrl.searchParams.set("symbols", "NVDA");

    const account = this.#healthPart(async () => {
      const response = await this.#request(accountUrl, { method: "GET" });
      if (!response.ok) throw this.#httpError(response.status);
      return parseAccount(await this.#json(response));
    });
    const position = this.#healthPart(async () => {
      const response = await this.#request(positionUrl, { method: "GET" });
      if (response.status === 404) return { present: false } as const;
      if (!response.ok) throw this.#httpError(response.status);
      return parsePosition(await this.#json(response));
    });
    const orders = this.#healthPart(async () => {
      const response = await this.#request(ordersUrl, { method: "GET" });
      if (!response.ok) throw this.#httpError(response.status);
      return parseOpenNvdaMooOrders(await this.#json(response));
    });
    const [accountResult, positionResult, ordersResult] = await Promise.all([account, position, orders]);
    const errors = [accountResult, positionResult, ordersResult]
      .filter((part) => !part.ok)
      .map((part) => part.ok ? "" : part.error);
    const successfulParts = [accountResult, positionResult, ordersResult].filter((part) => part.ok).length;
    return {
      provider: "Alpaca Paper Trading API",
      environment: "paper",
      checkedAt,
      state: successfulParts === 0 ? "UNAVAILABLE" : errors.length ? "DEGRADED" : "LIVE",
      account: accountResult.ok ? accountResult.value : null,
      nvdaPosition: positionResult.ok ? positionResult.value : null,
      openNvdaMooOrders: ordersResult.ok ? ordersResult.value : null,
      errors,
      identifiersRedacted: true,
      liveTradingHostUsed: false,
    };
  }

  async #healthPart<T>(operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    try { return { ok: true, value: await operation() }; }
    catch (error) {
      return {
        ok: false,
        error: error instanceof AlpacaPaperApiError ? error.message : "ALPACA_PAPER_HEALTH_UNAVAILABLE",
      };
    }
  }

  async #request(url: URL, init: RequestInit) {
    if (url.origin !== ALPACA_PAPER_ORIGIN) throw new AlpacaPaperApiError("ALPACA_PAPER_ORIGIN_INVALID", null, false);
    const headers = new Headers(init.headers);
    headers.set("APCA-API-KEY-ID", this.#keyId);
    headers.set("APCA-API-SECRET-KEY", this.#secretKey);
    headers.set("accept", "application/json");
    try {
      return await this.#fetcher(url, {
        ...init,
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(ALPACA_PAPER_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AlpacaPaperApiError("ALPACA_PAPER_REQUEST_AMBIGUOUS", null, true, error);
    }
  }

  #httpError(status: number) {
    return new AlpacaPaperApiError(`ALPACA_PAPER_HTTP_${status}`, status, status >= 500 || status === 408 || status === 429);
  }

  async #json(response: Response) {
    const payload = await boundedResponseText(response, MAX_RESPONSE_BYTES);
    if (payload == null) {
      throw new AlpacaPaperApiError("ALPACA_PAPER_RESPONSE_TOO_LARGE", response.status, false);
    }
    try { return JSON.parse(payload) as unknown; }
    catch (error) { throw new AlpacaPaperApiError("ALPACA_PAPER_JSON_INVALID", response.status, false, error); }
  }
}

export async function paperOrderEvent(order: AlpacaPaperOrder, receivedAt: number, source: "REST_RECONCILIATION" | "REST_SUBMISSION") {
  const providerAtText = order.updatedAt ?? order.submittedAt;
  const parsedProviderAt = providerAtText == null ? NaN : Date.parse(providerAtText);
  const providerAt = Number.isFinite(parsedProviderAt) ? parsedProviderAt : receivedAt;
  const payload = JSON.stringify(order);
  const payloadHash = await paperSha256(payload);
  return {
    eventKey: `order:${order.id}:${order.status}:${payloadHash.slice(0, 24)}`,
    providerOrderId: order.id,
    clientOrderId: order.clientOrderId,
    eventType: order.status,
    providerAt,
    receivedAt,
    processedAt: Date.now(),
    source,
    payloadHash,
    payload,
  } as const;
}
