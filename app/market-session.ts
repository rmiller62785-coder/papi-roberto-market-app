import type { MooDeadline, MooLifecycle } from "./moo-contract.ts";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const NEW_YORK = "America/New_York";
/** Versioned Nasdaq-announced one-off full-day closures outside the formulaic holiday calendar. */
const NASDAQ_AD_HOC_FULL_DAY_CLOSURES_V1 = new Set([
  "2025-01-09", // National Day of Mourning for President Jimmy Carter.
]);

type SessionOptions = { inclusive?: boolean };
type FreezeOptions = { freezeHour?: number; freezeMinute?: number; freezeSecond?: number };

export type NasdaqSessionSchedule = {
  sessionDate: string;
  isTradingSession: boolean;
  premarketOpenAt: number;
  regularOpenAt: number;
  regularCloseAt: number;
  afterHoursCloseAt: number;
  decisionFreezeAt: number;
  modifyCancelAt: number;
  finalEntryAt: number;
  earlyClose: boolean;
};

function dateParts(dateKey: string) {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new RangeError(`Invalid session date: ${dateKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new RangeError(`Invalid session date: ${dateKey}`);
  return { year, month, day, date };
}

function shiftDate(dateKey: string, days: number) {
  const { date } = dateParts(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function observedFixed(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nthWeekday(year: number, monthIndex: number, weekday: number, n: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1));
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (n - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekday(year: number, monthIndex: number, weekday: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - ((7 + date.getUTCDay() - weekday) % 7));
  return date.toISOString().slice(0, 10);
}

function goodFriday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthIndex = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const date = new Date(Date.UTC(year, monthIndex, day));
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

function holidaysForYear(year: number) {
  const values = [
    observedFixed(year, 0, 1),
    // A Saturday New Year's Day can be observed in the preceding year.
    observedFixed(year + 1, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday(year),
    lastWeekday(year, 4, 1),
    observedFixed(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observedFixed(year, 11, 25),
  ];
  if (year >= 2022) values.push(observedFixed(year, 5, 19));
  return new Set(values);
}

export function isNasdaqHoliday(dateKey: string) {
  const { year } = dateParts(dateKey);
  return holidaysForYear(year).has(dateKey) || NASDAQ_AD_HOC_FULL_DAY_CLOSURES_V1.has(dateKey);
}

export function isNasdaqSessionDate(dateKey: string) {
  const { date } = dateParts(dateKey);
  return date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !isNasdaqHoliday(dateKey);
}

export function nextNasdaqSession(dateKey: string, options: SessionOptions = {}) {
  let candidate = options.inclusive === false ? shiftDate(dateKey, 1) : dateKey;
  while (!isNasdaqSessionDate(candidate)) candidate = shiftDate(candidate, 1);
  return candidate;
}

export function previousNasdaqSession(dateKey: string, options: SessionOptions = {}) {
  let candidate = options.inclusive === false ? shiftDate(dateKey, -1) : dateKey;
  while (!isNasdaqSessionDate(candidate)) candidate = shiftDate(candidate, -1);
  return candidate;
}

export function isNasdaqEarlyClose(dateKey: string) {
  if (!isNasdaqSessionDate(dateKey)) return false;
  const { year, month, day } = dateParts(dateKey);
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  return dateKey === shiftDate(thanksgiving, 1) || (month === 7 && day === 3) || (month === 12 && day === 24);
}

function newYorkParts(epochMs: number) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: NEW_YORK,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]),
  );
}

export function newYorkDateKey(epochMs: number) {
  const parts = newYorkParts(epochMs);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Convert an unambiguous New York wall time to UTC without using the host timezone. */
export function newYorkWallTimeUtc(dateKey: string, hour: number, minute: number, second = 0) {
  const { year, month, day } = dateParts(dateKey);
  if (![hour, minute, second].every(Number.isInteger) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    throw new RangeError("Invalid New York wall time");
  }
  const desiredWallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredWallAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = newYorkParts(guess);
    const representedWallAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const correction = desiredWallAsUtc - representedWallAsUtc;
    guess += correction;
    if (correction === 0) break;
  }
  const verified = newYorkParts(guess);
  if (`${verified.year}-${verified.month}-${verified.day}` !== dateKey || Number(verified.hour) !== hour || Number(verified.minute) !== minute || Number(verified.second) !== second) {
    throw new RangeError(`New York wall time does not exist: ${dateKey} ${hour}:${minute}:${second}`);
  }
  return guess;
}

export function nasdaqSessionSchedule(dateKey: string, options: FreezeOptions = {}): NasdaqSessionSchedule {
  const earlyClose = isNasdaqEarlyClose(dateKey);
  return {
    sessionDate: dateKey,
    isTradingSession: isNasdaqSessionDate(dateKey),
    premarketOpenAt: newYorkWallTimeUtc(dateKey, 4, 0),
    regularOpenAt: newYorkWallTimeUtc(dateKey, 9, 30),
    regularCloseAt: newYorkWallTimeUtc(dateKey, earlyClose ? 13 : 16, 0),
    afterHoursCloseAt: newYorkWallTimeUtc(dateKey, earlyClose ? 17 : 20, 0),
    decisionFreezeAt: newYorkWallTimeUtc(
      dateKey,
      options.freezeHour ?? 9,
      options.freezeMinute ?? 24,
      options.freezeSecond ?? 30,
    ),
    modifyCancelAt: newYorkWallTimeUtc(dateKey, 9, 25),
    finalEntryAt: newYorkWallTimeUtc(dateKey, 9, 28),
    earlyClose,
  };
}

export function mooLifecycleAt(targetSession: string, nowMs: number): MooLifecycle {
  const schedule = nasdaqSessionSchedule(targetSession);
  const currentDate = newYorkDateKey(nowMs);
  if (!schedule.isTradingSession) return "MARKET_CLOSED";
  // A selected upcoming session is not a closed target session. Keep it
  // explicitly non-actionable while allowing the UI to show its dated plan,
  // schedule, and research-only preview before target-session feeds exist.
  if (targetSession > currentDate) return "FUTURE_SESSION";
  if (currentDate !== targetSession || !isNasdaqSessionDate(currentDate)) return "MARKET_CLOSED";
  if (nowMs < schedule.premarketOpenAt) return "PREPARING";
  if (nowMs < schedule.decisionFreezeAt) return "READY";
  if (nowMs < schedule.modifyCancelAt) return "FROZEN";
  if (nowMs < schedule.finalEntryAt) return "LATE_LOCKED";
  if (nowMs < schedule.regularOpenAt) return "ENTRY_CLOSED";
  return "CROSS_COMPLETE";
}

export function mooDeadlines(targetSession: string, nowMs: number): MooDeadline[] {
  const schedule = nasdaqSessionSchedule(targetSession);
  return [
    ["DECISION_FREEZE", schedule.decisionFreezeAt],
    ["MODIFY_CANCEL", schedule.modifyCancelAt],
    ["FINAL_ENTRY", schedule.finalEntryAt],
  ].map(([label, at]) => ({
    label: label as MooDeadline["label"],
    at: at as number,
    remainingMs: Math.max(0, (at as number) - nowMs),
    passed: nowMs >= (at as number),
  }));
}
