import { applyForecastAdjustment } from "./forecast-adjustment.ts";
import { computeOpeningAnalysis } from "./opening-analysis.ts";
import {
  ensureForecastSnapshotOutcomeColumns,
  ensureMarketPersistenceSchema,
  ensureMooSafetySchemaOnce,
} from "./d1-schema.ts";
import {
  isNasdaqSessionDate,
  nasdaqSessionSchedule,
  newYorkDateKey,
} from "./market-session.ts";
import type { TargetMarketEnvelope } from "./market-contract.ts";
import { createMarketStore } from "./market-store.ts";

type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Daily = {
  date: string;
  dateKey?: string;
  open?: number;
  high: number;
  low: number;
  close: number;
};

type MarketPayload = {
  marketContract?: TargetMarketEnvelope;
  targetDate: string;
  checkedAt: string;
  session: string;
  price: number | null;
  previousClose: number | null;
  bars: Bar[];
  analysisBars?: Bar[];
  daily: Daily[];
  firstMinuteHistory: Array<{ range: number; volume: number }>;
  targetSession?: { evidenceQualified?: boolean };
  freshness?: {
    quote?: { observedAt?: string | null; fetchedAt?: string | null; stale?: boolean };
    history?: {
      stale?: boolean;
      fetchedAt?: string | null;
      latestMinuteObservedAt?: string | null;
    };
  };
  premarket: {
    high: number | null;
    low: number | null;
    current: number | null;
  };
  day: { open: number | null };
  firstMinute: {
    close: number | null;
    volume: number;
    complete: boolean;
    observedAt?: string | null;
  };
};

type ForecastPayload = {
  computedAt: number;
  methodology?: { version?: string; state?: string };
  flag?: { updatedAt?: number };
  adjustment: { directionBps: number; rangeMultiplier: number };
  contributions?: unknown[];
};

export type ScheduledCapturePhase = "preopen" | "outcome" | null;
export type ScheduledInterval = "OVERNIGHT" | "T-4H" | "T-1H" | "T-30M" | "T-5M";

export type ScheduledPlan = {
  date: string;
  signal: "LONG" | "SHORT" | "WAIT";
  openRangeLow: number;
  openRangeHigh: number;
  entry: number | null;
  stop: number | null;
  target: number | null;
  expectedMove: number;
  confidence: number;
  rationale: string;
};

export type ScheduledSnapshot = {
  targetDate: string;
  intervalLabel: ScheduledInterval;
  capturedAt: number;
  baseMedian: number;
  adjustedMedian: number;
  adjustedLow: number;
  adjustedHigh: number;
  factorsJson: string;
};

export type ScheduledCaptureStore = {
  savePreopen(plan: ScheduledPlan | null, snapshot: ScheduledSnapshot): Promise<void>;
  attachOutcome(input: {
    targetDate: string;
    actualOpen: number | null;
    firstMinuteClose: number | null;
    capturedAt: number;
  }): Promise<number>;
  saveMarketCheckpoint?(input: {
    envelope: TargetMarketEnvelope;
    analysisBars: Bar[];
    checkpoint: ScheduledInterval | "OUTCOME";
    capturedAt: number;
  }): Promise<void>;
  recordRun?(input: {
    scheduledAt: number;
    startedAt: number;
    completedAt: number;
    phase: Exclude<ScheduledCapturePhase, null>;
    checkpoint: ScheduledInterval | "OUTCOME";
    status: ScheduledCaptureResult["status"] | "failed";
    targetDate: string | null;
    detailCode: string | null;
    detail: string | null;
  }): Promise<void>;
};

export type ScheduledCaptureResult = {
  phase: ScheduledCapturePhase;
  status: "skipped" | "captured" | "freeze_only" | "outcome_attached";
  targetDate?: string;
  reasonCode?: string;
  reason?: string;
};

export const ACTIONABLE_MOO_FREEZE_TIME_ET = "09:24:30";
export const MAX_SCHEDULED_CAPTURE_DELAY_MS = 90_000;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function easternParts(atMs: number) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(atMs))
      .map((part) => [part.type, part.value]),
  );
}

export function easternDate(atMs: number) {
  return newYorkDateKey(atMs);
}

export function actionableMooFreezeAt(sessionDate: string) {
  return nasdaqSessionSchedule(sessionDate).decisionFreezeAt;
}

/**
 * Cron triggers are UTC, while the market schedule is Eastern. Both UTC DST
 * variants fire and this guard admits only the five named pre-open checkpoint
 * windows or the 09:31-09:35 outcome window. Weekends and known Nasdaq
 * holidays are rejected before any upstream call.
 */
export function scheduledCapturePhase(atMs: number): ScheduledCapturePhase {
  const checkpoint = scheduledCaptureCheckpoint(atMs);
  if (checkpoint === "OUTCOME") return "outcome";
  return checkpoint == null ? null : "preopen";
}

export function scheduledCaptureCheckpoint(atMs: number): ScheduledInterval | "OUTCOME" | null {
  const parts = easternParts(atMs);
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (!isNasdaqSessionDate(dateKey)) return null;
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  if (minute >= 4 * 60 + 5 && minute <= 4 * 60 + 9) return "OVERNIGHT";
  if (minute >= 5 * 60 + 30 && minute <= 5 * 60 + 34) return "T-4H";
  if (minute >= 8 * 60 + 30 && minute <= 8 * 60 + 34) return "T-1H";
  if (minute >= 9 * 60 && minute <= 9 * 60 + 4) return "T-30M";
  // The actionable MOO plan must be frozen no later than 09:24:30 ET. Cron
  // fires on the minute, so 09:24 is the only final actionable checkpoint.
  // 09:25-09:29 data is monitoring-only and must never enter this pipeline.
  if (minute === 9 * 60 + 24) return "T-5M";
  if (minute >= 9 * 60 + 31 && minute <= 9 * 60 + 35) return "OUTCOME";
  return null;
}

function ema(values: number[], period: number) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    output.push(values[index] * multiplier + output[index - 1] * (1 - multiplier));
  }
  return output;
}

function recentEnough(value: string | number | null | undefined, nowMs: number, maxAgeMs: number) {
  const observedAt = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(observedAt) && observedAt <= nowMs + 30_000 && nowMs - observedAt <= maxAgeMs;
}

export function buildScheduledPreopenCapture(
  market: MarketPayload,
  forecast: ForecastPayload,
  capturedAt: number,
  intervalLabel: ScheduledInterval = "T-5M",
): { plan: ScheduledPlan | null; snapshot: ScheduledSnapshot } | null {
  if (capturedAt > actionableMooFreezeAt(market.targetDate)) return null;
  const completedBars = market.analysisBars?.length
    ? market.analysisBars
    : market.bars.filter((bar) => bar.time + 60_000 <= capturedAt);
  const latestCompletedBar = completedBars.at(-1);
  const historyProviderFresh =
    market.freshness?.history?.stale !== true &&
    recentEnough(market.freshness?.history?.fetchedAt, capturedAt, 3 * 60_000) &&
    recentEnough(market.freshness?.history?.latestMinuteObservedAt, capturedAt, 3 * 60_000) &&
    latestCompletedBar != null &&
    recentEnough(latestCompletedBar.time + 60_000, capturedAt, 3 * 60_000);
  const quoteProviderFresh =
    market.freshness?.quote?.stale !== true &&
    recentEnough(market.freshness?.quote?.observedAt, capturedAt, 3 * 60_000) &&
    recentEnough(market.freshness?.quote?.fetchedAt, capturedAt, 3 * 60_000);
  if (
    market.session !== "PREMARKET" ||
    market.targetDate !== easternDate(capturedAt) ||
    market.targetSession?.evidenceQualified !== true ||
    !historyProviderFresh ||
    !recentEnough(market.checkedAt, capturedAt, 3 * 60_000) ||
    !recentEnough(forecast.computedAt, capturedAt, 5 * 60_000) ||
    !completedBars.length ||
    market.daily.length < 3 ||
    !finite(forecast.adjustment?.directionBps) ||
    !finite(forecast.adjustment?.rangeMultiplier)
  ) return null;

  const daily = market.daily.slice(-4);
  const closes = completedBars.map((bar) => bar.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  // Finnhub's free quote can remain at the prior close during premarket. Use it
  // only when both provider-observed and fetched timestamps are fresh;
  // otherwise the latest completed Yahoo premarket candle is authoritative.
  const reference = quoteProviderFresh && finite(market.price)
    ? market.price
    : closes.at(-1) ?? null;
  if (!finite(reference)) return null;
  const high = Math.max(...daily.map((row) => row.high));
  const low = Math.min(...daily.map((row) => row.low));
  const close = daily.at(-1)!.close;
  const blockPivot = (high + low + close) / 3;
  const recencyWeights = daily.map((_, index) => index + 1);
  const weightedPivot = daily.reduce(
    (sum, row, index) =>
      sum + ((row.high + row.low + row.close) / 3) * recencyWeights[index],
    0,
  ) / recencyWeights.reduce((sum, value) => sum + value, 0);
  const lowerThird = low + (high - low) / 3;
  const upperThird = low + (2 * (high - low)) / 3;
  const fast = ema9.at(-1) ?? reference;
  const slow = ema21.at(-1) ?? reference;
  const slope = fast - (ema9.at(-4) ?? fast);
  const openingAnchor = quoteProviderFresh && finite(market.premarket.current)
    ? market.premarket.current
    : reference;

  const analysis = computeOpeningAnalysis({
    daily: market.daily,
    targetDate: market.targetDate,
    previousClose: market.previousClose,
    referencePrice: reference,
    openingReferencePrice: openingAnchor,
    premarketHigh: market.premarket.high,
    premarketLow: market.premarket.low,
    premarketCurrent: openingAnchor,
    rangeLow: low,
    lowerThird,
    upperThird,
    rangeHigh: high,
    pivotLow: Math.min(blockPivot, weightedPivot),
    pivotHigh: Math.max(blockPivot, weightedPivot),
    ema9: fast,
    ema21: slow,
    ema9Slope: slope,
    historicalFirstMinuteRanges: market.firstMinuteHistory.map((item) => item.range),
    historicalFirstMinuteVolumes: market.firstMinuteHistory.map((item) => item.volume),
    firstMinuteClose: market.firstMinute.close,
    firstMinuteVolume: market.firstMinute.volume,
    firstMinuteComplete: market.firstMinute.complete,
    targetSessionEvidence: true,
  });
  if (analysis.opening.median == null || analysis.opening.low == null || analysis.opening.high == null) return null;
  const adjusted = applyForecastAdjustment(
    {
      median: analysis.opening.median,
      low: analysis.opening.low,
      high: analysis.opening.high,
    },
    forecast.adjustment,
  );
  if (![adjusted.median, adjusted.low, adjusted.high].every(finite)) return null;

  const modelVersion = forecast.methodology?.version ?? "open-research-v2";
  const factors = forecast.contributions ?? [];
  const snapshot: ScheduledSnapshot = {
    targetDate: market.targetDate,
    intervalLabel,
    capturedAt,
    baseMedian: analysis.opening.median,
    adjustedMedian: adjusted.median,
    adjustedLow: adjusted.low,
    adjustedHigh: adjusted.high,
    factorsJson: JSON.stringify({
      modelVersion,
      capturedAt,
      actionableCutoffAt: actionableMooFreezeAt(market.targetDate),
      actionable: false,
      strategy: "OPEN_RESEARCH_BASELINE",
      decisionUse: "NON_ACTIONABLE_UNTIL_A_SEPARATE_MOO_MODEL_IS_VALIDATED",
      sourceCheckedAt: forecast.flag?.updatedAt ?? null,
      captureMode: "cloudflare_cron",
      factors,
    }),
  };
  return {
    snapshot,
    // computeOpeningAnalysis is the legacy 09:31 confirmation workflow. Its
    // heuristic movement and LOW/MODERATE labels are not calibrated MOO
    // confidence, so this scheduled pre-open path stores research snapshots
    // only and cannot manufacture an actionable Library plan.
    plan: null,
  };
}

async function responseJson<T>(response: Response, label: string) {
  if (!response.ok) throw new Error(`${label} returned ${response.status}`);
  return (await response.json()) as T;
}

export async function runScheduledCapture(input: {
  scheduledTime: number;
  nowMs?: number;
  fetchApp(path: string): Promise<Response>;
  store: ScheduledCaptureStore;
}): Promise<ScheduledCaptureResult> {
  const phase = scheduledCapturePhase(input.scheduledTime);
  const checkpoint = scheduledCaptureCheckpoint(input.scheduledTime);
  if (!phase) return { phase, status: "skipped", reason: "outside Eastern capture windows" };
  const startedAt = input.nowMs ?? Date.now();
  let targetDate: string | null = null;
  const finish = async (result: ScheduledCaptureResult) => {
    await input.store.recordRun?.({
      scheduledAt: input.scheduledTime,
      startedAt,
      completedAt: input.nowMs ?? Date.now(),
      phase,
      checkpoint: checkpoint as ScheduledInterval | "OUTCOME",
      status: result.status,
      targetDate: result.targetDate ?? targetDate,
      detailCode: result.reasonCode ?? null,
      detail: result.reason ?? null,
    });
    return result;
  };
  const scheduleDelayMs = startedAt - input.scheduledTime;
  if (scheduleDelayMs > MAX_SCHEDULED_CAPTURE_DELAY_MS) {
    return finish({
      phase,
      status: "skipped",
      targetDate: easternDate(input.scheduledTime),
      reasonCode: "SCHEDULED_INVOCATION_TOO_LATE",
      reason: "scheduled capture started too late for point-in-time evidence",
    });
  }
  if (scheduleDelayMs < -30_000) {
    return finish({
      phase,
      status: "skipped",
      targetDate: easternDate(input.scheduledTime),
      reasonCode: "SCHEDULED_INVOCATION_FUTURE_SKEW",
      reason: "scheduled capture time is ahead of the worker clock",
    });
  }
  const scheduledSessionDate = easternDate(input.scheduledTime);
  if (checkpoint === "T-5M" && startedAt > actionableMooFreezeAt(scheduledSessionDate)) {
    return finish({
      phase,
      status: "skipped",
      targetDate: scheduledSessionDate,
      reasonCode: "ACTIONABLE_FREEZE_CUTOFF_PASSED",
      reason: "the actionable MOO evidence cutoff has passed",
    });
  }
  try {
    const marketView = checkpoint === "T-5M" ? "&view=DECISION_FREEZE" : "";
    const market = await responseJson<MarketPayload>(
      await input.fetchApp(`/api/market?symbol=NVDA&automation=${input.scheduledTime}${marketView}`),
      "Market endpoint",
    );
    targetDate = market.targetDate;
    if (targetDate !== easternDate(startedAt)) {
      return finish({
        phase,
        status: "skipped",
        targetDate,
        reasonCode: "TARGET_SESSION_MISMATCH",
        reason: "not a current U.S. market session",
      });
    }

    if (phase === "outcome") {
      if (market.session !== "MARKET OPEN") {
        return finish({
          phase,
          status: "skipped",
          targetDate,
          reasonCode: "REGULAR_MARKET_NOT_OPEN",
          reason: "regular market is not open",
        });
      }
      if (market.marketContract) {
        await input.store.saveMarketCheckpoint?.({
          envelope: market.marketContract,
          analysisBars: market.analysisBars ?? market.bars,
          checkpoint: "OUTCOME",
          capturedAt: input.nowMs ?? Date.now(),
        });
      }
      // market.day.open is a regular-bar/day-open field, not the Nasdaq
      // Official Opening Cross. Preserve the distinction and leave the
      // official opening outcome pending until an entitled cross source is
      // integrated.
      const actualOpen = null;
      const firstMinuteClose = market.firstMinute.complete && finite(market.firstMinute.close)
        ? market.firstMinute.close
        : null;
      if (firstMinuteClose == null) {
        return finish({
          phase,
          status: "skipped",
          targetDate,
          reasonCode: "OPENING_OUTCOME_PENDING",
          reason: "opening outcome is not published yet",
        });
      }
      const changedRows = await input.store.attachOutcome({
        targetDate,
        actualOpen,
        firstMinuteClose,
        capturedAt: input.nowMs ?? Date.now(),
      });
      if (changedRows === 0) {
        return finish({
          phase,
          status: "skipped",
          targetDate,
          reasonCode: "NO_PREOPEN_ARTIFACT_FOR_OUTCOME",
          reason: "no pre-open snapshot or Library plan exists to receive the outcome",
        });
      }
      return finish({ phase, status: "outcome_attached", targetDate });
    }

    if (market.session !== "PREMARKET") {
      return finish({
        phase,
        status: "skipped",
        targetDate,
        reasonCode: "TARGET_NOT_PREMARKET",
        reason: "target session is not in premarket",
      });
    }
    if (market.marketContract) {
      await input.store.saveMarketCheckpoint?.({
        envelope: market.marketContract,
        analysisBars: market.analysisBars ?? market.bars,
        checkpoint: checkpoint as ScheduledInterval,
        capturedAt: input.nowMs ?? Date.now(),
      });
    }
    // A successful GET writes the monotonic forecast_preopen_freezes row. It is
    // intentionally invoked on every admitted minute so the last successful
    // request before 09:30 becomes the immutable post-open forecast block.
    const forecast = await responseJson<ForecastPayload>(
      await input.fetchApp(`/api/forecast?targetDate=${encodeURIComponent(targetDate)}&automation=${input.scheduledTime}`),
      "Forecast endpoint",
    );
    const captureAt = input.nowMs ?? Date.now();
    const capture = buildScheduledPreopenCapture(
      market,
      forecast,
      captureAt,
      checkpoint as ScheduledInterval,
    );
    if (!capture) {
      return finish({
        phase,
        status: "freeze_only",
        targetDate,
        reasonCode: "POINT_IN_TIME_MARKET_GATES_FAILED",
        reason: `forecast froze, but the ${checkpoint} snapshot failed point-in-time market-data gates`,
      });
    }
    await input.store.savePreopen(capture.plan, capture.snapshot);
    return finish({ phase, status: "captured", targetDate });
  } catch (error) {
    await input.store.recordRun?.({
      scheduledAt: input.scheduledTime,
      startedAt,
      completedAt: input.nowMs ?? Date.now(),
      phase,
      checkpoint: checkpoint as ScheduledInterval | "OUTCOME",
      status: "failed",
      targetDate,
      detailCode: "SCHEDULED_CAPTURE_FAILED",
      detail: error instanceof Error ? error.message.slice(0, 500) : "unknown scheduled capture failure",
    });
    throw error;
  }
}

const createLibraryTableSql = `CREATE TABLE IF NOT EXISTS library_plans (
  date TEXT PRIMARY KEY NOT NULL,
  strategy_kind TEXT NOT NULL DEFAULT 'LEGACY_931_CONFIRMATION',
  signal TEXT NOT NULL CHECK (signal IN ('LONG', 'SHORT', 'WAIT')),
  open_range_low REAL NOT NULL,
  open_range_high REAL NOT NULL,
  entry REAL,
  stop REAL,
  target REAL,
  expected_move REAL NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  actual_open REAL,
  actual_open_source TEXT,
  first_minute_close REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const createSnapshotTableSql = `CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  target_date TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  interval_label TEXT NOT NULL,
  base_median REAL NOT NULL,
  adjusted_median REAL NOT NULL,
  adjusted_low REAL NOT NULL,
  adjusted_high REAL NOT NULL,
  factors_json TEXT NOT NULL,
  actual_open REAL,
  median_error REAL,
  first_minute_close REAL,
  first_minute_error REAL,
  outcome_captured_at INTEGER
)`;

const createAutomationHealthTableSql = `CREATE TABLE IF NOT EXISTS automation_capture_health (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  last_attempt_at INTEGER NOT NULL,
  last_success_at INTEGER,
  last_preopen_at INTEGER,
  last_outcome_at INTEGER,
  scheduled_at INTEGER NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  target_date TEXT,
  detail TEXT
)`;

export function createD1ScheduledCaptureStore(database: D1Database): ScheduledCaptureStore {
  const marketStore = createMarketStore(database);
  const ensure = async () => {
    await database.batch([
      database.prepare(createLibraryTableSql),
      database.prepare("CREATE INDEX IF NOT EXISTS library_plans_date_idx ON library_plans (date DESC)"),
      database.prepare(createSnapshotTableSql),
      database.prepare("CREATE UNIQUE INDEX IF NOT EXISTS forecast_snapshots_target_interval_idx ON forecast_snapshots (target_date, interval_label)"),
      database.prepare(createAutomationHealthTableSql),
    ]);
    await ensureMooSafetySchemaOnce(database);
    await ensureForecastSnapshotOutcomeColumns(database);
    await ensureMarketPersistenceSchema(database);
  };
  return {
    async saveMarketCheckpoint(input) {
      await marketStore.saveScheduledCheckpoint(input);
    },
    async savePreopen(plan, snapshot) {
      await ensure();
      const statements = [
        database
          .prepare(`INSERT INTO forecast_snapshots (
            target_date,captured_at,interval_label,base_median,adjusted_median,
            adjusted_low,adjusted_high,factors_json,actual_open,median_error
          ) VALUES (?,?,?,?,?,?,?,?,NULL,NULL)
          ON CONFLICT(target_date,interval_label) DO NOTHING`)
          .bind(
            snapshot.targetDate,
            snapshot.capturedAt,
            snapshot.intervalLabel,
            snapshot.baseMedian,
            snapshot.adjustedMedian,
            snapshot.adjustedLow,
            snapshot.adjustedHigh,
            snapshot.factorsJson,
          ),
      ];
      if (plan) statements.push(
        database
          .prepare(`INSERT INTO library_plans (
            date,strategy_kind,signal,open_range_low,open_range_high,entry,stop,target,
            expected_move,confidence,rationale,actual_open,actual_open_source,first_minute_close,
            created_at,updated_at
          ) VALUES (?,'LEGACY_931_CONFIRMATION',?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?)
          ON CONFLICT(date) DO NOTHING`)
          .bind(
            plan.date,
            plan.signal,
            plan.openRangeLow,
            plan.openRangeHigh,
            plan.entry,
            plan.stop,
            plan.target,
            plan.expectedMove,
            plan.confidence,
            plan.rationale,
            snapshot.capturedAt,
            snapshot.capturedAt,
          ),
      );
      await database.batch(statements);
    },
    async attachOutcome({ targetDate, actualOpen, firstMinuteClose, capturedAt }) {
      await ensure();
      const statements = [
        database
          .prepare(`UPDATE library_plans SET
            actual_open=COALESCE(actual_open,?),
            first_minute_close=COALESCE(first_minute_close,?),
            updated_at=?
          WHERE date=? AND (
            (? IS NOT NULL AND actual_open IS NULL) OR
            (? IS NOT NULL AND first_minute_close IS NULL)
          )`)
          .bind(
            actualOpen,
            firstMinuteClose,
            capturedAt,
            targetDate,
            actualOpen,
            firstMinuteClose,
          ),
        database
          .prepare(`UPDATE forecast_snapshots SET
            actual_open=COALESCE(actual_open,?),
            median_error=COALESCE(
              median_error,
              CASE WHEN ? IS NULL THEN NULL ELSE ABS(?-adjusted_median) END
            ),
            first_minute_close=COALESCE(first_minute_close,?),
            first_minute_error=COALESCE(
              first_minute_error,
              CASE WHEN ? IS NULL THEN NULL ELSE ABS(?-adjusted_median) END
            ),
            outcome_captured_at=COALESCE(outcome_captured_at,?)
          WHERE target_date=? AND (
            (? IS NOT NULL AND actual_open IS NULL) OR
            (? IS NOT NULL AND first_minute_close IS NULL)
          )`)
          .bind(
            actualOpen,
            actualOpen,
            actualOpen,
            firstMinuteClose,
            firstMinuteClose,
            firstMinuteClose,
            capturedAt,
            targetDate,
            actualOpen,
            firstMinuteClose,
          ),
      ];
      const results = await database.batch(statements);
      return results.reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0);
    },
    async recordRun({
      scheduledAt,
      startedAt,
      completedAt,
      phase,
      checkpoint,
      status,
      targetDate,
      detailCode,
      detail,
    }) {
      await ensure();
      const successful = status === "captured" || status === "outcome_attached" || status === "freeze_only";
      const transportSucceeded = status !== "failed" &&
        detailCode !== "SCHEDULED_INVOCATION_TOO_LATE" &&
        detailCode !== "SCHEDULED_INVOCATION_FUTURE_SKEW";
      const snapshotSucceeded = status === "captured" || status === "outcome_attached";
      const freezeSucceeded = status === "captured" || status === "freeze_only";
      const jobKey = `NVDA:${easternDate(scheduledAt)}:${checkpoint}:${scheduledAt}`;
      const runId = `${jobKey}:${status}`;
      const appendRun = database
        .prepare(`INSERT INTO scheduler_runs (
          run_id,job_key,scheduled_at,started_at,completed_at,phase,checkpoint,
          status,target_date,transport_succeeded,snapshot_succeeded,freeze_succeeded,
          detail_code,detail,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(run_id) DO NOTHING`)
        .bind(
          runId,
          jobKey,
          scheduledAt,
          startedAt,
          completedAt,
          phase,
          checkpoint,
          status,
          targetDate,
          transportSucceeded ? 1 : 0,
          snapshotSucceeded ? 1 : 0,
          freezeSucceeded ? 1 : 0,
          detailCode,
          detail,
          completedAt,
        );
      const updateLegacyHealth = database
        .prepare(`INSERT INTO automation_capture_health (
          id,last_attempt_at,last_success_at,last_preopen_at,last_outcome_at,
          scheduled_at,phase,status,target_date,detail
        ) VALUES (1,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          last_attempt_at=excluded.last_attempt_at,
          last_success_at=COALESCE(excluded.last_success_at,automation_capture_health.last_success_at),
          last_preopen_at=COALESCE(excluded.last_preopen_at,automation_capture_health.last_preopen_at),
          last_outcome_at=COALESCE(excluded.last_outcome_at,automation_capture_health.last_outcome_at),
          scheduled_at=excluded.scheduled_at,
          phase=excluded.phase,
          status=excluded.status,
          target_date=excluded.target_date,
          detail=excluded.detail
        WHERE excluded.last_attempt_at >= automation_capture_health.last_attempt_at`)
        .bind(
          completedAt,
          successful ? completedAt : null,
          phase === "preopen" && successful ? completedAt : null,
          phase === "outcome" && status === "outcome_attached" ? completedAt : null,
          scheduledAt,
          phase,
          status,
          targetDate,
          detail,
        );
      await database.batch([appendRun, updateLegacyHealth]);
    },
  };
}
