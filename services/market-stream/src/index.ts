import {
  MARKET_STREAM_SCHEMA,
  type IngestionBatch,
  type MarketStreamEmission,
  type MarketStreamEnv,
  type MarketStreamState,
  type PublicMarketSnapshot,
  streamInstanceName,
} from "./contracts.ts";
import { SignedSitesIngestionClient, consumeBrowserAccessToken, ingestionDeliveryErrorCode } from "./auth.ts";
import { originAllowed, validateMarketStreamEnv } from "./config.ts";
import {
  AlpacaStreamSupervisor,
  WorkerWebSocketConnector,
  alpacaActiveSessionStartAt,
  type ProviderConnectionState,
} from "./ingestor.ts";
import {
  advanceMarketWatermark,
  beginConnectionEpoch,
  identicalAuthoritativeBar,
  initialMarketStreamState,
  reconcileRecoveredMinuteIntegrity,
  reconcileRecoveredSessionIntegrity,
  reduceProviderEvent,
  setProviderConnectionState,
} from "./reducer.ts";
import {
  PROVIDER_RECOVERY_OVERLAP_MS,
  PROVIDER_RECOVERY_WINDOW_MS,
  fetchAdaptiveProviderRecoverySegment,
  streamCursor,
} from "./recovery.ts";
import { AlpacaRestRecoveryClient } from "./provider-rest.ts";
import { DurableSqlNonceStore, MarketStreamRepository, type DurableSqlStorageLike } from "./storage.ts";

const WATCHDOG_ALARM_MS = 5_000;
const BACKLOG_DRAIN_ALARM_MS = 250;
const PRIORITY_PROJECTION_RETRY_MS = 500;
const PRIORITY_QUOTE_CADENCE_MS = 2_000;
const MAX_SOCKET_BUFFER_BYTES = 1_000_000;
const PROVIDER_RECOVERY_WINDOWS_PER_TICK = 4;
const CORRECTION_RECOVERY_SETTLE_MS = 60_000;

type HibernatableWebSocket = WebSocket & { serializeAttachment(value: unknown): void; readonly bufferedAmount?: number };
type DurableObjectStateLike = {
  storage: DurableSqlStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  acceptWebSocket(socket: HibernatableWebSocket): void;
  getWebSockets(): HibernatableWebSocket[];
};
type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };

declare const WebSocketPair: { new(): { 0: HibernatableWebSocket; 1: HibernatableWebSocket } };

function json(value: unknown, status = 200, allowedOrigin?: string | null) {
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("vary", "origin");
  }
  return Response.json(value, {
    status,
    headers,
  });
}

function durableStub(env: MarketStreamEnv) {
  const { feed } = validateMarketStreamEnv(env);
  return env.MARKET_STREAM.get(env.MARKET_STREAM.idFromName(streamInstanceName(feed)));
}

function deliveryBackoffMs(attempt: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.min(6, Math.max(0, attempt)));
}

function integrityRecoveryThrough(detectedAt: number, now: number) {
  return Math.max(now, Math.floor(detectedAt / 60_000) * 60_000 + 60_000);
}

function controlAuthorized(request: Request, secret: string) {
  return Boolean(secret && request.headers.get("x-stream-control") === secret);
}

export class NvdaMarketStream {
  readonly ctx: DurableObjectStateLike;
  readonly env: MarketStreamEnv;
  readonly #config: ReturnType<typeof validateMarketStreamEnv>;
  readonly #repository: MarketStreamRepository;
  readonly #browserNonces: DurableSqlNonceStore;
  #market: MarketStreamState;
  #supervisor: AlpacaStreamSupervisor | null = null;
  #ingestion: Pick<SignedSitesIngestionClient, "send" | "sendPriority">;
  #providerRecovery: AlpacaRestRecoveryClient;
  #mutationChain: Promise<void> = Promise.resolve();
  #drainPromise: Promise<void> | null = null;
  #priorityQuotePromise: Promise<void> | null = null;
  readonly #priorityStatePromises = new Map<number, Promise<void>>();
  #priorityQuoteRetryAt = 0;
  #priorityStateRetryAt = 0;
  #priorityStateRetrySequence = 0;
  #priorityNextQuoteAt = 0;
  #providerRecoveryPromise: Promise<void> | null = null;
  #lastError: string | null = null;
  #lastErrorAt: number | null = null;
  #retired = false;
  readonly #suppressSupervisor: boolean;
  readonly #ready: Promise<void>;

  constructor(ctx: DurableObjectStateLike, env: MarketStreamEnv, dependencies: {
    ingestion?: Pick<SignedSitesIngestionClient, "send" | "sendPriority">;
    suppressSupervisor?: boolean;
  } = {}) {
    this.ctx = ctx; this.env = env; this.#config = validateMarketStreamEnv(env);
    this.#repository = new MarketStreamRepository(ctx.storage);
    this.#browserNonces = new DurableSqlNonceStore(ctx.storage, "browser-access");
    this.#market = initialMarketStreamState(this.#config.feed, "initializing");
    this.#ingestion = dependencies.ingestion ?? new SignedSitesIngestionClient({
      url: env.SITES_INGESTION_URL,
      secret: env.SITES_INGESTION_SECRET,
      audience: env.SITES_INGESTION_AUDIENCE,
      sitesAccessBypassToken: env.SITES_ACCESS_BYPASS_TOKEN,
    });
    this.#suppressSupervisor = dependencies.suppressSupervisor === true;
    this.#providerRecovery = new AlpacaRestRecoveryClient({
      feed: this.#config.feed,
      keyId: env.APCA_API_KEY_ID,
      secretKey: env.APCA_API_SECRET_KEY,
    });
    this.#ready = ctx.blockConcurrencyWhile(async () => {
      this.#repository.initializeSchema();
      const stored = this.#repository.loadState();
      if (stored?.schemaVersion === MARKET_STREAM_SCHEMA && stored.feed !== this.#config.feed) {
        // A feed switch changes the Durable Object instance name, but an alarm
        // already stored by the previous instance may still wake it. Preserve
        // its durable evidence and permanently retire it instead of silently
        // converting the old IEX object into a second SIP supervisor.
        this.#market = stored;
        this.#retired = true;
        await this.ctx.storage.deleteAlarm();
        return;
      }
      if (stored?.schemaVersion === MARKET_STREAM_SCHEMA) {
        this.#market = {
          ...stored,
          barIntegrity: stored.barIntegrity ?? { state: "CLEAR", reason: null, affectedMinuteStarts: [], detectedAt: null },
          providerState: "DISCONNECTED",
          nextReconnectAt: null,
        };
      } else {
        this.#market = initialMarketStreamState(this.#config.feed, crypto.randomUUID());
      }
      this.#repository.saveInitialState(this.#market);
      this.#reconcileCompletedFullSessionProof(Date.now());
      this.#ensureUnknownIntegrityRecovery(Date.now());
    });
  }

  async fetch(request: Request) {
    await this.#ready;
    if (this.#retired) return json({ error: "STREAM_INSTANCE_RETIRED" }, 410);
    const url = new URL(request.url);
    if (url.pathname === "/internal/tick") {
      if (!controlAuthorized(request, this.env.STREAM_CONTROL_SECRET)) return json({ error: "UNAUTHORIZED" }, 401);
      await this.#tick();
      return json({ ok: true });
    }
    if (url.pathname === "/health") {
      if (!controlAuthorized(request, this.env.STREAM_CONTROL_SECRET)) return json({ error: "UNAUTHORIZED" }, 401);
      const supervisor = this.#supervisor?.status ?? null;
      return json({
        schemaVersion: MARKET_STREAM_SCHEMA,
        symbol: "NVDA",
        feed: this.#market.feed,
        coverage: this.#market.coverage,
        providerState: this.#market.providerState,
        connectionEpoch: this.#market.connectionEpoch,
        serviceSequence: this.#market.serviceSequence,
        lastProviderAt: this.#market.lastProviderAt,
        lastReceivedAt: this.#market.lastReceivedAt,
        lastProcessedAt: this.#market.lastProcessedAt,
        lastAvailableAt: this.#market.lastAvailableAt,
        nextReconnectAt: this.#market.nextReconnectAt,
        supervisor,
        recovery: {
          overlapMs: PROVIDER_RECOVERY_OVERLAP_MS,
          windowMs: PROVIDER_RECOVERY_WINDOW_MS,
          checkpoint: this.#repository.providerRecoveryCheckpoint(),
          fullSessionProof: this.#repository.fullSessionRecoveryProof(),
          channels: ["trades", "quotes", "bars"],
          correctionAndCancelReplayAvailable: false,
          correctionSettleMs: CORRECTION_RECOVERY_SETTLE_MS,
        },
        barIntegrity: this.#market.barIntegrity,
        delivery: this.#repository.deliveryHealth(this.#market.streamId),
        priorityDelivery: {
          ...this.#repository.priorityDeliveryHealth(),
          retryAt: [this.#priorityQuoteRetryAt,this.#priorityStateRetryAt].filter(Boolean).sort((a, b) => a - b)[0] ?? null,
          quoteRetryAt: this.#priorityQuoteRetryAt || null,
          stateRetryAt: this.#priorityStateRetryAt || null,
          nextQuoteAt: this.#priorityNextQuoteAt || null,
          inFlight: this.#priorityQuotePromise != null || this.#priorityStatePromises.size > 0,
          quoteInFlight: this.#priorityQuotePromise != null,
          stateInFlight: this.#priorityStatePromises.size > 0,
          stateInFlightCount: this.#priorityStatePromises.size,
        },
        lastError: this.#lastError,
        lastErrorAt: this.#lastErrorAt,
      });
    }
    if (!["/snapshot", "/recovery", "/stream"].includes(url.pathname)) return json({ error: "NOT_FOUND" }, 404);
    const requestOrigin = request.headers.get("origin");
    if (request.method === "OPTIONS" && url.pathname !== "/stream") {
      if (!originAllowed(requestOrigin, this.#config.origins)) return json({ error: "ORIGIN_FORBIDDEN" }, 403);
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": requestOrigin!,
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "authorization",
        "access-control-max-age": "300",
        "vary": "origin",
      } });
    }
    if (!await this.#browserAuthorized(request)) return json({ error: "UNAUTHORIZED" }, 401);
    this.#ensureSupervisor();
    if (url.pathname === "/snapshot") return json(this.#snapshot(), 200, requestOrigin);
    if (url.pathname === "/recovery") return this.#recovery(url, requestOrigin);
    return this.#openBrowserSocket(request, url);
  }

  async alarm() {
    await this.#ready;
    if (this.#retired) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.#tick();
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === "PING") socket.send(JSON.stringify({ type: "PONG", cursor: streamCursor(this.#market) }));
      else socket.send(JSON.stringify({ type: "ERROR", code: "INVALID_CLIENT_MESSAGE" }));
    } catch {
      socket.send(JSON.stringify({ type: "ERROR", code: "INVALID_CLIENT_MESSAGE" }));
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean) {
    try { socket.close(code, reason || (wasClean ? "closed" : "abnormal close")); } catch { /* runtime closed */ }
  }

  webSocketError(socket: WebSocket) {
    try { socket.close(1011, "browser socket error"); } catch { /* runtime closed */ }
  }

  async #tick() {
    if (this.#retired) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    // Schedule the next watchdog before doing fallible work so recovery does not
    // depend on Cloudflare's finite alarm retry budget.
    await this.ctx.storage.setAlarm(Date.now() + WATCHDOG_ALARM_MS);
    this.#ensureSupervisor();
    this.#supervisor?.tick();
    this.#scheduleProviderRecovery();
    await this.#enqueueMutation(async () => {
      const advanced = advanceMarketWatermark(this.#market, Date.now());
      if (advanced.emissions.length) this.#commit(advanced.state, advanced.emissions, null);
      this.#repository.prune(Date.now());
    });
    this.#schedulePriorityProjection();
    this.#scheduleDrain();
  }

  #ensureSupervisor() {
    if (this.#retired || this.#supervisor || this.#suppressSupervisor) return;
    this.#supervisor = new AlpacaStreamSupervisor({
      feed: this.#market.feed,
      symbol: "NVDA",
      keyId: this.env.APCA_API_KEY_ID,
      secretKey: this.env.APCA_API_SECRET_KEY,
      silenceTimeoutMs: 20_000,
      handshakeTimeoutMs: 10_000,
      baseBackoffMs: 1_000,
      maximumBackoffMs: 30_000,
    }, new WorkerWebSocketConnector(), {
      now: Date.now,
      onEvents: (events) => this.#enqueueMutation(async () => {
        this.#applyProviderEvents(events);
      }),
      onConnection: (providerState, nextReconnectAt, detail) => {
        return this.#enqueueMutation(async () => {
          const now = Date.now();
          if (detail && providerState !== "LIVE" && detail !== "market quiet window") this.#recordError(detail);
          const transition = providerState === "CONNECTING"
            ? beginConnectionEpoch(this.#market, now)
            : setProviderConnectionState(this.#market, this.#connectionState(providerState), now, nextReconnectAt);
          if (transition.emissions.length) this.#commit(transition.state, transition.emissions, null);
          if ((providerState === "CONNECTING" || providerState === "LIVE") && this.#market.lastProviderAt != null) {
            this.#repository.beginProviderRecovery(Math.max(0, this.#market.lastProviderAt - PROVIDER_RECOVERY_OVERLAP_MS), now);
            this.#scheduleProviderRecovery();
          }
        });
      },
    });
    this.#supervisor.start();
    void this.#setEarlierAlarm(Date.now() + WATCHDOG_ALARM_MS);
  }

  #applyProviderEvents(events: import("./contracts.ts").ProviderMarketEvent[]) {
    for (const event of events) {
      const existingMinute = event.bar ? this.#repository.latestMinute(event.bar.barKey) : null;
      if (this.#repository.hasEvent(event.eventKey)) {
        if (event.transport === "REST_RECOVERY" && event.bar && existingMinute && identicalAuthoritativeBar(existingMinute, event.bar)) {
          const reconciled = reconcileRecoveredMinuteIntegrity(this.#market, event.bar.minuteStart, event.processedAt);
          if (reconciled.emissions.length) this.#commit(reconciled.state, reconciled.emissions, null);
        }
        continue;
      }
      const affectedTradeId = event.correction?.originalTradeId ?? event.cancel?.providerTradeId ?? null;
      const affectedAt = affectedTradeId ? this.#repository.tradeObservedAt(affectedTradeId) : null;
      const affectedMinuteStart = affectedAt == null ? null : Math.floor(affectedAt / 60_000) * 60_000;
      const result = reduceProviderEvent(this.#market, event, { existingMinute, affectedMinuteStart });
      if (result.disposition !== "ACCEPTED") continue;
      this.#commit(result.state, result.emissions, event);
      if (event.kind === "CORRECTION" || event.kind === "CANCEL") {
        if (affectedMinuteStart == null) {
          const now = Date.now();
          this.#repository.beginFullSessionProviderRecovery(
            alpacaActiveSessionStartAt(event.sourceObservedAt),
            integrityRecoveryThrough(event.sourceObservedAt, now),
          );
        } else {
          this.#repository.beginProviderRecovery(affectedMinuteStart, Date.now());
        }
        this.#scheduleProviderRecovery();
      }
    }
  }

  #scheduleProviderRecovery() {
    this.#reconcileCompletedFullSessionProof(Date.now());
    this.#ensureUnknownIntegrityRecovery(Date.now());
    if (this.#providerRecoveryPromise || !this.#repository.providerRecoveryCheckpoint()) return;
    const integrityReadyAt = (this.#market.barIntegrity.detectedAt ?? 0) + CORRECTION_RECOVERY_SETTLE_MS;
    if (this.#market.barIntegrity.state === "DEGRADED" && Date.now() < integrityReadyAt) return;
    this.#providerRecoveryPromise = (async () => {
      for (let window = 0; window < PROVIDER_RECOVERY_WINDOWS_PER_TICK; window += 1) {
        const checkpoint = this.#repository.providerRecoveryCheckpoint();
        if (!checkpoint) return;
        const segment = await fetchAdaptiveProviderRecoverySegment({
          provider: this.#providerRecovery,
          feed: this.#market.feed,
          startAt: checkpoint.startAt,
          throughAt: checkpoint.throughAt,
          maximumWindowMs: PROVIDER_RECOVERY_WINDOW_MS,
        });
        await this.#enqueueMutation(async () => {
          this.#applyProviderEvents(segment.events);
          if (this.#repository.advanceProviderRecovery(checkpoint.startAt, segment.beforeOrAt)) {
            this.#reconcileCompletedFullSessionProof(Date.now());
          }
        });
      }
    })().catch((error) => this.#recordError(error)).finally(() => { this.#providerRecoveryPromise = null; });
  }

  #ensureUnknownIntegrityRecovery(now: number) {
    if (this.#market.barIntegrity.state !== "DEGRADED" || this.#market.barIntegrity.affectedMinuteStarts.length ||
      this.#repository.fullSessionRecoveryProof()) return;
    const detectedAt = this.#market.barIntegrity.detectedAt ?? now;
    this.#repository.beginFullSessionProviderRecovery(
      alpacaActiveSessionStartAt(detectedAt),
      integrityRecoveryThrough(detectedAt, now),
    );
  }

  #reconcileCompletedFullSessionProof(at: number) {
    const proof = this.#repository.fullSessionRecoveryProof();
    if (!proof?.completed) return;
    if (this.#market.barIntegrity.state === "DEGRADED") {
      const reconciled = reconcileRecoveredSessionIntegrity(this.#market, at);
      if (reconciled.emissions.length) this.#commit(reconciled.state, reconciled.emissions, null);
    }
    this.#repository.clearFullSessionRecoveryProof();
  }

  #connectionState(value: ProviderConnectionState): MarketStreamState["providerState"] {
    return value;
  }

  #enqueueMutation(operation: () => Promise<void>) {
    const run = async () => {
      try { await operation(); } catch (error) { this.#recordError(error); throw error; }
    };
    const current = this.#mutationChain.then(run, run);
    this.#mutationChain = current.catch(() => undefined);
    return current;
  }

  #commit(state: MarketStreamState, emissions: MarketStreamEmission[], event: Parameters<MarketStreamRepository["commit"]>[0]["event"]) {
    this.#repository.commit({ state, emissions, event });
    this.#market = state;
    this.#publish(emissions);
    this.#schedulePriorityProjection();
    this.#scheduleDrain();
  }

  #publish(emissions: MarketStreamEmission[]) {
    const sockets = this.ctx.getWebSockets();
    for (const emission of emissions) {
      const payload = JSON.stringify({ type: "UPDATE", cursor: streamCursor(emission), emission });
      for (const socket of sockets) {
        try {
          if ((socket.bufferedAmount ?? 0) > MAX_SOCKET_BUFFER_BYTES) throw new Error("BACKPRESSURE");
          socket.send(payload);
        } catch {
          try { socket.close(1013, "stream backpressure"); } catch { /* closed */ }
        }
      }
    }
  }

  #scheduleDrain() {
    if (this.#drainPromise) return;
    this.#drainPromise = this.#drainOutbox()
      .catch((error) => this.#recordError(error))
      .finally(() => { this.#drainPromise = null; });
  }

  async #drainOutbox() {
    for (let batchNumber = 0; batchNumber < 4; batchNumber += 1) {
      const now = Date.now();
      const rows = this.#repository.readyOutbox(this.#market.streamId, now);
      if (!rows.length) return;
      const batch: IngestionBatch = {
        schemaVersion: MARKET_STREAM_SCHEMA,
        streamId: this.#market.streamId,
        fromSequence: rows[0].service_sequence,
        toSequence: rows.at(-1)!.service_sequence,
        emissions: rows.map((row) => row.emission),
      };
      try {
        const ack = await this.#ingestion.send(batch, now);
        this.#repository.acknowledge(batch.streamId, ack.highestContiguousSequence, Date.now());
      } catch (error) {
        const first = rows[0];
        const attempts = first.attempts + 1;
        const failedAt = Date.now();
        const errorCode = ingestionDeliveryErrorCode(error);
        this.#repository.recordDeliveryFailure({
          streamId: first.stream_id,
          fromSequence: batch.fromSequence,
          toSequence: batch.toSequence,
          attempts,
          errorCode,
          failedAt,
          nextRetryAt: failedAt + deliveryBackoffMs(attempts),
        });
        throw new Error(errorCode);
      }
    }
    // Four successful pages bound one delivery turn. If a contiguous prefix is
    // still ready, advance the durable alarm instead of waiting for another
    // provider event or the five-second watchdog. Failures return from the
    // catch path above and keep their persisted retry deadline authoritative.
    if (this.#repository.readyOutbox(this.#market.streamId, Date.now(), 1).length) {
      await this.ctx.storage.setAlarm(Date.now() + BACKLOG_DRAIN_ALARM_MS);
    }
  }

  #schedulePriorityProjection() {
    const now = Date.now();
    const projection = this.#repository.priorityProjection();
    if (!projection) return;
    const quote = projection.requestType === "PRIORITY_QUOTE_PROJECTION";
    const sequence = quote ? projection.quote.serviceSequence : projection.state.serviceSequence;
    if (quote ? this.#priorityQuotePromise : this.#priorityStatePromises.has(sequence)) return;
    if (!quote && this.#priorityStateRetrySequence !== sequence) {
      this.#priorityStateRetryAt = 0;
      this.#priorityStateRetrySequence = 0;
    }
    const retryAt = quote ? this.#priorityQuoteRetryAt : this.#priorityStateRetryAt;
    if (now < retryAt) {
      void this.#setEarlierAlarm(retryAt);
      return;
    }
    if (quote && now < this.#priorityNextQuoteAt) {
      void this.#setEarlierAlarm(this.#priorityNextQuoteAt);
      return;
    }
    if (quote) {
      this.#priorityNextQuoteAt = now + PRIORITY_QUOTE_CADENCE_MS;
    }
    const delivery = this.#ingestion.sendPriority(projection, now)
      .then((ack) => {
        this.#repository.acknowledgePriorityProjection(ack.priorityProjectedSequence);
        if (quote) this.#priorityQuoteRetryAt = 0;
        else {
          this.#priorityStateRetryAt = 0;
          this.#priorityStateRetrySequence = 0;
        }
        // The receiver owns one bounded current row. Quote cadence is measured
        // from send start, so a slow ACK releases the queued latest quote
        // immediately. Negative state/epoch controls bypass this cap.
      })
      .catch((error) => {
        const pending = this.#repository.priorityProjection();
        const pendingSequence = pending?.requestType === "PRIORITY_QUOTE_PROJECTION"
          ? pending.quote.serviceSequence
          : pending?.state.serviceSequence;
        if (pending?.requestType !== projection.requestType || pendingSequence !== sequence) return;
        this.#recordError(error);
        const nextRetryAt = Date.now() + PRIORITY_PROJECTION_RETRY_MS;
        if (quote) {
          this.#priorityNextQuoteAt = 0;
          this.#priorityQuoteRetryAt = nextRetryAt;
        } else {
          this.#priorityStateRetryAt = nextRetryAt;
          this.#priorityStateRetrySequence = sequence;
        }
        return this.#setEarlierAlarm(nextRetryAt);
      })
      .finally(() => {
        if (quote) this.#priorityQuotePromise = null;
        else this.#priorityStatePromises.delete(sequence);
        if (this.#repository.priorityProjection()) {
          this.#schedulePriorityProjection();
        }
      });
    if (quote) this.#priorityQuotePromise = delivery;
    else this.#priorityStatePromises.set(sequence, delivery);
  }

  async #setEarlierAlarm(at: number) {
    const storage = this.ctx.storage as typeof this.ctx.storage & { getAlarm?: () => Promise<number | null> };
    const current = typeof storage.getAlarm === "function" ? await storage.getAlarm() : null;
    if (current == null || current > at) await storage.setAlarm(at);
  }

  #snapshot(): PublicMarketSnapshot {
    return { cursor: streamCursor(this.#market), state: structuredClone(this.#market), completedMinutes: this.#repository.listCompletedMinutes() };
  }

  #recovery(url: URL, allowedOrigin: string | null) {
    const streamId = url.searchParams.get("streamId") ?? "";
    const epoch = Number(url.searchParams.get("connectionEpoch"));
    const after = Number(url.searchParams.get("afterSequence"));
    if (streamId !== this.#market.streamId || !Number.isSafeInteger(epoch) || epoch !== this.#market.connectionEpoch || !Number.isSafeInteger(after) || after < 0) {
      return json({ error: "SNAPSHOT_REQUIRED", snapshot: this.#snapshot() }, 409, allowedOrigin);
    }
    if ((after === 0 && epoch !== 0) || (after > 0 && this.#repository.emissionEpoch(streamId, after) !== epoch)) {
      return json({ error: "SNAPSHOT_REQUIRED", snapshot: this.#snapshot() }, 409, allowedOrigin);
    }
    const oldest = this.#repository.oldestEmissionSequence(streamId);
    if (oldest != null && after + 1 < oldest) return json({ error: "HISTORY_EXPIRED", snapshot: this.#snapshot() }, 410, allowedOrigin);
    const page = this.#repository.recoveryPage(streamId, after);
    const emissions = page.emissions;
    if (emissions.length && emissions[0].serviceSequence !== after + 1) return json({ error: "SEQUENCE_GAP", snapshot: this.#snapshot() }, 409, allowedOrigin);
    if (!emissions.length && after !== this.#market.serviceSequence) return json({ error: "SEQUENCE_GAP", snapshot: this.#snapshot() }, 409, allowedOrigin);
    const cursor = { streamId, connectionEpoch: epoch, serviceSequence: page.nextAfterSequence };
    return json({ cursor, headCursor: streamCursor(this.#market), emissions, hasMore: page.hasMore }, 200, allowedOrigin);
  }

  async #openBrowserSocket(request: Request, url: URL) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "WEBSOCKET_UPGRADE_REQUIRED" }, 426);
    const protocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) => value.trim()) ?? [];
    if (!protocols.includes("aperture")) return json({ error: "APERTURE_SUBPROTOCOL_REQUIRED" }, 400);
    if (this.ctx.getWebSockets().length >= this.#config.maximumBrowserClients) return json({ error: "BROWSER_CONNECTION_CAPACITY" }, 503);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: Date.now(), origin: request.headers.get("origin") });
    const streamId = url.searchParams.get("streamId");
    const epoch = Number(url.searchParams.get("connectionEpoch"));
    const after = Number(url.searchParams.get("afterSequence"));
    const cursorEpochMatches = streamId && Number.isSafeInteger(epoch) && Number.isSafeInteger(after) &&
      streamId === this.#market.streamId && epoch === this.#market.connectionEpoch &&
      ((after === 0 && epoch === 0) || (after > 0 && this.#repository.emissionEpoch(streamId, after) === epoch));
    if (cursorEpochMatches) {
      const page = this.#repository.recoveryPage(streamId, after);
      const emissions = page.emissions;
      if (emissions.length && emissions[0].serviceSequence === after + 1 && !page.hasMore) {
        for (const emission of emissions) server.send(JSON.stringify({ type: "UPDATE", cursor: streamCursor(emission), emission }));
      } else if (after !== this.#market.serviceSequence) {
        server.send(JSON.stringify({ type: "RECOVERY_REQUIRED", reason: page.hasMore ? "SEQUENCE_GAP" : "HISTORY_EXPIRED", expected: { streamId, connectionEpoch: epoch, serviceSequence: after + 1 }, received: streamCursor(this.#market) }));
        server.send(JSON.stringify({ type: "SNAPSHOT", cursor: streamCursor(this.#market), snapshot: this.#snapshot() }));
      }
    } else {
      server.send(JSON.stringify({ type: "SNAPSHOT", cursor: streamCursor(this.#market), snapshot: this.#snapshot() }));
    }
    return new Response(null, { status: 101, headers: { "sec-websocket-protocol": "aperture" }, webSocket: client } as ResponseInit & { webSocket: WebSocket });
  }

  async #browserAuthorized(request: Request) {
    const origin = request.headers.get("origin");
    if (!originAllowed(origin, this.#config.origins)) return false;
    const authorization = request.headers.get("authorization");
    const protocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) => value.trim()) ?? [];
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : protocols.find((value) => value !== "aperture");
    if (!token) return false;
    return consumeBrowserAccessToken({ token, secret: this.env.BROWSER_ACCESS_SECRET, audience: "aperture-market-stream-browser", origin: origin!, now: Date.now(), nonces: this.#browserNonces });
  }

  #recordError(error: unknown) {
    this.#lastError = error instanceof Error ? error.message : String(error);
    this.#lastErrorAt = Date.now();
  }
}

const worker = {
  async fetch(request: Request, env: MarketStreamEnv) {
    try {
      const url = new URL(request.url);
      if (!["/snapshot", "/recovery", "/health", "/stream"].includes(url.pathname)) return json({ error: "NOT_FOUND" }, 404);
      return durableStub(env).fetch(request);
    } catch (error) {
      return json({ error: "CONFIGURATION_INVALID", detail: error instanceof Error ? error.message : String(error) }, 503);
    }
  },
  async scheduled(_controller: unknown, env: MarketStreamEnv, ctx: ExecutionContextLike) {
    const work = (async () => {
      const request = new Request("https://market-stream.internal/internal/tick", { headers: { "x-stream-control": env.STREAM_CONTROL_SECRET } });
      const response = await durableStub(env).fetch(request);
      if (!response.ok) throw new Error(`STREAM_TICK_HTTP_${response.status}`);
    })();
    ctx.waitUntil(work);
  },
};

export default worker;
