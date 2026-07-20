export type EditableForecastWeight = {
  key: string;
  label: string;
  category: string;
  enabled: number | boolean;
  directionWeight: number;
  rangeWeight: number;
  updatedAt: number;
};

export type ForecastWeightEditor = {
  targetDate: string;
  weights: EditableForecastWeight[];
  baseline: EditableForecastWeight[];
};

const copyWeights = (weights: EditableForecastWeight[]) => weights.map((weight) => ({ ...weight }));

export function clampWeightInput(value: number, minimum: number, maximum: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

export function forecastWeightsDiffer(
  weights: EditableForecastWeight[] | null | undefined,
  baseline: EditableForecastWeight[] | null | undefined,
) {
  if (!weights || !baseline || weights.length !== baseline.length) return Boolean(weights || baseline);
  return weights.some((weight) => {
    const original = baseline.find((candidate) => candidate.key === weight.key);
    return !original ||
      Boolean(weight.enabled) !== Boolean(original.enabled) ||
      weight.directionWeight !== original.directionWeight ||
      weight.rangeWeight !== original.rangeWeight;
  });
}

/** Preserve a same-session draft, but reset clean state or a stale-session draft to server truth. */
export function reconcileForecastWeightEditor(
  current: ForecastWeightEditor | null,
  targetDate: string,
  productionWeights: EditableForecastWeight[],
): ForecastWeightEditor {
  if (
    current?.targetDate === targetDate &&
    forecastWeightsDiffer(current.weights, current.baseline)
  ) return current;
  return {
    targetDate,
    weights: copyWeights(productionWeights),
    baseline: copyWeights(productionWeights),
  };
}
