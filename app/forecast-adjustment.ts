export type ForecastContribution = {
  directionBps: number;
  rangePct: number;
  dedupeGroup: string;
};

export type BaseOpeningRange = {
  median: number;
  low: number;
  high: number;
};

export function aggregateForecastContributions(contributions: ForecastContribution[]) {
  const groupedRange = new Map<string, number>();
  let directionBps = 0;
  for (const item of contributions) {
    if (!Number.isFinite(item.directionBps) || !Number.isFinite(item.rangePct)) continue;
    directionBps += item.directionBps;
    const prior = groupedRange.get(item.dedupeGroup);
    // Correlated evidence contributes once. Preserve the sign so an explicitly
    // negative research weight can tighten the band; select the strongest
    // absolute hypothesis inside the dedupe group instead of summing copies.
    if (prior == null || Math.abs(item.rangePct) > Math.abs(prior)) {
      groupedRange.set(item.dedupeGroup, item.rangePct);
    }
  }
  const rawDirectionBps = directionBps;
  const rawRangeExpansionPct = [...groupedRange.values()].reduce((sum, value) => sum + value, 0);
  const boundedDirectionBps = Math.max(-100, Math.min(100, rawDirectionBps));
  const rangeExpansionPct = Math.max(-0.5, Math.min(2, rawRangeExpansionPct));
  return {
    directionBps: boundedDirectionBps,
    rangeExpansionPct,
    rangeMultiplier: 1 + rangeExpansionPct,
    rawDirectionBps,
    rawRangeExpansionPct,
    safetyCapApplied: boundedDirectionBps !== rawDirectionBps || rangeExpansionPct !== rawRangeExpansionPct,
  };
}

export function applyForecastAdjustment(
  opening: BaseOpeningRange,
  adjustment: { directionBps: number; rangeMultiplier: number },
) {
  const shift = opening.median * adjustment.directionBps / 10_000;
  const baseHalfWidth = Math.max(0, (opening.high - opening.low) / 2);
  const adjustedHalfWidth = baseHalfWidth * Math.max(0.5, adjustment.rangeMultiplier);
  const median = opening.median + shift;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    median: round(median),
    low: round(median - adjustedHalfWidth),
    high: round(median + adjustedHalfWidth),
    shiftDollars: shift,
    baseHalfWidth,
    adjustedHalfWidth,
    rangeExpansionDollarsPerSide: adjustedHalfWidth - baseHalfWidth,
  };
}
