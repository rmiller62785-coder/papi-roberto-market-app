export type ForecastFreezeWritePhase =
  | "BEFORE_TARGET_PREMARKET"
  | "ACTIONABLE_WINDOW"
  | "MONITORING_LOCKED"
  | "CROSS_COMPLETE";

/**
 * The scheduled Worker calls the app through an internal synthetic origin.
 * Browser-controlled hosts and nonnumeric automation markers never receive
 * freeze-write authority.
 */
export function isAuthorizedScheduledForecastCapture(url: URL) {
  const automationValue = url.searchParams.get("automation");
  return url.hostname === "nvda-scheduler.internal" &&
    automationValue != null && /^\d+$/.test(automationValue);
}

export function canPersistForecastFreeze(input: {
  url: URL;
  phase: ForecastFreezeWritePhase;
}) {
  return input.phase === "ACTIONABLE_WINDOW" &&
    isAuthorizedScheduledForecastCapture(input.url);
}
