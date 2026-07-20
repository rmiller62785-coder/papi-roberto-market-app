import type {
  MarketStreamEmission,
  MarketStreamState,
  ProviderMarketEvent,
  StreamCursor,
} from "./contracts.ts";
import { reduceProviderEvent, type MarketReducerPolicy } from "./reducer.ts";

// Alpaca updated minute bars can arrive after the next minute. Keep a wide,
// bounded overlap so a newer trade watermark cannot permanently skip them.
export const PROVIDER_RECOVERY_OVERLAP_MS = 15 * 60_000;
export const PROVIDER_RECOVERY_WINDOW_MS = 15 * 60_000;

export class ProviderRecoveryPageLimitError extends Error {
  readonly code = "PROVIDER_RECOVERY_PAGE_LIMIT";
  readonly channel: string;
  constructor(channel: string) {
    super(`Provider recovery pagination limit reached for ${channel}`);
    this.name = "ProviderRecoveryPageLimitError";
    this.channel = channel;
  }
}

export class ProviderRecoverySegmentSaturatedError extends Error {
  readonly code = "PROVIDER_RECOVERY_SEGMENT_SATURATED";
  readonly retriable = true;
  readonly startAt: number;
  readonly beforeOrAt: number;
  constructor(startAt: number, beforeOrAt: number, cause?: unknown) {
    super(`PROVIDER_RECOVERY_SEGMENT_SATURATED_RETRIABLE start=${startAt} end=${beforeOrAt}`, { cause });
    this.name = "ProviderRecoverySegmentSaturatedError";
    this.startAt = startAt;
    this.beforeOrAt = beforeOrAt;
  }
}

function pageLimited(error: unknown) {
  return error instanceof ProviderRecoveryPageLimitError ||
    (error instanceof Error && (error as Error & { code?: string }).code === "PROVIDER_RECOVERY_PAGE_LIMIT");
}

/**
 * Fetch the largest bounded prefix the provider can fully paginate. A dense
 * segment is bisected until it succeeds; the durable caller advances only to
 * the returned inclusive boundary. A saturated single millisecond is explicit
 * and retriable rather than silently skipped.
 */
export async function fetchAdaptiveProviderRecoverySegment(input: {
  provider: ProviderRestRecovery;
  feed: MarketStreamState["feed"];
  startAt: number;
  throughAt: number;
  maximumWindowMs?: number;
}) {
  if (!Number.isSafeInteger(input.startAt) || !Number.isSafeInteger(input.throughAt) ||
    input.startAt < 0 || input.throughAt < input.startAt) throw new TypeError("RECOVERY_SEGMENT_INVALID");
  const maximumWindowMs = Math.max(1, Math.trunc(input.maximumWindowMs ?? PROVIDER_RECOVERY_WINDOW_MS));
  let windowMs = Math.min(maximumWindowMs, input.throughAt - input.startAt + 1);
  while (true) {
    const beforeOrAt = input.startAt + windowMs - 1;
    try {
      const events = await input.provider.fetchEvents({
        symbol: "NVDA",
        feed: input.feed,
        atOrAfterProviderAt: input.startAt,
        beforeOrAt,
      });
      return { events, beforeOrAt, windowMs };
    } catch (error) {
      if (!pageLimited(error)) throw error;
      if (windowMs === 1) throw new ProviderRecoverySegmentSaturatedError(input.startAt, beforeOrAt, error);
      windowMs = Math.max(1, Math.floor(windowMs / 2));
    }
  }
}

export function streamCursor(state: Pick<MarketStreamState, "streamId" | "connectionEpoch" | "serviceSequence">): StreamCursor {
  return { streamId: state.streamId, connectionEpoch: state.connectionEpoch, serviceSequence: state.serviceSequence };
}

export function cursorRecoveryReason(
  previous: StreamCursor,
  incoming: StreamCursor,
): "STREAM_CHANGED" | "EPOCH_CHANGED" | "SEQUENCE_GAP" | "DUPLICATE" | null {
  if (incoming.streamId !== previous.streamId) return "STREAM_CHANGED";
  if (incoming.connectionEpoch !== previous.connectionEpoch) return "EPOCH_CHANGED";
  if (incoming.serviceSequence <= previous.serviceSequence) return "DUPLICATE";
  if (incoming.serviceSequence !== previous.serviceSequence + 1) return "SEQUENCE_GAP";
  return null;
}

export interface ProviderRestRecovery {
  fetchEvents(input: {
    symbol: "NVDA";
    feed: MarketStreamState["feed"];
    atOrAfterProviderAt: number | null;
    beforeOrAt: number;
  }): Promise<ProviderMarketEvent[]>;
}

export type RecoveryResult = {
  state: MarketStreamState;
  emissions: MarketStreamEmission[];
  accepted: number;
  rejected: number;
};

/** Deterministic provider gap-fill with an overlap for same-time and late events. */
export async function recoverMarketStream(input: {
  state: MarketStreamState;
  through: number;
  provider: ProviderRestRecovery;
  overlapMs?: number;
  policy?: Partial<MarketReducerPolicy>;
}): Promise<RecoveryResult> {
  const overlapMs = Math.max(0, input.overlapMs ?? PROVIDER_RECOVERY_OVERLAP_MS);
  const fetched = await input.provider.fetchEvents({
    symbol: "NVDA",
    feed: input.state.feed,
    atOrAfterProviderAt: input.state.lastProviderAt == null ? null : Math.max(0, input.state.lastProviderAt - overlapMs),
    beforeOrAt: input.through,
  });
  const ordered = fetched.slice().sort((left, right) => {
    const millisecondOrder = left.sourceObservedAt - right.sourceObservedAt;
    if (millisecondOrder) return millisecondOrder;
    const leftNanos = BigInt(left.sourceTimestamp.epochNanos);
    const rightNanos = BigInt(right.sourceTimestamp.epochNanos);
    if (leftNanos < rightNanos) return -1;
    if (leftNanos > rightNanos) return 1;
    return left.eventKey.localeCompare(right.eventKey);
  });
  let state = input.state;
  const emissions: MarketStreamEmission[] = [];
  let accepted = 0;
  let rejected = 0;
  for (const event of ordered) {
    const result = reduceProviderEvent(state, event, { policy: input.policy });
    if (result.disposition === "ACCEPTED") {
      state = result.state; emissions.push(...result.emissions); accepted += 1;
    } else {
      rejected += 1;
    }
  }
  return { state, emissions, accepted, rejected };
}
