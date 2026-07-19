export type EventClassification = {
  category: "Geopolitical" | "Geopolitical de-escalation" | "Earnings" | "Macro" | "NVDA / Semis" | "Market";
  severity: number;
};

export function classifyMarketEvent(headline: string, summary: string): EventClassification {
  const text = `${headline} ${summary}`.toLowerCase();
  const deescalation = /\bceasefire\b|\bpeace (?:talks?|deal)\b|\bnuclear deal\b|\bde-escalat\w*\b|\breopen(?:ing)?\b|\breturns? to normal\b/.test(text);
  const failedDeescalation = /\bceasefire (?:collapse\w*|fail\w*|break\w*|reject\w*)\b|\bpeace (?:talks?|deal) (?:collapse\w*|fail\w*|break\w*|reject\w*)\b|\breject(?:s|ed|ing)? (?:a )?ceasefire\b/.test(text);
  if (deescalation && !failedDeescalation) return { category: "Geopolitical de-escalation", severity: 2 };
  const geopoliticalActor = /\b(?:iran|iranian|israel|israeli|hormuz|strait of hormuz)\b/.test(text);
  const escalationAction = /\b(?:missiles?|airstrikes?|war|warfare|blockade|invasion|sanctions?|attacks?|bomb(?:ing|ed|s)?|strikes?|military action)\b|\bair strikes?\b|\bmilitary strikes?\b|\bretaliat\w*\b/.test(text);
  const explicitlyNegated = /\b(?:no|denies?|denied|false report of|rumou?r of)\b.{0,28}\b(?:attack|airstrike|strike|invasion|war|blockade)\b/.test(text);
  if ((geopoliticalActor && escalationAction && !explicitlyNegated) || failedDeescalation) {
    return { category: "Geopolitical", severity: 3 };
  }
  if (/\bearnings\b|\bquarterly results\b|\bguidance\b|\brevenue forecast\b|\beps estimate\b/.test(text)) return { category: "Earnings", severity: 2.5 };
  if (/\bfomc\b|\bfederal reserve\b|\binterest rates?\b|\binflation\b|\bcpi\b|\bppi\b|\bpayroll\b|\bemployment report\b|\bjobs report\b|\bjob openings\b/.test(text)) return { category: "Macro", severity: 2.5 };
  if (/\bnvidia\b|\bnvda\b|\bsemiconductors?\b|\bchip exports?\b|\bai chips?\b|\bdata center gpu\b/.test(text)) return { category: "NVDA / Semis", severity: 2 };
  return { category: "Market", severity: 1 };
}

export function earningsImpactSession(
  releaseDate: string,
  providerHour: string,
  nextSession: (date: string) => string,
) {
  return /\b(?:amc|after market close|after close)\b/i.test(providerHour)
    ? nextSession(releaseDate)
    : releaseDate;
}
