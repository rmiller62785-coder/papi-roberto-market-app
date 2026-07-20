import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
  nextNasdaqSession,
} from "./market-session.ts";

export type SchedulerRunStatus =
  | "skipped"
  | "captured"
  | "freeze_only"
  | "outcome_attached"
  | "failed";

export type SchedulerRunRow = {
  runId: string;
  jobKey: string;
  scheduledAt: number;
  startedAt: number;
  completedAt: number;
  phase: string;
  checkpoint: string;
  status: SchedulerRunStatus;
  targetDate: string | null;
  transportSucceeded: number | boolean;
  snapshotSucceeded: number | boolean;
  freezeSucceeded: number | boolean;
  detailCode: string | null;
  detail: string | null;
};

type ExpectedCheckpoint = {
  targetDate: string;
  checkpoint: string;
  scheduledAt: number;
};

const CHECKPOINT_GRACE_MS = 10 * 60_000;

function sessionCheckpoints(targetDate: string): ExpectedCheckpoint[] {
  const schedule = nasdaqSessionSchedule(targetDate);
  return [
    { checkpoint: "OVERNIGHT", scheduledAt: schedule.regularOpenAt - 5 * 60 * 60_000 - 25 * 60_000 },
    { checkpoint: "T-4H", scheduledAt: schedule.regularOpenAt - 4 * 60 * 60_000 },
    { checkpoint: "T-1H", scheduledAt: schedule.regularOpenAt - 60 * 60_000 },
    { checkpoint: "T-30M", scheduledAt: schedule.regularOpenAt - 30 * 60_000 },
    { checkpoint: "T-5M", scheduledAt: schedule.decisionFreezeAt - 30_000 },
    { checkpoint: "OUTCOME", scheduledAt: schedule.regularOpenAt + 60_000 },
  ].map((item) => ({ targetDate, ...item }));
}

export function nextExpectedSchedulerCheckpoint(nowMs: number): ExpectedCheckpoint {
  const today = newYorkDateKey(nowMs);
  const targetDate = isNasdaqSessionDate(today) ? today : nextNasdaqSession(today);
  const remaining = sessionCheckpoints(targetDate).find((item) => item.scheduledAt > nowMs);
  if (remaining) return remaining;
  return sessionCheckpoints(nextNasdaqSession(targetDate, { inclusive: false }))[0];
}

export function summarizeSchedulerHealth(rows: SchedulerRunRow[], nowMs: number) {
  const ordered = [...rows].sort((left, right) => right.completedAt - left.completedAt);
  const lastRun = ordered[0] ?? null;
  const latest = (predicate: (row: SchedulerRunRow) => boolean) =>
    ordered.find(predicate)?.completedAt ?? null;
  let consecutiveFailures = 0;
  for (const row of ordered) {
    if (row.status !== "failed") break;
    consecutiveFailures += 1;
  }

  const today = newYorkDateKey(nowMs);
  const missedCheckpoints = isNasdaqSessionDate(today)
    ? sessionCheckpoints(today)
      .filter((expected) => expected.scheduledAt + CHECKPOINT_GRACE_MS < nowMs)
      .filter((expected) => !ordered.some((row) =>
        row.checkpoint === expected.checkpoint &&
        Math.abs(row.scheduledAt - expected.scheduledAt) <= 5 * 60_000
      ))
      .map((expected) => expected.checkpoint)
    : [];

  const status = lastRun == null
    ? "awaiting_first_run"
    : lastRun.status === "failed"
      ? "failed"
      : lastRun.status === "freeze_only" || missedCheckpoints.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    evaluatedAt: nowMs,
    lastAttemptAt: lastRun?.completedAt ?? null,
    lastTransportSuccessAt: latest((row) => Boolean(row.transportSucceeded)),
    lastSnapshotSuccessAt: latest((row) => Boolean(row.snapshotSucceeded)),
    lastFreezeSuccessAt: latest((row) => Boolean(row.freezeSucceeded)),
    lastPreopenAt: latest((row) => row.phase === "preopen" && Boolean(row.snapshotSucceeded)),
    lastOutcomeAt: latest((row) => row.status === "outcome_attached"),
    consecutiveFailures,
    missedCheckpoints,
    nextExpectedCheckpoint: nextExpectedSchedulerCheckpoint(nowMs),
    lastRun,
  };
}

export async function readSchedulerHealth(database: D1Database, nowMs = Date.now()) {
  const result = await database.prepare(
    `SELECT
      run_id AS runId,
      job_key AS jobKey,
      scheduled_at AS scheduledAt,
      started_at AS startedAt,
      completed_at AS completedAt,
      phase,
      checkpoint,
      status,
      target_date AS targetDate,
      transport_succeeded AS transportSucceeded,
      snapshot_succeeded AS snapshotSucceeded,
      freeze_succeeded AS freezeSucceeded,
      detail_code AS detailCode,
      detail
    FROM scheduler_runs
    ORDER BY completed_at DESC
    LIMIT 250`,
  ).all<SchedulerRunRow>();
  return summarizeSchedulerHealth(result.results, nowMs);
}
