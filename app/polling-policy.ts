export type DashboardWorkflow = "moo" | "confirmation";

export type PollingContext = {
  session: string | null | undefined;
  workflow: DashboardWorkflow;
  visibilityState: DocumentVisibilityState;
  online: boolean;
};

export type ForecastReuseContext = {
  mainTargetDate: string | null | undefined;
  strictTargetDate: string | null | undefined;
};

export const MARKET_REQUEST_TIMEOUT_MS = 12_000;
export const FORECAST_REQUEST_TIMEOUT_MS = 20_000;

export const MIN_POLL_INTERVAL_MS = 5_000;
export const MAX_POLL_INTERVAL_MS = 300_000;

const HIDDEN_MARKET_POLL_INTERVAL_MS = 60_000;
const OFFLINE_MARKET_POLL_INTERVAL_MS = 120_000;
const HIDDEN_FORECAST_POLL_INTERVAL_MS = 120_000;
const OFFLINE_FORECAST_POLL_INTERVAL_MS = MAX_POLL_INTERVAL_MS;

function boundedInterval(intervalMs: number) {
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, intervalMs));
}

function visibilityFloor(
  context: PollingContext,
  hiddenIntervalMs: number,
  offlineIntervalMs: number,
) {
  if (!context.online) return offlineIntervalMs;
  return context.visibilityState === "visible" ? 0 : hiddenIntervalMs;
}

/**
 * Market quotes move quickly around the open, but the policy backs off when
 * the page cannot present updates. This prevents every open or background tab
 * from maintaining the old two-second request loop.
 */
export function marketPollingIntervalMs(context: PollingContext) {
  const baseIntervalMs = context.session === "MARKET OPEN"
    ? context.workflow === "moo" ? 5_000 : 10_000
    : context.session === "PREMARKET"
      ? 15_000
      : context.session === "AFTER-HOURS"
        ? 60_000
        : 120_000;

  return boundedInterval(Math.max(
    baseIntervalMs,
    visibilityFloor(
      context,
      HIDDEN_MARKET_POLL_INTERVAL_MS,
      OFFLINE_MARKET_POLL_INTERVAL_MS,
    ),
  ));
}

/**
 * Forecast context is expensive and changes more slowly than the quote. Keep
 * it responsive for the MOO workflow without coupling it to the quote cadence.
 */
export function forecastPollingIntervalMs(context: PollingContext) {
  const baseIntervalMs = context.session === "MARKET OPEN"
    ? context.workflow === "moo" ? 30_000 : 60_000
    : context.session === "PREMARKET"
      ? context.workflow === "moo" ? 30_000 : 60_000
      : 120_000;

  return boundedInterval(Math.max(
    baseIntervalMs,
    visibilityFloor(
      context,
      HIDDEN_FORECAST_POLL_INTERVAL_MS,
      OFFLINE_FORECAST_POLL_INTERVAL_MS,
    ),
  ));
}

/** Server-owned Strict status has a 45-second validity window. Keep visible
 * evaluations inside that window without coupling expensive forecasts to it. */
export function mooStatusPollingIntervalMs(context: PollingContext) {
  if (!context.online) return MAX_POLL_INTERVAL_MS;
  if (context.visibilityState !== "visible") return HIDDEN_FORECAST_POLL_INTERVAL_MS;
  return 30_000;
}

/** A strict view may share the main response only for the identical target. */
export function canReuseMainForecast(context: ForecastReuseContext) {
  return Boolean(
    context.mainTargetDate &&
    context.strictTargetDate &&
    context.mainTargetDate === context.strictTargetDate,
  );
}
