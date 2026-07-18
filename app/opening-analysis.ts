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
  high: number;
  low: number;
  close: number;
};

export type OpeningAnalysisInput = {
  daily: DailyObservation[];
  previousClose: number | null;
  referencePrice: number | null;
  premarketHigh: number | null;
  premarketLow: number | null;
  /** Optional live premarket price; referencePrice is used when omitted. */
  premarketCurrent?: number | null;
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
};

export type OpeningAnalysis = {
  opening: {
    median: number | null;
    low: number | null;
    high: number | null;
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

const between = (value: number, low: number, high: number) =>
  value >= Math.min(low, high) && value <= Math.max(low, high);

export function computeOpeningAnalysis(input: OpeningAnalysisInput): OpeningAnalysis {
  const recent = input.daily.slice(-10);
  const typicalDailyRange = median(
    recent.map((day) => Math.max(0, day.high - day.low)),
  );
  const reference = finite(input.premarketCurrent)
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
  // The band is an uncertainty display, not a confidence interval. It combines
  // 15% of observed premarket range with 1.5% of typical daily range.
  const openingHalfWidth = finite(openingMedian)
    ? Math.max(
        openingMedian * 0.0005,
        (premarketRange ?? 0) * 0.15,
        (typicalDailyRange ?? 0) * 0.015,
      )
    : null;

  const price = finite(reference) ? reference : openingMedian;
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

  const direction: Direction = side === "LONG" ? "UP" : side === "SHORT" ? "DOWN" : "MIXED";
  // Opening one-minute movement is displayed as a historical-range heuristic:
  // 1.5%-3.5% of typical daily range, widened by 5%-10% of premarket range.
  const moveLow = typicalDailyRange == null && premarketRange == null
    ? null
    : Math.max((typicalDailyRange ?? 0) * 0.015, (premarketRange ?? 0) * 0.05);
  const moveHigh = typicalDailyRange == null && premarketRange == null
    ? null
    : Math.max((typicalDailyRange ?? 0) * 0.035, (premarketRange ?? 0) * 0.1);

  const riskUnit = finite(price)
    ? Math.max(price * 0.0015, (moveHigh ?? price * 0.002) * 0.65)
    : null;
  const entry = side === "WAIT" || !finite(price)
    ? null
    : side === "LONG"
      ? Math.max(price, input.upperThird, input.pivotHigh)
      : Math.min(price, input.lowerThird, input.pivotLow);
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
  ];

  const alignedSignals = [zone !== "MIDDLE THIRD" && zone !== "UNKNOWN", !inPivot, emaBull || emaBear]
    .filter(Boolean).length;

  return {
    opening: {
      median: finite(openingMedian) ? roundPrice(openingMedian) : null,
      low: finite(openingMedian) && finite(openingHalfWidth) ? roundPrice(openingMedian - openingHalfWidth) : null,
      high: finite(openingMedian) && finite(openingHalfWidth) ? roundPrice(openingMedian + openingHalfWidth) : null,
      basis: "Weighted premarket quote (55%), premarket midpoint (30%), and prior close (15%), using only available observations; band width reflects recent and premarket ranges.",
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
