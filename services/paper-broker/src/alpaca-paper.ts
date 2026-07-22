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
