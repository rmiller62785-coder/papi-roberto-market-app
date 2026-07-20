export type ForecastMethodology = Record<string, unknown>;

/**
 * Keep current research evidence visible without implying that it is an
 * actionable or frozen MOO decision. The immutable MOO block remains a
 * separate top-level API contract.
 */
export function asNonActionableResearchForecast<
  T extends { methodology: ForecastMethodology },
>(block: T) {
  return {
    ...block,
    methodology: {
      ...block.methodology,
      actionable: false as const,
      decisionUse: "NON_ACTIONABLE_RESEARCH" as const,
    },
  };
}
