import type { AlpacaBrokerStatus } from "./alpaca-broker-status.ts";
import type { MooDecisionSnapshot, MooSourceHealth } from "./moo-contract.ts";
import { buildMooDecisionSnapshot } from "./moo-strategy.ts";

export const MOO_SYSTEM_STATUS_SCHEMA = "moo-system-status-v1" as const;
export const MOO_EXECUTION_POLICY_VERSION = "strict-moo-commissioning-v1" as const;
export const MOO_STREAM_HEARTBEAT_MAX_AGE_MS = 45_000;
export const MOO_STREAM_SOURCE_LAG_MAX_MS = 45_000;

export type MooStreamHealthEvidence = {
  state: "LIVE" | "STALE" | "UNAVAILABLE";
  streamId: string | null;
  provider: string | null;
  feed: "iex" | "sip" | null;
  coverageScope: "SINGLE_EXCHANGE" | "CONSOLIDATED_SIP" | null;
  heartbeatAt: number | null;
  sourceAvailableAt: number | null;
  heartbeatAgeMs: number | null;
  sourceLagMs: number | null;
  maxHeartbeatAgeMs: number;
  maxSourceLagMs: number;
  detailCode: string;
};

export type MooSystemBlockerCode =
  | "CONSOLIDATED_US_FEED_NOT_ENTITLED"
  | "TRAINED_MODEL_NOT_PROMOTED"
  | "IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE"
  | "ACCOUNT_LOCATE_NOT_AVAILABLE";

export type MooSystemStatus = {
  schemaVersion: typeof MOO_SYSTEM_STATUS_SCHEMA;
  policyVersion: typeof MOO_EXECUTION_POLICY_VERSION;
  evaluatedAt: number;
  validUntil: number;
  targetSession: string;
  executionMode: "NOT_COMMISSIONED";
  decisionAuthority: "SERVER";
  decisionSnapshot: MooDecisionSnapshot;
  blockers: MooSystemBlockerCode[];
  commissioningEvidence: {
    modelPromoted: boolean;
    artifactValidated: boolean;
    riskPolicyVersion: string | null;
  };
  sourceRoles: Array<{
    id: MooSourceHealth["id"];
    role: "REQUIRED" | "OPTIONAL_RESEARCH" | "POST_FREEZE_MONITORING";
  }>;
  transport: {
    browser: "ADAPTIVE_REST_POLLING";
    persistentUpstreamSupervisor: boolean;
    noteCode: "DURABLE_STREAM_SERVICE_NOT_CONFIGURED" | "DURABLE_STREAM_SERVICE_STALE" | "DURABLE_STREAM_SERVICE_ENABLED";
    stream: MooStreamHealthEvidence;
  };
  brokerReference: AlpacaBrokerStatus;
};

function unavailableStream(detailCode: string): MooStreamHealthEvidence {
  return {
    state: "UNAVAILABLE",
    streamId: null,
    provider: null,
    feed: null,
    coverageScope: null,
    heartbeatAt: null,
    sourceAvailableAt: null,
    heartbeatAgeMs: null,
    sourceLagMs: null,
    maxHeartbeatAgeMs: MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
    maxSourceLagMs: MOO_STREAM_SOURCE_LAG_MAX_MS,
    detailCode,
  };
}

function safeNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Read-only transport proof from the receiver's append-only D1 ledger. A
 * checked-in worker or configured secret is not proof that a stream is alive;
 * only a fresh contiguous receiver cursor and its matching source-state event
 * can enable the transport indicator.
 */
export async function readMooStreamHealth(
  database: D1Database | undefined,
  nowMs = Date.now(),
): Promise<MooStreamHealthEvidence> {
  if (!database) return unavailableStream("D1_NOT_BOUND");
  try {
    const stream = await database.prepare(`SELECT
      stream.stream_id AS stream_id,stream.provider AS provider,stream.feed AS feed,
      stream.coverage_scope AS coverage_scope,stream.research_only_required AS research_only_required,
      stream.execution_eligible_allowed AS execution_eligible_allowed,
      cursor.highest_contiguous_sequence AS service_sequence,cursor.updated_at AS heartbeat_at
      FROM market_stream_ingest_streams AS stream
      JOIN market_stream_ingest_cursors AS cursor ON cursor.stream_id=stream.stream_id
      WHERE stream.symbol='NVDA'
      ORDER BY cursor.updated_at DESC LIMIT 1`).first<Record<string, unknown>>();
    if (!stream) return unavailableStream("STREAM_NOT_REGISTERED");
    const feed = stream.feed === "iex" || stream.feed === "sip" ? stream.feed : null;
    const coverageScope = stream.coverage_scope === "SINGLE_EXCHANGE" || stream.coverage_scope === "CONSOLIDATED_SIP"
      ? stream.coverage_scope
      : null;
    const bindingValid = typeof stream.stream_id === "string" && stream.stream_id.length > 0 &&
      typeof stream.provider === "string" && stream.provider.length > 0 && feed != null && coverageScope != null &&
      safeNonnegativeInteger(stream.service_sequence) && stream.service_sequence > 0 &&
      safeNonnegativeInteger(stream.heartbeat_at) &&
      (feed === "iex"
        ? coverageScope === "SINGLE_EXCHANGE" && stream.research_only_required === 1 && stream.execution_eligible_allowed === 0
        : coverageScope === "CONSOLIDATED_SIP" && stream.research_only_required === 0 && stream.execution_eligible_allowed === 1);
    if (!bindingValid) return unavailableStream("STREAM_BINDING_INVALID");

    const source = await database.prepare(`SELECT state,checked_at,available_at,service_sequence,detail_code
      FROM market_source_state_events
      WHERE provider=? AND feed=? AND symbol='NVDA' AND connection_epoch LIKE ?
      ORDER BY service_sequence DESC,checked_at DESC LIMIT 1`)
      .bind(stream.provider, feed, `${stream.stream_id}:%`).first<Record<string, unknown>>();
    if (!source || source.service_sequence !== stream.service_sequence ||
      !safeNonnegativeInteger(source.checked_at) || !safeNonnegativeInteger(source.available_at) ||
      source.available_at > source.checked_at || source.checked_at > stream.heartbeat_at ||
      stream.heartbeat_at > nowMs) {
      return {
        ...unavailableStream("STREAM_SOURCE_STATE_INVALID"),
        state: "STALE",
        streamId: stream.stream_id,
        provider: stream.provider,
        feed,
        coverageScope,
        heartbeatAt: stream.heartbeat_at,
        heartbeatAgeMs: Math.max(0, nowMs - stream.heartbeat_at),
      };
    }

    const heartbeatAgeMs = Math.max(0, nowMs - stream.heartbeat_at);
    const sourceLagMs = Math.max(0, nowMs - source.available_at);
    const live = source.state === "CURRENT" && heartbeatAgeMs <= MOO_STREAM_HEARTBEAT_MAX_AGE_MS &&
      sourceLagMs <= MOO_STREAM_SOURCE_LAG_MAX_MS;
    return {
      state: live ? "LIVE" : "STALE",
      streamId: stream.stream_id,
      provider: stream.provider,
      feed,
      coverageScope,
      heartbeatAt: stream.heartbeat_at,
      sourceAvailableAt: source.available_at,
      heartbeatAgeMs,
      sourceLagMs,
      maxHeartbeatAgeMs: MOO_STREAM_HEARTBEAT_MAX_AGE_MS,
      maxSourceLagMs: MOO_STREAM_SOURCE_LAG_MAX_MS,
      detailCode: live ? String(source.detail_code ?? "STREAM_CURRENT") : "STREAM_EVIDENCE_STALE",
    };
  } catch {
    return unavailableStream("D1_STREAM_HEALTH_UNAVAILABLE");
  }
}

function commissioningSources(): MooSourceHealth[] {
  return [
    {
      id: "US",
      label: "U.S. NVDA execution quote",
      venue: "Consolidated SIP required",
      provider: null,
      entitlement: "NOT_ENTITLED",
      observedAt: null,
      checkedAt: null,
      ageMs: null,
      state: "UNAVAILABLE",
    },
    {
      id: "NVD",
      label: "German NVD optional model input",
      venue: "Entitled direct venue feed not configured",
      provider: null,
      entitlement: "NOT_ENTITLED",
      observedAt: null,
      checkedAt: null,
      ageMs: null,
      state: "UNAVAILABLE",
    },
    {
      id: "FX",
      label: "EUR/USD optional model input",
      venue: "Institutional spot feed not configured",
      provider: null,
      entitlement: "NOT_ENTITLED",
      observedAt: null,
      checkedAt: null,
      ageMs: null,
      state: "UNAVAILABLE",
    },
    {
      id: "FUTURES",
      label: "NQ futures optional model input",
      venue: "CME entitlement not configured",
      provider: null,
      entitlement: "NOT_ENTITLED",
      observedAt: null,
      checkedAt: null,
      ageMs: null,
      state: "UNAVAILABLE",
    },
    {
      id: "NOII",
      label: "Nasdaq NOII post-freeze monitoring",
      venue: "Nasdaq Opening Cross entitlement not configured",
      provider: null,
      entitlement: "NOT_ENTITLED",
      observedAt: null,
      checkedAt: null,
      ageMs: null,
      state: "UNAVAILABLE",
    },
  ];
}

/**
 * Build the server-owned commissioning status for Strict MOO. This function
 * deliberately cannot promote research-only IEX/Finnhub observations into an
 * execution quote, cannot manufacture a model prediction, and cannot turn
 * indicative broker asset metadata into a locate guarantee.
 */
export function buildMooSystemStatus(input: {
  nowMs: number;
  targetSession: string;
  brokerReference: AlpacaBrokerStatus;
  streamHealth?: MooStreamHealthEvidence;
}): MooSystemStatus {
  const sources = commissioningSources();
  const builtSnapshot = buildMooDecisionSnapshot({
    nowMs: input.nowMs,
    targetSession: input.targetSession,
    snapshotId: `moo-evaluation-${input.targetSession}-${input.nowMs}`,
    prediction: {
      targetSession: input.targetSession,
      featureSnapshotId: null,
      predictedOfficialOpenCents: null,
      decision: "NO_TRADE",
      confidencePct: null,
      generatedAt: input.nowMs,
      trained: false,
      modelVersion: null,
      featureSchemaVersion: null,
    },
    dataQualityScore: null,
    sources,
    requiredSourceIds: ["US"],
    shortability: "UNCONFIRMED",
  });
  // An uncommissioned post-freeze evaluation has no executable frozen context,
  // but its explicitly unavailable source topology remains useful diagnostics.
  const decisionSnapshot = { ...builtSnapshot, sources, requiredSourceIds: ["US"] as const };
  const streamHealth = input.streamHealth ?? unavailableStream("D1_NOT_BOUND");
  const persistentUpstreamSupervisor = streamHealth.state === "LIVE";

  return {
    schemaVersion: MOO_SYSTEM_STATUS_SCHEMA,
    policyVersion: MOO_EXECUTION_POLICY_VERSION,
    evaluatedAt: input.nowMs,
    validUntil: input.nowMs + 45_000,
    targetSession: input.targetSession,
    executionMode: "NOT_COMMISSIONED",
    decisionAuthority: "SERVER",
    decisionSnapshot,
    blockers: [
      "CONSOLIDATED_US_FEED_NOT_ENTITLED",
      "TRAINED_MODEL_NOT_PROMOTED",
      "IMMUTABLE_DECISION_FREEZE_NOT_AVAILABLE",
      "ACCOUNT_LOCATE_NOT_AVAILABLE",
    ],
    commissioningEvidence: {
      modelPromoted: false,
      artifactValidated: false,
      riskPolicyVersion: null,
    },
    sourceRoles: [
      { id: "US", role: "REQUIRED" },
      { id: "NVD", role: "OPTIONAL_RESEARCH" },
      { id: "FX", role: "OPTIONAL_RESEARCH" },
      { id: "FUTURES", role: "OPTIONAL_RESEARCH" },
      { id: "NOII", role: "POST_FREEZE_MONITORING" },
    ],
    transport: {
      browser: "ADAPTIVE_REST_POLLING",
      persistentUpstreamSupervisor,
      noteCode: persistentUpstreamSupervisor
        ? "DURABLE_STREAM_SERVICE_ENABLED"
        : streamHealth.state === "STALE"
          ? "DURABLE_STREAM_SERVICE_STALE"
          : "DURABLE_STREAM_SERVICE_NOT_CONFIGURED",
      stream: streamHealth,
    },
    brokerReference: input.brokerReference,
  };
}
