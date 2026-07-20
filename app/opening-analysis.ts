/**
 * Deterministic, educational opening-plan calculations for NVDA.
 *
 * This module deliberately does not forecast with a statistical/AI model. Every
 * output is derived from the supplied market observations and includes the
 * evidence used to reach it. Prices are indicative until verified with a broker.
 */

export type Direction = "UP" | "DOWN" | "MIXED";
export type PositionSide = "LONG" | "SHORT" | "WAIT";

export type DailyObservation = {
  /** ISO session date when available. Required for target-date leakage guards. */
  date?: string;
  /** Optional provider-normalized ISO key when `date` is display-formatted. */
  dateKey?: string;
  open?: number;
  high: number;
  low: number;
  close: number;
};

export type OpeningAnalysisInput = {
  daily: DailyObservation[];
  /** Target session in YYYY-MM-DD form. Rows on/after it are never consumed. */
  targetDate?: string;
  previousClose: number | null;
  referencePrice: number | null;
  premarketHigh: number | null;
  premarketLow: number | null;
  /** Optional live premarket price; referencePrice is used when omitted. */
  premarketCurrent?: number | null;
  /** Point-in-time anchor reserved for estimating the open after live trading starts. */
  openingReferencePrice?: number | null;
  rangeLow: number;
  lowerThird: number;
  upperThird: number;
  rangeHigh: number;
  pivotLow: number;
  pivotHigh: number;
  ema9: number | null;
  ema21: number | null;
  /** Current EMA 9 minus an earlier EMA 9 observation. */
  ema9Slope: number | null;
  historicalFirstMinuteRanges?: number[];
  historicalFirstMinuteVolumes?: number[];
  firstMinuteClose?: number | null;
  firstMinuteVolume?: number | null;
  /**
   * True only after the data provider has finalized the 9:30-9:31 ET candle.
   * A close/volume value can exist while that candle is still forming.
   */
  firstMinuteComplete?: boolean;
  /**
   * True only when the target session itself has supplied a qualified bar.
   * Prior-session bars may inform context, but they must never create an order.
   */
  targetSessionEvidence?: boolean;
};

export type OpeningAnalysis = {
  opening: {
    median: number | null;
    low: number | null;
    high: number | null;
    baseHalfWidth: number | null;
    historicalGapSample: number;
    coverageState: "UNCALIBRATED_PROXY";
    method:
      | "HISTORICAL_OVERNIGHT_GAP"
      | "PREMARKET_RANGE"
      | "DAILY_RANGE_FALLBACK"
      | "PRICE_FLOOR_FALLBACK"
      | "UNAVAILABLE";
    rationale: string;
    basis: string;
  };
  scalp: {
    direction: Direction;
    expectedMoveLow: number | null;
    expectedMoveHigh: number | null;
    description: string;
  };
  plan: {
    side: PositionSide;
    entry: number | null;
    stop: number | null;
    target: number | null;
    confidence: "LOW" | "MODERATE";
    status:
      | "PREOPEN"
      | "AWAITING_931"
      | "FORMING_931"
      | "CONFIRMED"
      | "REJECTED"
      | "LOW_VOLUME"
      | "INSUFFICIENT_TARGET_SESSION";
    volumeRatio: number | null;
    zone: "LOWER THIRD" | "MIDDLE THIRD" | "UPPER THIRD" | "UNKNOWN";
    evidence: string[];
    invalidation: string;
  };
};

const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const roundPrice = (value: number) => Math.round(value * 100) / 100;

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const percentile = (values: number[], p: number) => {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
};

const between = (value: number, low: number, high: number) =>
  value >= Math.min(low, high) && value <= Math.max(low, high);

const ISO_SESSION_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MINIMUM_GAP_SAMPLE = 5;

const sessionDate = (day: DailyObservation) =>
  typeof day.dateKey === "string" && ISO_SESSION_DATE.test(day.dateKey)
    ? day.dateKey
    : typeof day.date === "string" && ISO_SESSION_DATE.test(day.date)
      ? day.date
      : null;

function priorChronologicalDaily(
  daily: DailyObservation[],
  targetDate: string | undefined,
) {
  const hasTargetCutoff = typeof targetDate === "string" && ISO_SESSION_DATE.test(targetDate);
  const rows = daily
    .map((day, suppliedIndex) => ({ day, suppliedIndex }))
    .filter(({ day }) => {
      if (!hasTargetCutoff) return true;
      // Undated rows cannot be proven point-in-time safe for a dated target.
      const date = sessionDate(day);
      return date != null && date < targetDate!;
    });

  if (rows.every(({ day }) => sessionDate(day) != null)) {
    rows.sort((a, b) => sessionDate(a.day)!.localeCompare(sessionDate(b.day)!) || a.suppliedIndex - b.suppliedIndex);
  }
  return rows.map(({ day }) => day);
}

function historicalOvernightGapRates(daily: DailyObservation[]) {
  const rates: number[] = [];
  for (let index = 1; index < daily.length; index += 1) {
    const prior = daily[index - 1];
    const current = daily[index];
    const priorDate = sessionDate(prior);
    const currentDate = sessionDate(current);
    const interveningWeekdays = priorDate && currentDate
      ? countWeekdaysBetween(priorDate, currentDate)
      : Number.POSITIVE_INFINITY;
    if (
      priorDate == null ||
      currentDate == null ||
      currentDate <= priorDate ||
      interveningWeekdays !== 0 ||
      !finite(prior.close) ||
      prior.close <= 0 ||
      !finite(current.open)
    ) continue;
    rates.push(Math.abs(current.open / prior.close - 1));
  }
  return rates;
}

function countWeekdaysBetween(start: string, end: string) {
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let weekdays = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor < last) {
    if (![0, 6].includes(cursor.getUTCDay())) weekdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weekdays;
}

export function computeOpeningAnalysis(input: OpeningAnalysisInput): OpeningAnalysis {
  const eligibleDaily = priorChronologicalDaily(input.daily, input.targetDate);
  const recent = eligibleDaily.slice(-10);
  const typicalDailyRange = median(
    recent.map((day) => Math.max(0, day.high - day.low)),
  );
  const reference = finite(input.openingReferencePrice)
    ? input.openingReferencePrice
    : finite(input.premarketCurrent)
    ? input.premarketCurrent
    : input.referencePrice;
  const hasPremarketRange =
    finite(input.premarketHigh) &&
    finite(input.premarketLow) &&
    input.premarketHigh >= input.premarketLow;

  // The current premarket quote receives the most weight; its midpoint and the
  // prior close stabilize a stale or thin premarket print.
  const anchors: Array<{ value: number; weight: number }> = [];
  if (finite(reference)) anchors.push({ value: reference, weight: 0.55 });
  if (hasPremarketRange) {
    anchors.push({
      value: (input.premarketHigh! + input.premarketLow!) / 2,
      weight: 0.3,
    });
  }
  if (finite(input.previousClose)) anchors.push({ value: input.previousClose, weight: 0.15 });
  const weightTotal = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  const openingMedian = weightTotal
    ? anchors.reduce((sum, anchor) => sum + anchor.value * anchor.weight, 0) / weightTotal
    : null;

  const premarketRange = hasPremarketRange
    ? input.premarketHigh! - input.premarketLow!
    : null;
  // The band is an uncalibrated uncertainty proxy, not a confidence interval. When at
  // least five point-in-time-safe session pairs expose an official open, use
  // the 75th percentile absolute overnight gap, scaled to the current median.
  // Premarket dispersion remains an independent widening component. The old
  // daily-range heuristic remains only as a transparent insufficient-data
  // fallback.
  const historicalGapRates = historicalOvernightGapRates(eligibleDaily);
  const historicalGapRate = historicalGapRates.length >= MINIMUM_GAP_SAMPLE
    ? percentile(historicalGapRates, 0.75)
    : null;
  const priceFloorHalfWidth = finite(openingMedian) ? openingMedian * 0.0005 : null;
  const premarketHalfWidth = premarketRange == null ? null : premarketRange * 0.15;
  const historicalGapHalfWidth = finite(openingMedian) && finite(historicalGapRate)
    ? openingMedian * historicalGapRate
    : null;
  const dailyRangeFallbackHalfWidth = typicalDailyRange == null
    ? null
    : typicalDailyRange * 0.015;
  const candidates = [
    priceFloorHalfWidth,
    premarketHalfWidth,
    historicalGapHalfWidth ?? dailyRangeFallbackHalfWidth,
  ].filter(finite);
  const openingHalfWidth = finite(openingMedian) && candidates.length
    ? Math.max(...candidates)
    : null;
  const openingMethod: OpeningAnalysis["opening"]["method"] = !finite(openingHalfWidth)
    ? "UNAVAILABLE"
    : finite(historicalGapHalfWidth) && openingHalfWidth === historicalGapHalfWidth
      ? "HISTORICAL_OVERNIGHT_GAP"
      : finite(premarketHalfWidth) && openingHalfWidth === premarketHalfWidth
        ? "PREMARKET_RANGE"
        : finite(dailyRangeFallbackHalfWidth) && openingHalfWidth === dailyRangeFallbackHalfWidth
          ? "DAILY_RANGE_FALLBACK"
          : "PRICE_FLOOR_FALLBACK";
  const openingRationale = finite(historicalGapHalfWidth)
    ? `Uncalibrated proxy band uses the wider of current premarket dispersion and the 75th-percentile absolute overnight gap from ${historicalGapRates.length} adjacent weekday session pairs; ${input.targetDate ? "rows on or after the target date are excluded" : "the supplied history is treated as prior-session data"}. It is not empirical coverage for the blended median estimator.`
    : `Only ${historicalGapRates.length} point-in-time-safe overnight gap pair${historicalGapRates.length === 1 ? "" : "s"} were available; at least ${MINIMUM_GAP_SAMPLE} are required, so the band falls back to observed premarket dispersion, recent daily range, and a minimum price floor.`;

  // The premarket reference anchors the expected-open estimate. Once live
  // trading begins, position state must use the current reference price rather
  // than remaining pinned to the final premarket candle.
  const price = finite(input.referencePrice)
    ? input.referencePrice
    : finite(reference)
      ? reference
      : openingMedian;
  const zone = !finite(price)
    ? "UNKNOWN"
    : price < input.lowerThird
      ? "LOWER THIRD"
      : price > input.upperThird
        ? "UPPER THIRD"
        : "MIDDLE THIRD";

  const emaBull =
    finite(price) &&
    finite(input.ema9) &&
    finite(input.ema21) &&
    price > input.ema9 &&
    input.ema9 > input.ema21 &&
    finite(input.ema9Slope) &&
    input.ema9Slope > 0;
  const emaBear =
    finite(price) &&
    finite(input.ema9) &&
    finite(input.ema21) &&
    price < input.ema9 &&
    input.ema9 < input.ema21 &&
    finite(input.ema9Slope) &&
    input.ema9Slope < 0;
  const abovePivot = finite(price) && price > input.pivotHigh;
  const belowPivot = finite(price) && price < input.pivotLow;
  const inPivot = finite(price) && between(price, input.pivotLow, input.pivotHigh);

  let side: PositionSide = "WAIT";
  if (zone === "UPPER THIRD" && abovePivot && emaBull) side = "LONG";
  if (zone === "LOWER THIRD" && belowPivot && emaBear) side = "SHORT";

  // Require room to the outer structural boundary; otherwise reward is zero.
  if (side === "LONG" && finite(price) && Math.max(price, input.upperThird, input.pivotHigh) >= input.rangeHigh) side = "WAIT";
  if (side === "SHORT" && finite(price) && Math.min(price, input.lowerThird, input.pivotLow) <= input.rangeLow) side = "WAIT";

  // Directional setup state requires an affirmative point-in-time assertion.
  // Omission must fail closed so a new caller cannot accidentally promote
  // prior-session context into a target-session setup.
  const hasTargetSessionEvidence = input.targetSessionEvidence === true;
  if (!hasTargetSessionEvidence) side = "WAIT";
  const setupSide = side;
  // Prefer actual NVDA 9:30-9:31 ranges. Fall back to a transparent range
  // heuristic only when the historical opening sample is unavailable.
  const historicalRanges = input.historicalFirstMinuteRanges ?? [];
  const historicalMoveLow = historicalRanges.length >= 3 ? percentile(historicalRanges, 0.25) : null;
  const historicalMoveHigh = historicalRanges.length >= 3 ? percentile(historicalRanges, 0.75) : null;
  const fallbackMoveLow = typicalDailyRange == null && premarketRange == null
    ? null
    : Math.max((typicalDailyRange ?? 0) * 0.015, (premarketRange ?? 0) * 0.05);
  const fallbackMoveHigh = typicalDailyRange == null && premarketRange == null
    ? null
    : Math.max((typicalDailyRange ?? 0) * 0.035, (premarketRange ?? 0) * 0.1);
  const moveLow = historicalMoveLow ?? fallbackMoveLow;
  const moveHigh = historicalMoveHigh ?? fallbackMoveHigh;

  const riskUnit = finite(price)
    ? Math.max(price * 0.0015, (moveHigh ?? price * 0.002) * 0.65)
    : null;
  const setupEntry = setupSide === "WAIT" || !finite(price)
    ? null
    : setupSide === "LONG"
      ? Math.max(price, input.upperThird, input.pivotHigh)
      : Math.min(price, input.lowerThird, input.pivotLow);
  const typicalOpeningVolume = median(input.historicalFirstMinuteVolumes ?? []);
  const firstMinuteComplete = input.firstMinuteComplete === true;
  // Never compare or confirm using partial 9:30 candle volume. A provider may
  // expose close and volume fields before the one-minute bar is finalized.
  const volumeRatio = firstMinuteComplete && finite(input.firstMinuteVolume) && finite(typicalOpeningVolume) && typicalOpeningVolume > 0
    ? input.firstMinuteVolume / typicalOpeningVolume
    : null;
  let status: OpeningAnalysis["plan"]["status"] = "PREOPEN";
  if (!hasTargetSessionEvidence) status = "INSUFFICIENT_TARGET_SESSION";
  if (setupSide !== "WAIT") status = "AWAITING_931";
  if (setupSide !== "WAIT" && finite(input.firstMinuteClose) && !firstMinuteComplete) {
    status = "FORMING_931";
  }
  if (
    setupSide !== "WAIT" &&
    firstMinuteComplete &&
    finite(input.firstMinuteClose) &&
    finite(setupEntry)
  ) {
    const held = setupSide === "LONG" ? input.firstMinuteClose >= setupEntry : input.firstMinuteClose <= setupEntry;
    if (!held) { side = "WAIT"; status = "REJECTED"; }
    else if (finite(volumeRatio) && volumeRatio < 0.65) { side = "WAIT"; status = "LOW_VOLUME"; }
    else status = "CONFIRMED";
  }
  const entry = side === "WAIT" ? null : setupEntry;
  const direction: Direction = side === "LONG" ? "UP" : side === "SHORT" ? "DOWN" : "MIXED";
  const stop = finite(entry) && finite(riskUnit)
    ? side === "LONG"
      ? Math.min(entry - 0.01, Math.max(input.upperThird - riskUnit * 0.15, entry - riskUnit))
      : Math.max(entry + 0.01, Math.min(input.lowerThird + riskUnit * 0.15, entry + riskUnit))
    : null;
  const actualRisk = finite(entry) && finite(stop) ? Math.abs(entry - stop) : null;
  const target = finite(entry) && finite(actualRisk)
    ? side === "LONG"
      ? Math.min(input.rangeHigh, entry + actualRisk * 1.5)
      : Math.max(input.rangeLow, entry - actualRisk * 1.5)
    : null;

  const evidence = [
    `${zone === "UNKNOWN" ? "Price zone unavailable" : `Reference price is in the ${zone.toLowerCase()}`}.`,
    inPivot
      ? "Price is inside the pivot cluster, where rotation risk is elevated."
      : abovePivot
        ? "Price is above the pivot cluster."
        : belowPivot
          ? "Price is below the pivot cluster."
          : "Pivot relationship is unavailable.",
    emaBull
      ? "Price, EMA 9, EMA 21, and EMA 9 slope are aligned upward."
      : emaBear
        ? "Price, EMA 9, EMA 21, and EMA 9 slope are aligned downward."
        : "EMA structure is mixed or incomplete; directional confirmation is absent.",
    historicalRanges.length >= 3
      ? `Opening movement uses ${historicalRanges.length} prior NVDA first-minute candles.`
      : "Opening movement uses the daily/premarket range fallback because fewer than three prior first-minute candles are available.",
    !firstMinuteComplete
      ? finite(input.firstMinuteClose)
        ? "The 9:30–9:31 candle is still forming; its close and volume cannot confirm a position."
        : "First-minute confirmation is waiting for a completed 9:30–9:31 candle."
      : finite(volumeRatio)
        ? `First-minute volume is ${volumeRatio.toFixed(2)}x its recent opening median.`
        : "The completed first-minute candle has no usable historical volume baseline.",
    hasTargetSessionEvidence
      ? "The setup uses target-session observations."
      : "No qualified target-session bar exists; prior-session structure is context only and the position is forced to WAIT.",
  ];

  const alignedSignals = [zone !== "MIDDLE THIRD" && zone !== "UNKNOWN", !inPivot, emaBull || emaBear]
    .filter(Boolean).length;

  return {
    opening: {
      median: finite(openingMedian) ? roundPrice(openingMedian) : null,
      low: finite(openingMedian) && finite(openingHalfWidth) ? roundPrice(openingMedian - openingHalfWidth) : null,
      high: finite(openingMedian) && finite(openingHalfWidth) ? roundPrice(openingMedian + openingHalfWidth) : null,
      baseHalfWidth: finite(openingHalfWidth) ? roundPrice(openingHalfWidth) : null,
      historicalGapSample: historicalGapRates.length,
      coverageState: "UNCALIBRATED_PROXY",
      method: openingMethod,
      rationale: openingRationale,
      basis: "Median blends current/premarket reference (55%), premarket midpoint (30%), and prior close (15%) when available. Width is an explicitly uncalibrated proxy using adjacent-session gap magnitude until horizon-matched residual coverage is collected.",
    },
    scalp: {
      direction,
      expectedMoveLow: finite(moveLow) ? roundPrice(moveLow) : null,
      expectedMoveHigh: finite(moveHigh) ? roundPrice(moveHigh) : null,
      description: direction === "MIXED"
        ? "No aligned one-minute opening direction. Wait for a completed candle to hold outside the pivot cluster with EMA confirmation."
        : `${direction} is the conditional opening bias while the thirds, pivot, and EMA alignment remain intact.`,
    },
    plan: {
      side,
      entry: finite(entry) ? roundPrice(entry) : null,
      stop: finite(stop) ? roundPrice(stop) : null,
      target: finite(target) ? roundPrice(target) : null,
      confidence: side !== "WAIT" && alignedSignals === 3 ? "MODERATE" : "LOW",
      status,
      volumeRatio: finite(volumeRatio) ? Math.round(volumeRatio * 100) / 100 : null,
      zone,
      evidence,
      invalidation: side === "LONG"
        ? "Invalid if a completed one-minute candle loses the upper-third boundary or EMA alignment turns mixed."
        : side === "SHORT"
          ? "Invalid if a completed one-minute candle reclaims the lower-third boundary or EMA alignment turns mixed."
          : "No position until price leaves equilibrium and thirds, pivot, and EMA evidence align.",
    },
  };
}
