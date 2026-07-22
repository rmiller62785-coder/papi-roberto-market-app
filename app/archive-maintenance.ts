import { MARKET_ARCHIVE_BATCH_ROWS } from "./d1-market-archive.ts";

export const SCHEDULED_ARCHIVE_MAXIMUM_ROWS = MARKET_ARCHIVE_BATCH_ROWS;

const NEW_YORK_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function easternClock(epochMs: number) {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) throw new TypeError("scheduledTime is invalid");
  const parts = Object.fromEntries(NEW_YORK_CLOCK.formatToParts(new Date(epochMs))
    .filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { hour: Number(parts.hour), minute: Number(parts.minute) };
}

/**
 * Archive work is intentionally admitted only after the 20:00 ET extended
 * session and stopped before the 04:00 ET overnight checkpoint. The external
 * scheduler route owns this lane; the hosting worker never runs it in parallel.
 */
export function shouldRunScheduledArchiveMaintenance(scheduledTime: number) {
  const { hour, minute } = easternClock(scheduledTime);
  return (hour === 20 && minute >= 5) || hour >= 21 || hour < 4;
}
