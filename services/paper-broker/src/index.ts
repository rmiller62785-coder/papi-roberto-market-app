import { verifyPaperCommandRequest } from "./auth.ts";
import { AlpacaPaperApiError, AlpacaPaperClient, paperOrderEvent } from "./alpaca-paper.ts";
import {
  AMBIGUOUS_RETRY_DELAY_MS,
  PAPER_BROKER_SCHEMA,
  PAPER_SUBMISSION_LEASE_MS,
  deterministicClientOrderId,
  paperCommandDigest,
  validatePaperBrokerEnv,
  validatePaperMooCommand,
  type PaperBrokerEnv,
} from "./contracts.ts";
import { PaperBrokerRepository, type PaperSqlStorage, type StoredCommand } from "./storage.ts";

type DurableObjectStateLike = {
  storage: PaperSqlStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: {
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  } });
}

function publicCommand(command: StoredCommand) {
  return {
    commandId: command.command_id,
    intentId: command.intent_id,
    clientOrderId: command.client_order_id,
    status: command.status,
    providerOrderId: command.provider_order_id,
    errorCode: command.error_code,
    createdAt: command.created_at,
    updatedAt: command.updated_at,
    retryAfter: command.retry_after,
  };
}

export class PaperBrokerCoordinator {
  readonly #env: PaperBrokerEnv;
  readonly #config: ReturnType<typeof validatePaperBrokerEnv>;
  readonly #repository: PaperBrokerRepository;
  readonly #client: AlpacaPaperClient;
  readonly #now: () => number;
  readonly #ready: Promise<void>;

  constructor(ctx: DurableObjectStateLike, env: PaperBrokerEnv, options: { client?: AlpacaPaperClient; now?: () => number } = {}) {
    this.#env = env;
    this.#config = validatePaperBrokerEnv(env);
    this.#now = options.now ?? Date.now;
    this.#repository = new PaperBrokerRepository(ctx.storage, this.#now);
    this.#client = options.client ?? new AlpacaPaperClient({ keyId: env.APCA_API_KEY_ID, secretKey: env.APCA_API_SECRET_KEY });
    this.#ready = ctx.blockConcurrencyWhile(async () => { this.#repository.initializeSchema(); });
  }

  async fetch(request: Request) {
    await this.#ready;
    const url = new URL(request.url);
    if (!((url.pathname === "/health" && request.method === "GET") || (url.pathname === "/commands" && request.method === "POST"))) {
      return json({ error: "NOT_FOUND" }, 404);
    }
    const verified = await verifyPaperCommandRequest({
      request,
      secret: this.#env.PAPER_COMMAND_SECRET,
      audience: this.#config.audience,
      nonces: this.#repository,
      now: this.#now(),
    });
    if (!verified.ok) return json({ error: `PAPER_COMMAND_AUTH_${verified.reason}` }, verified.reason === "REPLAY" ? 409 : 401);
    if (url.pathname === "/health") {
      const local = this.#repository.health();
      const providerReference = typeof (this.#client as unknown as { getPaperHealthReference?: unknown }).getPaperHealthReference === "function"
        ? await this.#client.getPaperHealthReference(this.#now())
        : {
            provider: "Alpaca Paper Trading API" as const,
            environment: "paper" as const,
            checkedAt: this.#now(),
            state: "DEGRADED" as const,
            account: null,
            nvdaPosition: null,
            openNvdaMooOrders: null,
            errors: ["ALPACA_PAPER_HEALTH_CLIENT_UNAVAILABLE"],
            identifiersRedacted: true as const,
            liveTradingHostUsed: false as const,
          };
      return json({
        schemaVersion: PAPER_BROKER_SCHEMA,
        environment: "paper",
        symbol: "NVDA",
        submissionEnabled: this.#config.submissionEnabled,
        shortsEnabled: this.#config.shortsEnabled,
        maximumShares: this.#config.maximumShares,
        automaticSubmission: false,
        tradeUpdates: "NOT_CONNECTED",
        providerReference,
        reconciliation: {
          mode: "REST_BY_CLIENT_ORDER_ID_BEFORE_RETRY",
          automaticSubmission: false,
          ambiguousCommands: local.commands.ambiguous,
          submittedCommands: local.commands.submitted,
          openNvdaMooOrders: providerReference.openNvdaMooOrders?.count ?? null,
        },
        ...local,
      });
    }
    return this.#handleCommand(verified.body);
  }

  async #handleCommand(body: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(body); }
    catch { return json({ error: "COMMAND_JSON_INVALID" }, 400); }
    const validation = validatePaperMooCommand(parsed, this.#config, this.#now());
    if (!validation.valid) return json({ error: "COMMAND_INVALID", reasons: validation.errors }, 422);
    if (!this.#config.submissionEnabled) return json({
      error: "PAPER_ORDER_SUBMISSION_DISABLED",
      environment: "paper",
      automaticSubmission: false,
    }, 423);

    const command = validation.command;
    const [requestHash, clientOrderId] = await Promise.all([paperCommandDigest(command), deterministicClientOrderId(command)]);
    const begun = this.#repository.beginCommand({
      idempotencyKey: command.idempotencyKey,
      commandId: command.commandId,
      intentId: command.intentId,
      requestHash,
      clientOrderId,
      at: this.#now(),
    });
    if (begun.state === "CONFLICT") return json({ error: "IDEMPOTENCY_CONFLICT", command: publicCommand(begun.command) }, 409);
    if (begun.command.status === "SUBMITTED" || begun.command.status === "REJECTED") {
      return json({ ok: begun.command.status === "SUBMITTED", idempotent: true, command: publicCommand(begun.command) },
        begun.command.status === "SUBMITTED" ? 200 : 422);
    }
    if (begun.command.status === "AMBIGUOUS" && begun.command.retry_after != null && this.#now() < begun.command.retry_after) {
      return json({ ok: false, ambiguous: true, command: publicCommand(begun.command) }, 202);
    }
    const claimedAt = this.#now();
    const claimed = this.#repository.claimCommand(command.idempotencyKey, claimedAt, claimedAt + PAPER_SUBMISSION_LEASE_MS);
    if (!claimed.claimed) {
      return json({ ok: false, ambiguous: claimed.command.status === "AMBIGUOUS", idempotent: true,
        command: publicCommand(claimed.command) }, claimed.command.status === "SUBMITTED" ? 200 : 202);
    }

    try {
      const reconciled = await this.#client.getByClientOrderId(clientOrderId, command);
      if (reconciled) return this.#acceptOrder(command.idempotencyKey, reconciled, "REST_RECONCILIATION");
      const submitted = await this.#client.submitMoo(command, clientOrderId);
      return this.#acceptOrder(command.idempotencyKey, submitted, "REST_SUBMISSION");
    } catch (error) {
      const failure = error instanceof AlpacaPaperApiError
        ? error
        : new AlpacaPaperApiError("ALPACA_PAPER_REQUEST_AMBIGUOUS", null, true, error);
      if (failure.retryable) {
        const updated = this.#repository.updateCommand(command.idempotencyKey, {
          status: "AMBIGUOUS",
          errorCode: failure.message,
          retryAfter: this.#now() + AMBIGUOUS_RETRY_DELAY_MS,
          at: this.#now(),
        });
        return json({ ok: false, ambiguous: true, command: publicCommand(updated) }, 202);
      }
      const updated = this.#repository.updateCommand(command.idempotencyKey, {
        status: "REJECTED", errorCode: failure.message, at: this.#now(),
      });
      return json({ ok: false, command: publicCommand(updated) }, 422);
    }
  }

  async #acceptOrder(idempotencyKey: string, order: Awaited<ReturnType<AlpacaPaperClient["submitMoo"]>>, source: "REST_RECONCILIATION" | "REST_SUBMISSION") {
    const receivedAt = this.#now();
    const event = await paperOrderEvent(order, receivedAt, source);
    this.#repository.appendOrderEvent({ ...event, processedAt: this.#now() });
    const updated = this.#repository.updateCommand(idempotencyKey, {
      status: "SUBMITTED",
      providerOrderId: order.id,
      responseJson: JSON.stringify(order),
      at: this.#now(),
    });
    return json({ ok: true, idempotent: source === "REST_RECONCILIATION", command: publicCommand(updated) }, 200);
  }
}

function brokerStub(env: PaperBrokerEnv) {
  return env.PAPER_BROKER.get(env.PAPER_BROKER.idFromName("alpaca-paper-account"));
}

const worker = {
  async fetch(request: Request, env: PaperBrokerEnv) {
    try {
      validatePaperBrokerEnv(env);
      const url = new URL(request.url);
      if (!(["/health", "/commands"].includes(url.pathname))) return json({ error: "NOT_FOUND" }, 404);
      return brokerStub(env).fetch(request);
    } catch {
      return json({ error: "PAPER_BROKER_CONFIGURATION_INVALID" }, 503);
    }
  },
};

export default worker;
