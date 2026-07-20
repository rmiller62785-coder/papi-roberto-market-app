export type ResearchLeanSide = "LONG_LEAN" | "SHORT_LEAN" | "NO_EDGE";
export type ResearchLeanState = "READY" | "RANGE_ONLY" | "NO_SIGNAL" | "STALE" | "LOADING" | "MANUAL";

export type ResearchLeanContribution = {
  key: string;
  label: string;
  enabled?: boolean;
  applied?: boolean;
  appliedDirectionBps?: number;
  appliedRangePct?: number;
  directionBps?: number;
  rangePct?: number;
  source?: { status?: "live" | "limited" | "offline" };
};

export type ResearchLean = {
  side: ResearchLeanSide;
  state: ResearchLeanState;
  directionBps: number;
  signedDriverCount: number;
  rangeOnlyDriverCount: number;
  topDrivers: Array<{ key: string; label: string; directionBps: number }>;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Summarizes fresh signed research evidence without promoting it to an order.
 * Event-severity and range-only inputs can increase uncertainty, but cannot
 * manufacture a LONG/SHORT lean.
 */
export function deriveResearchLean({
  directionBps,
  contributions = [],
  readiness,
  stale = false,
  manual = false,
}: {
  directionBps?: number | null;
  contributions?: ResearchLeanContribution[];
  readiness?: string | null;
  stale?: boolean;
  manual?: boolean;
}): ResearchLean {
  const appliedDirection = finite(directionBps) ? directionBps : 0;
  const visible = contributions.filter((item) => item.enabled !== false && item.source?.status !== "offline");
  const directional = visible.filter((item) => item.source?.status === "live");
  const signed = directional
    .map((item) => ({
      key: item.key,
      label: item.label,
      directionBps: finite(item.appliedDirectionBps) ? item.appliedDirectionBps : finite(item.directionBps) ? item.directionBps : 0,
    }))
    .filter((item) => Math.abs(item.directionBps) >= 0.05)
    .sort((a, b) => Math.abs(b.directionBps) - Math.abs(a.directionBps));
  const rangeOnlyDriverCount = visible.filter((item) => {
    const directional = finite(item.appliedDirectionBps) ? item.appliedDirectionBps : finite(item.directionBps) ? item.directionBps : 0;
    const range = finite(item.appliedRangePct) ? item.appliedRangePct : finite(item.rangePct) ? item.rangePct : 0;
    return Math.abs(directional) < 0.05 && Math.abs(range) >= 0.001;
  }).length;

  const base = {
    directionBps: appliedDirection,
    signedDriverCount: signed.length,
    rangeOnlyDriverCount,
    topDrivers: signed.slice(0, 3),
  };
  if (manual) return { ...base, side: "NO_EDGE", state: "MANUAL" };
  if (stale || readiness === "STALE_DO_NOT_ACT") return { ...base, side: "NO_EDGE", state: "STALE" };
  if (!readiness || readiness === "LOADING") return { ...base, side: "NO_EDGE", state: "LOADING" };
  if (!signed.length || readiness === "DEGRADED_RANGE_ONLY") {
    return { ...base, side: "NO_EDGE", state: rangeOnlyDriverCount ? "RANGE_ONLY" : "NO_SIGNAL" };
  }
  if (Math.abs(appliedDirection) < 0.5) return { ...base, side: "NO_EDGE", state: "NO_SIGNAL" };
  return {
    ...base,
    side: appliedDirection > 0 ? "LONG_LEAN" : "SHORT_LEAN",
    state: "READY",
  };
}
