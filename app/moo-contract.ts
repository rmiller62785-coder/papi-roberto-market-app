export type MooDecision = "LONG_FAVORED" | "SHORT_FAVORED" | "NO_TRADE";
export type MooSide = "LONG" | "SHORT";
export type MooThirdRole = "MAJOR" | "MINOR";
export type MooValueState = "AVAILABLE" | "PENDING" | "UNAVAILABLE" | "INSUFFICIENT_BARS";
export type MooLifecycle =
  | "MARKET_CLOSED"
  | "PREPARING"
  | "READY"
  | "FROZEN"
  | "LATE_LOCKED"
  | "ENTRY_CLOSED"
  | "CROSS_COMPLETE";

export type MooBlockReason =
  | "MARKET_CLOSED"
  | "DATA_PENDING"
  | "STALE_US_QUOTE"
  | "FEED_NOT_ENTITLED"
  | "MODEL_NOT_TRAINED"
  | "LOW_DATA_QUALITY"
  | "LOW_CONFIDENCE"
  | "SHORTABILITY_UNCONFIRMED"
  | "NONE";

export type MooDeadline = {
  label: "DECISION_FREEZE" | "MODIFY_CANCEL" | "FINAL_ENTRY";
  at: number;
  remainingMs: number;
  passed: boolean;
};

export type MooTicket = {
  side: MooSide;
  orderType: "MOO";
  favored: boolean;
  actionable: boolean;
  thirdRole: MooThirdRole;
  assignedDistanceCents: number | null;
  targetMoveCents: number | null;
  estimatedFillCents: number | null;
  estimatedTargetCents: number | null;
  actualFillCents: number | null;
  rebasedTargetCents: number | null;
  stopOffsetCents: number | null;
  quantity: number | null;
  accountLabel: string | null;
  reserveCents: number | null;
  maximumLossCents: number | null;
  timeStop: string | null;
  shortability: "NOT_APPLICABLE" | "UNCONFIRMED" | "AVAILABLE" | "UNAVAILABLE";
};

export type MooSourceHealth = {
  id: "US" | "NVD" | "FX" | "FUTURES" | "NOII";
  label: string;
  venue: string | null;
  provider: string | null;
  entitlement: "REALTIME" | "DELAYED" | "LIMITED" | "NOT_ENTITLED" | "UNAVAILABLE";
  observedAt: number | null;
  checkedAt: number | null;
  ageMs: number | null;
  state: "LIVE" | "DEGRADED" | "DELAYED" | "CLOSED" | "UNAVAILABLE";
};

export type MooDecisionSnapshot = {
  schemaVersion: "moo-phase1-v1";
  snapshotId: string;
  targetSession: string;
  generatedAt: number;
  frozenAt: number | null;
  lifecycle: MooLifecycle;
  decision: MooDecision;
  blockReason: MooBlockReason;
  predictedOfficialOpenCents: number | null;
  predictedOpenState: MooValueState;
  actualOfficialOpenCents: number | null;
  officialOpenSource: string | null;
  predictionErrorCents: number | null;
  confidencePct: number | null;
  dataQualityScore: number | null;
  modelVersion: string | null;
  featureSchemaVersion: string | null;
  actionCutoffAt: number;
  deadlines: MooDeadline[];
  previousRangeCents: number | null;
  premarketRangeCents: number | null;
  previousEffectiveThirdCents: number | null;
  premarketEffectiveThirdCents: number | null;
  majorThirdCents: number | null;
  minorThirdCents: number | null;
  thirdPercentBasisPoints: 3300 | 3333;
  tickSizeCents: 1;
  addOneTick: boolean;
  takeProfitCushionCents: number;
  longTicket: MooTicket;
  shortTicket: MooTicket;
  sources: MooSourceHealth[];
  warnings: string[];
};
