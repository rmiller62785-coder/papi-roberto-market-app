export type SchedulerCheckpoint = {
  targetDate: string;
  checkpoint: string;
  scheduledAt: number;
};

export type SchedulerRun = {
  checkpoint?: string;
  targetDate?: string | null;
  status?: string;
  detailCode?: string | null;
  detail?: string | null;
  completedAt?: number | null;
};

export type SchedulerAutomationHealth = {
  status: string;
  evaluatedAt: number;
  lastAttemptAt: number | null;
  lastTransportSuccessAt: number | null;
  lastSnapshotSuccessAt: number | null;
  lastFreezeSuccessAt: number | null;
  lastPreopenAt: number | null;
  lastOutcomeAt: number | null;
  consecutiveFailures: number;
  missedCheckpoints: string[];
  stalledRuns: SchedulerRun[];
  nextExpectedCheckpoint: SchedulerCheckpoint | null;
  lastRun: SchedulerRun | null;
};

export type StatusDeliveryState = "live" | "retrying" | "expired" | "offline" | "loading";
export type OperationalState = "ready" | "degraded" | "error" | "loading";

export function schedulerIssueCheckpoints(automation: SchedulerAutomationHealth | null) {
  if (!automation) return [];
  const failedLast = automation.lastRun?.status === "failed" && automation.lastRun.checkpoint
    ? [automation.lastRun.checkpoint]
    : [];
  return [...new Set([
    ...automation.missedCheckpoints,
    ...automation.stalledRuns.map((run) => run.checkpoint).filter((value): value is string => Boolean(value)),
    ...failedLast,
  ])];
}

export function schedulerOperationalState(
  automation: SchedulerAutomationHealth | null,
  retrying: boolean,
): OperationalState {
  if (!automation) return retrying ? "error" : "loading";
  if (automation.status === "failed" || automation.status === "stalled" || schedulerIssueCheckpoints(automation).length) return "error";
  if (automation.status === "running" || automation.status === "awaiting_first_run") return "loading";
  if (automation.status === "degraded" || retrying) return "degraded";
  return automation.status === "healthy" ? "ready" : "error";
}

export function strictOperationalState(input: {
  lifecycle: string;
  deliveryState: StatusDeliveryState;
  gateReady: boolean;
  quoteState: string;
  streamState: string;
}): OperationalState {
  if (input.lifecycle === "FUTURE_SESSION" || input.lifecycle === "MARKET_CLOSED") return "loading";
  if (input.deliveryState === "expired" || input.deliveryState === "offline" || !input.gateReady) return "error";
  if (input.quoteState !== "LIVE" || input.streamState !== "LIVE") return "degraded";
  return input.deliveryState === "retrying" ? "degraded" : "ready";
}
