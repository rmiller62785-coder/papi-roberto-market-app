import type { AlpacaFeed, ProviderMarketEvent } from "./contracts.ts";
import { normalizeAlpacaMessages } from "./ingestor.ts";
import { ProviderRecoveryPageLimitError, type ProviderRestRecovery } from "./recovery.ts";

type RestCollection = { items: unknown[]; nextPageToken: string | null };

const DEFAULT_MAXIMUM_PAGES = 5;

function nanosecondBoundary(epochMs: number, edge: "start" | "end") {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) throw new TypeError("RECOVERY_BOUNDARY_INVALID");
  const milliseconds = new Date(epochMs).toISOString().slice(0, 23);
  return `${milliseconds}${edge === "end" ? "999999" : "000000"}Z`;
}

export class AlpacaRestRecoveryClient implements ProviderRestRecovery {
  readonly #feed: AlpacaFeed;
  readonly #keyId: string;
  readonly #secretKey: string;
  readonly #fetcher: typeof fetch;
  readonly #now: () => number;
  readonly #maximumPages: number;
  constructor(input: { feed: AlpacaFeed; keyId: string; secretKey: string; fetcher?: typeof fetch; now?: () => number; maximumPages?: number }) {
    this.#feed = input.feed; this.#keyId = input.keyId; this.#secretKey = input.secretKey;
    // Do not retain Cloudflare's native fetch as a method value: calling that
    // value through a private field supplies the client as `this`, which the
    // Workers runtime rejects as an illegal invocation.
    this.#fetcher = input.fetcher ?? ((request, init) => fetch(request, init)); this.#now = input.now ?? Date.now;
    this.#maximumPages = Math.max(1, Math.min(20, Math.trunc(input.maximumPages ?? DEFAULT_MAXIMUM_PAGES)));
  }

  async fetchEvents(input: { symbol: "NVDA"; feed: AlpacaFeed; atOrAfterProviderAt: number | null; beforeOrAt: number }) {
    if (input.feed !== this.#feed) throw new Error("RECOVERY_FEED_MISMATCH");
    if (input.atOrAfterProviderAt == null) return [];
    const start = nanosecondBoundary(input.atOrAfterProviderAt, "start");
    const end = nanosecondBoundary(input.beforeOrAt, "end");
    // Fetch channels serially so a dense trade segment is bisected before
    // quotes and bars allocate another page-capped collection in memory.
    const trades = await this.#fetchAll("trades", "trades", start, end);
    const quotes = await this.#fetchAll("quotes", "quotes", start, end);
    const bars = await this.#fetchAll("bars", "bars", start, end, { timeframe: "1Min" });
    const events: ProviderMarketEvent[] = [];
    for (const [kind, collection] of [["t", trades], ["q", quotes], ["b", bars]] as const) {
      const receivedAt = this.#now();
      const frames = collection.items.map((candidate) => candidate && typeof candidate === "object"
        ? { ...(candidate as Record<string, unknown>), T: kind, S: "NVDA" }
        : candidate);
      events.push(...normalizeAlpacaMessages(JSON.stringify(frames), {
        feed: input.feed,
        receivedAt,
        processedAt: this.#now(),
        transport: "REST_RECOVERY",
        // A successful historical SIP request proves API access, not a live
        // execution quote. Recovery evidence is never promoted into the
        // Strict gate; only acknowledged WebSocket observations may qualify.
        providerEntitlementConfirmed: false,
      }));
    }
    const unique = new Map(events
      .filter((event) => event.sourceObservedAt <= input.beforeOrAt && (!event.bar || event.bar.minuteEnd <= input.beforeOrAt))
      .map((event) => [event.eventKey, event]));
    return [...unique.values()].sort((left, right) => left.sourceObservedAt - right.sourceObservedAt || left.eventKey.localeCompare(right.eventKey));
  }

  async #fetchAll(path: string, key: string, start: string, end: string, extra: Record<string, string> = {}): Promise<RestCollection> {
    const items: unknown[] = [];
    let pageToken: string | null = null;
    const seenPageTokens = new Set<string>();
    for (let page = 0; page < this.#maximumPages; page += 1) {
      const url = new URL(`https://data.alpaca.markets/v2/stocks/NVDA/${path}`);
      url.searchParams.set("feed", this.#feed); url.searchParams.set("start", start); url.searchParams.set("end", end);
      url.searchParams.set("sort", "asc"); url.searchParams.set("limit", "10000");
      for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, value);
      if (pageToken) url.searchParams.set("page_token", pageToken);
      const response = await this.#fetcher(url, {
        headers: { "APCA-API-KEY-ID": this.#keyId, "APCA-API-SECRET-KEY": this.#secretKey },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`ALPACA_RECOVERY_HTTP_${response.status}`);
      const payload = await response.json() as Record<string, unknown>;
      const values = payload[key];
      if (!Array.isArray(values)) throw new Error("ALPACA_RECOVERY_SCHEMA_INVALID");
      items.push(...values);
      pageToken = typeof payload.next_page_token === "string" && payload.next_page_token ? payload.next_page_token : null;
      if (!pageToken) return { items, nextPageToken: null };
      if (seenPageTokens.has(pageToken)) throw new Error("ALPACA_RECOVERY_PAGE_TOKEN_LOOP");
      seenPageTokens.add(pageToken);
    }
    throw new ProviderRecoveryPageLimitError(path);
  }
}
