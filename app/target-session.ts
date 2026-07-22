import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
  nextNasdaqSession,
  previousNasdaqSession,
} from "./market-session.ts";

export type TargetSessionRelation = "PAST" | "CURRENT" | "NEXT" | "FUTURE";
export type TargetSessionValidationReason = "INVALID_DATE" | "NON_TRADING_DAY";

export type TargetSessionOption = {
  date: string;
  relation: TargetSessionRelation;
  isDefault: boolean;
  earlyClose: boolean;
  regularOpenAt: number;
  decisionFreezeAt: number;
};

export type TargetSessionValidation =
  | { valid: true; date: string; relation: TargetSessionRelation }
  | { valid: false; date: string; reason: TargetSessionValidationReason };

function validNasdaqSession(value: string) {
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && isNasdaqSessionDate(value);
  } catch {
    return false;
  }
}

/**
 * The default decision target is today's Nasdaq session only while a new MOO
 * can still be entered. After the 09:28 ET final-entry deadline it rolls to the
 * next session. All comparisons use New York dates rather than the Worker host
 * timezone.
 */
export function defaultTargetSession(nowMs = Date.now()) {
  const currentDate = newYorkDateKey(nowMs);
  if (validNasdaqSession(currentDate) && nowMs <= nasdaqSessionSchedule(currentDate).finalEntryAt) {
    return currentDate;
  }
  return nextNasdaqSession(currentDate, { inclusive: false });
}

export function classifyTargetSession(
  targetDate: string,
  nowMs = Date.now(),
): TargetSessionRelation {
  if (!validNasdaqSession(targetDate)) {
    throw new RangeError(`Invalid Nasdaq target session: ${targetDate}`);
  }
  const currentDate = newYorkDateKey(nowMs);
  if (targetDate < currentDate) return "PAST";
  if (targetDate === currentDate) return "CURRENT";
  const nextSession = nextNasdaqSession(currentDate, { inclusive: false });
  return targetDate === nextSession ? "NEXT" : "FUTURE";
}

/** Non-throwing validation intended for date controls and API boundaries. */
export function validateTargetSession(
  targetDate: string,
  nowMs = Date.now(),
): TargetSessionValidation {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return { valid: false, date: targetDate, reason: "INVALID_DATE" };
    }
    // Calling the session helper distinguishes a real calendar date that is a
    // weekend/holiday from malformed dates such as 2026-02-30.
    if (!isNasdaqSessionDate(targetDate)) {
      return { valid: false, date: targetDate, reason: "NON_TRADING_DAY" };
    }
    return { valid: true, date: targetDate, relation: classifyTargetSession(targetDate, nowMs) };
  } catch {
    return { valid: false, date: targetDate, reason: "INVALID_DATE" };
  }
}

/** Non-throwing prior-session lookup for cold UI renders and date controls. */
export function previousTargetSession(targetDate: string) {
  if (!validNasdaqSession(targetDate)) return null;
  return previousNasdaqSession(targetDate, { inclusive: false });
}

function boundedCount(value: number | undefined, fallback: number) {
  if (value == null) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(31, Math.trunc(value)));
}

/**
 * Enumerate dated, valid Nasdaq sessions around the current default. This is
 * deliberately bounded so a UI cannot accidentally create an unbounded
 * calendar traversal during rendering.
 */
export function enumerateNearbyTargetSessions(
  nowMs = Date.now(),
  options: { past?: number; future?: number } = {},
): TargetSessionOption[] {
  const pastCount = boundedCount(options.past, 5);
  const futureCount = boundedCount(options.future, 10);
  const defaultDate = defaultTargetSession(nowMs);
  const dates = [defaultDate];

  let prior = defaultDate;
  for (let index = 0; index < pastCount; index += 1) {
    prior = previousNasdaqSession(prior, { inclusive: false });
    dates.unshift(prior);
  }

  let next = defaultDate;
  for (let index = 0; index < futureCount; index += 1) {
    next = nextNasdaqSession(next, { inclusive: false });
    dates.push(next);
  }

  return dates.map((date) => {
    const schedule = nasdaqSessionSchedule(date);
    return {
      date,
      relation: classifyTargetSession(date, nowMs),
      isDefault: date === defaultDate,
      earlyClose: schedule.earlyClose,
      regularOpenAt: schedule.regularOpenAt,
      decisionFreezeAt: schedule.decisionFreezeAt,
    };
  });
}
