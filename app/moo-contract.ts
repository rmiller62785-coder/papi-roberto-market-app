export type MooDecision = "LONG_FAVORED" | "SHORT_FAVORED" | "NO_TRADE";
export type MooSide = "LONG" | "SHORT";
export type MooThirdRole = "MAJOR" | "MINOR" | "UNASSIGNED";
/** Maximum tolerated provider/receiver clock lead before an observation fails closed. */
export const MOO_PROVIDER_RECEIVE_CLOCK_SKEW_MS = 1_000;
export type MooFeedCoverage =
  | "CONSOLIDATED_SIP"
  | "IEX_SINGLE_EXCHANGE"
  | "DIRECT_VENUE"
  | "INSTITUTIONAL_FX"
  | "CME_ENTITLED"
  | "NASDAQ_NOII"
  | "UNKNOWN";
export const MOO_SOURCE_IDS = ["US", "NVD", "FX", "FUTURES", "NOII"] as const;
export type MooSourceId = typeof MOO_SOURCE_IDS[number];

export function isMooSourceId(value: unknown): value is MooSourceId {
  return typeof value === "string" && (MOO_SOURCE_IDS as readonly string[]).includes(value);
}

/** Strict execution may add research inputs, but consolidated U.S. data is never replaceable. */
export function validateMooRequiredSourceIds(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(value) || value.length === 0) return { valid: false, errors: ["REQUIRED_SOURCE_POLICY_EMPTY"] };
  if (value.some((id) => !isMooSourceId(id))) errors.push("REQUIRED_SOURCE_ID_INVALID");
  if (new Set(value).size !== value.length) errors.push("REQUIRED_SOURCE_POLICY_DUPLICATE");
  if (!value.includes("US")) errors.push("REQUIRED_US_SOURCE_MISSING");
  return { valid: errors.length === 0, errors };
}
/**
 * Values remain nullable because a future observation cannot be manufactured.
 * The expanded state makes that absence informative without weakening gates.
 * Existing states are retained for API compatibility.
 */
export type MooValueState =
  | "AVAILABLE"
  | "FROZEN"
  | "PENDING"
  | "NOT_STARTED"
  | "MARKET_CLOSED"
  | "STALE"
  | "NOT_ENTITLED"
  | "NOT_CONFIGURED"
  | "NOT_PROMOTED"
  | "NO_EDGE"
  | "MISSED_CHECKPOINT"
  | "INVALID"
  | "UNAVAILABLE"
  | "INSUFFICIENT_BARS";
export type MooDecisionReasonCode = "DIRECTIONAL_EDGE" | "NO_EDGE" | "GATE_BLOCKED";
export type MooValueReasonCode =
  | "VALUE_PRESENT"
  | "AWAITING_SESSION_START"
  | "AWAITING_MARKET_DATA"
  | "MARKET_IS_CLOSED"
  | "SOURCE_STALE"
  | "SOURCE_NOT_ENTITLED"
  | "USER_CONFIGURATION_REQUIRED"
  | "MODEL_PROMOTION_REQUIRED"
  | "MODEL_FOUND_NO_EDGE"
  | "CHECKPOINT_NOT_CAPTURED"
  | "VALIDATION_FAILED"
  | "SOURCE_UNAVAILABLE"
  | "INSUFFICIENT_COMPLETED_BARS";

export type MooTimestampProvenance = {
  /** Provider/source event time. */
  sourceAt: number | null;
  /** Time the application first received the value. */
  receivedAt: number | null;
  /** Time normalization/feature processing completed. */
  processedAt: number | null;
  /** Earliest time the value was legally and technically usable. */
  availableAt: number | null;
  /** API health check time; this is not a new market observation. */
  checkedAt: number | null;
  validUntil: number | null;
};

export type MooValueProvenance = {
  sourceId?: MooSourceHealth["id"] | null;
  provider: string | null;
  venue: string | null;
  entitlement: MooSourceHealth["entitlement"] | null;
  coverage?: MooFeedCoverage | null;
  sessionDate?: string | null;
  timestamps: MooTimestampProvenance;
};

export type MooTypedValue<T> = {
  value: T | null;
  state: MooValueState;
  reasonCode: MooValueReasonCode;
  /** Diagnostic only. A last-good value never satisfies a strict gate. */
  lastGoodValue?: T | null;
  provenance: MooValueProvenance;
};
export type MooLifecycle =
  | "MARKET_CLOSED"
  | "FUTURE_SESSION"
  | "PREPARING"
  | "READY"
  | "FROZEN"
  | "LATE_LOCKED"
  | "ENTRY_CLOSED"
  | "CROSS_COMPLETE";

export type MooBlockReason =
  | "MARKET_CLOSED"
  | "ENTRY_WINDOW_CLOSED"
  | "TARGET_SESSION_NOT_STARTED"
  | "DATA_PENDING"
  | "STALE_US_QUOTE"
  | "FEED_NOT_ENTITLED"
  | "MODEL_NOT_TRAINED"
  | "LOW_DATA_QUALITY"
  | "LOW_CONFIDENCE"
  | "NO_EDGE"
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

export type MooLocateProof = {
  schemaVersion: "moo-locate-proof-v1";
  broker: string;
  accountAlias: string;
  symbol: "NVDA";
  /** Explicit anti-replay binding in addition to the validity timestamps. */
  targetSession?: string;
  quantity: number;
  locateId: string;
  availableAt: number;
  validUntil: number;
  guaranteed: true;
  contentHash: string;
};

export type MooSourceHealth = {
  id: "US" | "NVD" | "FX" | "FUTURES" | "NOII";
  label: string;
  venue: string | null;
  provider: string | null;
  entitlement: "REALTIME" | "DELAYED" | "LIMITED" | "NOT_ENTITLED" | "UNAVAILABLE";
  coverage?: MooFeedCoverage;
  observedAt: number | null;
  checkedAt: number | null;
  ageMs: number | null;
  state: "LIVE" | "DEGRADED" | "DELAYED" | "CLOSED" | "UNAVAILABLE";
  /** Optional expanded point-in-time provenance for strict feature capture. */
  receivedAt?: number | null;
  processedAt?: number | null;
  availableAt?: number | null;
  validUntil?: number | null;
  reasonCode?: MooValueReasonCode;
};

export type MooDecisionSnapshot = {
  schemaVersion: "moo-phase1-v1";
  snapshotId: string;
  targetSession: string;
  generatedAt: number;
  frozenAt: number | null;
  lifecycle: MooLifecycle;
  decision: MooDecision;
  decisionReasonCode?: MooDecisionReasonCode;
  blockReason: MooBlockReason;
  predictedOfficialOpenCents: number | null;
  predictedOpenState: MooValueState;
  actualOfficialOpenCents: number | null;
  officialOpenSource: string | null;
  predictionErrorCents: number | null;
  confidencePct: number | null;
  confidenceState?: MooValueState;
  dataQualityScore: number | null;
  dataQualityState?: MooValueState;
  modelVersion: string | null;
  featureSnapshotId: string | null;
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
  shortLocateProof?: MooLocateProof | null;
  sources: MooSourceHealth[];
  /** Source identifiers that gate strict execution. Optional research and
   * post-freeze monitoring sources are intentionally excluded. */
  requiredSourceIds: MooSourceHealth["id"][];
  warnings: string[];
};

function canonicalJson(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical JSON rejects non-finite numbers");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("canonical JSON rejects cycles");
    seen.add(value);
    const encoded = `[${value.map((item) => canonicalJson(item, seen)).join(",")}]`;
    seen.delete(value);
    return encoded;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError("canonical JSON rejects cycles");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const encoded = `{${Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError("canonical JSON rejects undefined values");
      return `${JSON.stringify(key)}:${canonicalJson(record[key], seen)}`;
    }).join(",")}}`;
    seen.delete(value);
    return encoded;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

/** RFC-8785-style deterministic key ordering for the contract's JSON values. */
export function canonicalMooJson(value: unknown) {
  return canonicalJson(value, new Set());
}

function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

/** Runtime-neutral SHA-256 used by Workers, browser tests, and Node alike. */
export function mooSha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  view.setUint32(paddedLength - 8, high, false);
  view.setUint32(paddedLength - 4, low, false);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rightRotate(a, 7) ^ rightRotate(a, 18) ^ (a >>> 3);
      const s1 = rightRotate(b, 17) ^ rightRotate(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((part) => part.toString(16).padStart(8, "0")).join("");
}

export function mooCanonicalDigest(value: Record<string, unknown>, omittedTopLevelKeys: string[] = ["contentHash"]) {
  const omitted = new Set(omittedTopLevelKeys);
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
  return `sha256:${mooSha256Hex(canonicalMooJson(payload))}`;
}

export type MooDeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: MooDeepReadonly<T[K]> }
    : T;

export function deepFreezeMoo<T>(value: T): MooDeepReadonly<T> {
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    for (const child of Object.values(candidate)) freeze(child);
    Object.freeze(candidate);
  };
  freeze(value);
  return value as MooDeepReadonly<T>;
}

export type MooLocateProofValidationContext = {
  accountAlias: string;
  targetSession: string;
  quantity: number;
  availableBy: number;
  validThrough: number;
};

export type MooLocateProofValidation = { valid: boolean; errors: string[] };

function locateTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function locateNonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function locateSession(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Validate immutable, account- and quantity-specific broker locate evidence. */
export function validateMooLocateProof(
  proof: MooLocateProof | null | undefined,
  context?: MooLocateProofValidationContext,
): MooLocateProofValidation {
  const errors: string[] = [];
  if (!proof || typeof proof !== "object") return { valid: false, errors: ["LOCATE_PROOF_MISSING"] };
  if (proof.schemaVersion !== "moo-locate-proof-v1") errors.push("LOCATE_SCHEMA_INVALID");
  if (!locateNonempty(proof.broker)) errors.push("LOCATE_BROKER_MISSING");
  if (!locateNonempty(proof.accountAlias)) errors.push("LOCATE_ACCOUNT_MISSING");
  if (proof.symbol !== "NVDA") errors.push("LOCATE_SYMBOL_INVALID");
  if (!locateSession(proof.targetSession)) errors.push("LOCATE_TARGET_SESSION_INVALID");
  if (!Number.isSafeInteger(proof.quantity) || proof.quantity <= 0) errors.push("LOCATE_QUANTITY_INVALID");
  if (!locateNonempty(proof.locateId)) errors.push("LOCATE_ID_MISSING");
  if (!locateTimestamp(proof.availableAt)) errors.push("LOCATE_AVAILABLE_AT_INVALID");
  if (!locateTimestamp(proof.validUntil) || proof.validUntil < proof.availableAt) errors.push("LOCATE_VALID_UNTIL_INVALID");
  if (proof.guaranteed !== true) errors.push("LOCATE_NOT_GUARANTEED");
  if (context) {
    if (proof.accountAlias.trim().toLowerCase() !== context.accountAlias.trim().toLowerCase()) {
      errors.push("LOCATE_ACCOUNT_MISMATCH");
    }
    if (!Number.isSafeInteger(context.quantity) || context.quantity <= 0) {
      errors.push("LOCATE_CONTEXT_QUANTITY_INVALID");
    } else if (proof.quantity < context.quantity) {
      errors.push("LOCATE_QUANTITY_INSUFFICIENT");
    }
    if (!locateSession(context.targetSession)) errors.push("LOCATE_CONTEXT_TARGET_SESSION_INVALID");
    else if (proof.targetSession !== context.targetSession) errors.push("LOCATE_TARGET_SESSION_MISMATCH");
    if (!locateTimestamp(context.availableBy)) errors.push("LOCATE_CONTEXT_AVAILABLE_BY_INVALID");
    else if (proof.availableAt > context.availableBy) errors.push("LOCATE_AVAILABLE_TOO_LATE");
    if (!locateTimestamp(context.validThrough)) errors.push("LOCATE_CONTEXT_VALID_THROUGH_INVALID");
    else if (proof.validUntil < context.validThrough) errors.push("LOCATE_EXPIRES_TOO_EARLY");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(proof.contentHash)) errors.push("LOCATE_CONTENT_HASH_INVALID");
  else {
    try {
      if (mooCanonicalDigest(proof as unknown as Record<string, unknown>) !== proof.contentHash) errors.push("LOCATE_CONTENT_HASH_MISMATCH");
    } catch { errors.push("LOCATE_CONTENT_HASH_UNSERIALIZABLE"); }
  }
  return { valid: errors.length === 0, errors };
}

/** Construct a canonical locate proof; callers cannot supply their own digest. */
export function sealMooLocateProof(
  proof: Omit<MooLocateProof, "contentHash">,
): MooDeepReadonly<MooLocateProof> {
  const value: MooLocateProof = {
    ...proof,
    contentHash: mooCanonicalDigest(proof as unknown as Record<string, unknown>, []),
  };
  const validation = validateMooLocateProof(value);
  if (!validation.valid) throw new TypeError(`Invalid MOO locate proof: ${validation.errors.join(", ")}`);
  return deepFreezeMoo(value);
}
