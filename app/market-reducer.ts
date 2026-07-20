import { nasdaqSessionSchedule, newYorkDateKey } from "./market-session.ts";

export type ReducibleMarketBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ReducibleDailyRow = {
  date: string;
  dateKey: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestampMs: number;
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Provider arrays are not trusted to be chronological or duplicate-free.
 * A later occurrence of the same timestamp is treated as the provider's most
 * recent revision, then the canonical series is sorted ascending.
 */
export function canonicalMarketBars<T extends ReducibleMarketBar>(bars: T[]): T[] {
  const byTimestamp = new Map<number, T>();
  for (const bar of bars) {
    if (
      !finite(bar.time) || !Number.isSafeInteger(bar.time) || bar.time < 0 ||
      !finite(bar.open) ||
      !finite(bar.high) ||
      !finite(bar.low) ||
      !finite(bar.close) ||
      !finite(bar.volume) || bar.volume < 0 ||
      bar.open < 0 || bar.high < 0 || bar.low < 0 || bar.close < 0 ||
      bar.high < bar.low ||
      bar.open < bar.low || bar.open > bar.high ||
      bar.close < bar.low || bar.close > bar.high
    ) continue;
    byTimestamp.set(bar.time, bar);
  }
  return [...byTimestamp.values()].sort((left, right) => left.time - right.time);
}

export function completedMarketBars<T extends ReducibleMarketBar>(bars: T[], effectiveAsOf: number): T[] {
  return canonicalMarketBars(bars).filter((bar) => bar.time + 60_000 <= effectiveAsOf);
}

export function marketBarsForSession<T extends ReducibleMarketBar>(bars: T[], sessionDate: string): T[] {
  return canonicalMarketBars(bars).filter((bar) => newYorkDateKey(bar.time) === sessionDate);
}

/** A dated daily row is eligible only after that Nasdaq session has closed. */
export function completedDailyRows<T extends ReducibleDailyRow>(rows: T[], effectiveAsOf: number): T[] {
  const bySession = new Map<string, T>();
  for (const row of rows) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.dateKey) ||
      !finite(row.timestampMs) || !Number.isSafeInteger(row.timestampMs) || row.timestampMs < 0 ||
      !finite(row.open) ||
      !finite(row.high) ||
      !finite(row.low) ||
      !finite(row.close) ||
      row.open < 0 || row.high < 0 || row.low < 0 || row.close < 0 ||
      (row.volume != null && (!finite(row.volume) || row.volume < 0)) ||
      row.high < row.low ||
      row.open < row.low || row.open > row.high ||
      row.close < row.low || row.close > row.high
    ) continue;
    try {
      if (nasdaqSessionSchedule(row.dateKey).regularCloseAt > effectiveAsOf) continue;
    } catch {
      continue;
    }
    bySession.set(row.dateKey, row);
  }
  return [...bySession.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}
