export type DashboardWorkflow = "moo" | "confirmation";

export type PollingContext = {
  session: string | null | undefined;
  workflow: DashboardWorkflow;
  visibilityState: DocumentVisibilityState;
  online: boolean;
  /** The dedicated operational-health surface needs the small status projection live. */
  statusSurfaceVisible?: boolean;
};

export type ForecastReuseContext = {
  mainTargetDate: string | null | undefined;
  strictTargetDate: string | null | undefined;
};

export const MARKET_REQUEST_TIMEOUT_MS = 12_000;
export const FORECAST_REQUEST_TIMEOUT_MS = 20_000;
export const MOO_STATUS_REQUEST_TIMEOUT_MS = 2_000;
export const AUTOMATION_HEALTH_REQUEST_TIMEOUT_MS = 5_000;

export const MIN_POLL_INTERVAL_MS = 1_000;
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

/** A qualified SIP quote expires independently of the 45-second status
 * envelope. Poll the small D1-backed projection once per second while the
 * market workflow is active so the next server observation arrives promptly. */
export function mooStatusPollingIntervalMs(context: PollingContext) {
  if (!context.online) return MAX_POLL_INTERVAL_MS;
  if (context.visibilityState !== "visible") return HIDDEN_FORECAST_POLL_INTERVAL_MS;
  if (context.statusSurfaceVisible) return 1_000;
  // Strict status is independent of the research market payload. Keep its
  // two-second SIP readiness projection current even when that separate
  // payload has no usable session label.
  if (context.workflow === "moo") return 1_000;
  return 30_000;
}

/** Scheduler health changes at checkpoint cadence, not quote cadence. */
export function automationHealthPollingIntervalMs(context: PollingContext) {
  if (!context.online) return MAX_POLL_INTERVAL_MS;
  if (context.visibilityState !== "visible") return 60_000;
  return context.workflow === "moo" || context.statusSurfaceVisible ? 15_000 : 60_000;
}

/**
 * Convert the server-authored validity window into a browser-local remaining
 * lifetime. The complete request round trip is deducted so network transit can
 * never make an already-aging quote appear newer after it reaches the page.
 */
export function remainingStatusValidityMs(
  validUntil: number,
  evaluatedAt: number,
  requestRoundTripMs: number,
) {
  if (![validUntil, evaluatedAt, requestRoundTripMs].every(Number.isFinite)) return 0;
  return Math.max(0, validUntil - evaluatedAt - Math.max(0, requestRoundTripMs));
}

/** Delay until a received status must be invalidated on the browser's
 * monotonic clock. This drives an exact timeout instead of relying on the
 * coarser one-second display clock. */
export function statusExpiryDelayMs(
  receivedAt: number,
  remainingValidityMs: number,
  now: number,
) {
  if (![receivedAt, remainingValidityMs, now].every(Number.isFinite)) return 0;
  return Math.max(0, remainingValidityMs - Math.max(0, now - receivedAt));
}

/** A strict view may share the main response only for the identical target. */
export function canReuseMainForecast(context: ForecastReuseContext) {
  return Boolean(
    context.mainTargetDate &&
    context.strictTargetDate &&
    context.mainTargetDate === context.strictTargetDate,
  );
}
