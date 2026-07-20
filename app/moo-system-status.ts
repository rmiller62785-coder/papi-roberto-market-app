import type { AlpacaBrokerStatus } from "./alpaca-broker-status.ts";
import type { MooDecisionSnapshot, MooSourceHealth } from "./moo-contract.ts";
import { buildMooDecisionSnapshot } from "./moo-strategy.ts";

export const MOO_SYSTEM_STATUS_SCHEMA = "moo-system-status-v1" as const;
export const MOO_EXECUTION_POLICY_VERSION = "strict-moo-commissioning-v1" as const;

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
  sourceRoles: Array<{
    id: MooSourceHealth["id"];
    role: "REQUIRED" | "OPTIONAL_RESEARCH" | "POST_FREEZE_MONITORING";
  }>;
  transport: {
    browser: "ADAPTIVE_REST_POLLING";
    persistentUpstreamSupervisor: false;
    noteCode: "DURABLE_STREAM_SERVICE_NOT_CONFIGURED";
  };
  brokerReference: AlpacaBrokerStatus;
};

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
}): MooSystemStatus {
  const sources = commissioningSources();
  const decisionSnapshot = buildMooDecisionSnapshot({
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
    sourceRoles: [
      { id: "US", role: "REQUIRED" },
      { id: "NVD", role: "OPTIONAL_RESEARCH" },
      { id: "FX", role: "OPTIONAL_RESEARCH" },
      { id: "FUTURES", role: "OPTIONAL_RESEARCH" },
      { id: "NOII", role: "POST_FREEZE_MONITORING" },
    ],
    transport: {
      browser: "ADAPTIVE_REST_POLLING",
      persistentUpstreamSupervisor: false,
      noteCode: "DURABLE_STREAM_SERVICE_NOT_CONFIGURED",
    },
    brokerReference: input.brokerReference,
  };
}
