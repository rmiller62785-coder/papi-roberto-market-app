export type OperatingVolatility = "low" | "moderate" | "high";

export const volatilityOptions: Array<{ id: OperatingVolatility; label: string; cv: number; description: string }> = [
  { id: "low", label: "Low", cv: 0.1, description: "Stable demand and output · 10% weekly variation" },
  { id: "moderate", label: "Moderate", cv: 0.2, description: "Normal operating noise · 20% weekly variation" },
  { id: "high", label: "High", cv: 0.35, description: "Volatile demand or execution · 35% weekly variation" },
];

export type RecoveryRiskInput = {
  currentBacklog: number;
  targetBacklog: number;
  weeklyInbound: number;
  effectiveThroughput: number;
  targetWeeks: number;
  volatility: OperatingVolatility;
};

export type RecoveryRiskPoint = {
  week: number;
  p10: number;
  p50: number;
  p90: number;
};

export type RecoveryRiskResult = {
  cv: number;
  trials: number;
  horizon: number;
  p50Week: number | null;
  p80Week: number | null;
  p95Week: number | null;
  missTargetPercent: number;
  noRecoveryPercent: number;
  path: RecoveryRiskPoint[];
};

const TRIALS = 1_000;
const HORIZON = 104;

function seedFrom(input: RecoveryRiskInput) {
  const source = [input.currentBacklog, input.targetBacklog, input.weeklyInbound, input.effectiveThroughput, input.targetWeeks, input.volatility].join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createStandardNormal(random: () => number) {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    const radius = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

function nearestRank(sorted: number[], probability: number) {
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1))];
}

function visibleWeek(value: number) {
  return value <= HORIZON ? value : null;
}

export function simulateRecoveryRisk(input: RecoveryRiskInput): RecoveryRiskResult {
  const volatility = volatilityOptions.find((option) => option.id === input.volatility) ?? volatilityOptions[1];
  const random = createRandom(seedFrom(input));
  const normal = createStandardNormal(random);
  const backlogByWeek = Array.from({ length: HORIZON + 1 }, () => new Array<number>(TRIALS));
  const recoveryWeeks = new Array<number>(TRIALS);
  const alreadyControlled = input.currentBacklog <= input.targetBacklog;

  for (let trial = 0; trial < TRIALS; trial += 1) {
    let backlog = input.currentBacklog;
    let recoveryWeek = alreadyControlled ? 0 : HORIZON + 1;
    backlogByWeek[0][trial] = backlog;

    for (let week = 1; week <= HORIZON; week += 1) {
      const inbound = Math.max(0, input.weeklyInbound + input.weeklyInbound * volatility.cv * normal());
      const output = Math.max(0, input.effectiveThroughput + input.effectiveThroughput * volatility.cv * normal());
      backlog = Math.max(0, backlog + inbound - output);
      backlogByWeek[week][trial] = backlog;
      if (recoveryWeek > HORIZON && backlog <= input.targetBacklog) recoveryWeek = week;
    }
    recoveryWeeks[trial] = recoveryWeek;
  }

  recoveryWeeks.sort((left, right) => left - right);
  const targetMisses = recoveryWeeks.filter((week) => week > input.targetWeeks).length;
  const horizonMisses = recoveryWeeks.filter((week) => week > HORIZON).length;
  const path = backlogByWeek.map((values, week) => {
    values.sort((left, right) => left - right);
    return {
      week,
      p10: nearestRank(values, 0.1),
      p50: nearestRank(values, 0.5),
      p90: nearestRank(values, 0.9),
    };
  });

  return {
    cv: volatility.cv,
    trials: TRIALS,
    horizon: HORIZON,
    p50Week: visibleWeek(nearestRank(recoveryWeeks, 0.5)),
    p80Week: visibleWeek(nearestRank(recoveryWeeks, 0.8)),
    p95Week: visibleWeek(nearestRank(recoveryWeeks, 0.95)),
    missTargetPercent: targetMisses / TRIALS * 100,
    noRecoveryPercent: horizonMisses / TRIALS * 100,
    path,
  };
}
