"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackProductEvent } from "../lib/analytics";

const MODEL_VERSION = "LUNA-BRM-2.0";
const RECOVERY_EPSILON = 0.01;

type Scenario = {
  unitLabel: string;
  currentBacklog: number;
  targetBacklog: number;
  weeklyInbound: number;
  ratedCapacity: number;
  utilization: number;
  rework: number;
  agingMix: number;
  surgeCapacity: number;
  automationGain: number;
  targetWeeks: number;
  costPerUnitWeek: number;
};

type NumericKey = keyof Omit<Scenario, "unitLabel">;

type InputDefinition = {
  key: NumericKey;
  label: (unit: string) => string;
  min: number;
  sliderMax: number;
  hardMax: number;
  step: number;
  suffix: (unit: string) => string;
  hint: string;
};

const baseline: Scenario = {
  unitLabel: "units",
  currentBacklog: 40,
  targetBacklog: 15,
  weeklyInbound: 8,
  ratedCapacity: 12,
  utilization: 88,
  rework: 3,
  agingMix: 30,
  surgeCapacity: 1,
  automationGain: 5,
  targetWeeks: 20,
  costPerUnitWeek: 0,
};

const presets: Array<{ id: string; label: string; note: string; scenario: Scenario }> = [
  {
    id: "support",
    label: "Support tickets",
    note: "High-volume service queue",
    scenario: { unitLabel: "tickets", currentBacklog: 1200, targetBacklog: 200, weeklyInbound: 450, ratedCapacity: 600, utilization: 85, rework: 8, agingMix: 35, surgeCapacity: 40, automationGain: 8, targetWeeks: 8, costPerUnitWeek: 0 },
  },
  {
    id: "claims",
    label: "Insurance claims",
    note: "Regulated case-processing queue",
    scenario: { unitLabel: "claims", currentBacklog: 3200, targetBacklog: 500, weeklyInbound: 900, ratedCapacity: 1200, utilization: 78, rework: 12, agingMix: 45, surgeCapacity: 100, automationGain: 10, targetWeeks: 12, costPerUnitWeek: 0 },
  },
  {
    id: "orders",
    label: "Order fulfillment",
    note: "Physical-flow operating queue",
    scenario: { unitLabel: "orders", currentBacklog: 1800, targetBacklog: 300, weeklyInbound: 1100, ratedCapacity: 1400, utilization: 82, rework: 5, agingMix: 25, surgeCapacity: 125, automationGain: 6, targetWeeks: 8, costPerUnitWeek: 0 },
  },
  {
    id: "permits",
    label: "Permit review",
    note: "Multi-stage approval queue",
    scenario: { unitLabel: "permits", currentBacklog: 850, targetBacklog: 150, weeklyInbound: 140, ratedCapacity: 180, utilization: 75, rework: 7, agingMix: 55, surgeCapacity: 20, automationGain: 5, targetWeeks: 16, costPerUnitWeek: 0 },
  },
  {
    id: "grading",
    label: "Grading submissions",
    note: "Specialist inspection queue",
    scenario: { unitLabel: "submissions", currentBacklog: 5000, targetBacklog: 800, weeklyInbound: 1200, ratedCapacity: 1500, utilization: 85, rework: 4, agingMix: 40, surgeCapacity: 150, automationGain: 8, targetWeeks: 12, costPerUnitWeek: 0 },
  },
];

const numericInputs: InputDefinition[] = [
  { key: "currentBacklog", label: (u) => `Current backlog (${u})`, min: 0, sliderMax: 500, hardMax: 10_000_000, step: 1, suffix: () => "", hint: "Work sitting in queue now. The numeric field supports enterprise-scale queues." },
  { key: "targetBacklog", label: (u) => `Control threshold (${u})`, min: 0, sliderMax: 400, hardMax: 10_000_000, step: 1, suffix: () => "", hint: "The queue level leadership considers controlled." },
  { key: "weeklyInbound", label: () => "Weekly inbound", min: 0, sliderMax: 200, hardMax: 1_000_000, step: 1, suffix: (u) => ` ${u}/wk`, hint: "New work entering the system each week." },
  { key: "ratedCapacity", label: () => "Rated weekly capacity", min: 0, sliderMax: 300, hardMax: 1_000_000, step: 1, suffix: (u) => ` ${u}/wk`, hint: "Theoretical output before utilization and yield losses." },
  { key: "utilization", label: () => "Capacity utilization", min: 0, sliderMax: 100, hardMax: 100, step: 1, suffix: () => "%", hint: "Share of rated capacity actually available for production." },
  { key: "rework", label: () => "Rework / defect loss", min: 0, sliderMax: 50, hardMax: 100, step: 1, suffix: () => "%", hint: "Throughput consumed by correcting incomplete or defective work." },
  { key: "agingMix", label: () => "Aging-work mix", min: 0, sliderMax: 100, hardMax: 100, step: 5, suffix: () => "%", hint: "Share of backlog exposed to the model's fixed 8% aged-work handling penalty." },
  { key: "surgeCapacity", label: () => "Net surge output", min: 0, sliderMax: 100, hardMax: 1_000_000, step: 1, suffix: (u) => ` ${u}/wk`, hint: "Usable output after losses from overtime, temporary labor, or weekend production." },
  { key: "automationGain", label: () => "Planned productivity gain", min: 0, sliderMax: 40, hardMax: 500, step: 1, suffix: () => "%", hint: "Expected lift applied to rated capacity; validate through an operating pilot." },
  { key: "targetWeeks", label: () => "Target window", min: 1, sliderMax: 78, hardMax: 520, step: 1, suffix: () => " wk", hint: "Leadership's desired time to reach the control threshold." },
  { key: "costPerUnitWeek", label: () => "Estimated cost per unit-week", min: 0, sliderMax: 500, hardMax: 1_000_000, step: 1, suffix: () => " USD / unit-wk", hint: "Optional. Use a defensible carrying cost, SLA penalty, churn exposure, or delay cost." },
];

const hashKeys: Record<keyof Scenario, string> = {
  unitLabel: "u",
  currentBacklog: "b",
  targetBacklog: "t",
  weeklyInbound: "i",
  ratedCapacity: "c",
  utilization: "ut",
  rework: "rw",
  agingMix: "am",
  surgeCapacity: "s",
  automationGain: "ag",
  targetWeeks: "tw",
  costPerUnitWeek: "cd",
};

function bounded(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundFullWeeks(value: number) {
  return Math.ceil(value - Number.EPSILON * Math.max(1, Math.abs(value)));
}

function decimalPlaces(value: number) {
  const absolute = Math.abs(value);
  if (absolute === 0 || absolute >= 100) return 0;
  if (absolute < 1) return 2;
  return 1;
}

function formatNumber(value: number, maximumFractionDigits = decimalPlaces(value)) {
  return value.toLocaleString(undefined, { maximumFractionDigits, minimumFractionDigits: 0 });
}

function singularize(unit: string) {
  const trimmed = unit.trim() || "units";
  return trimmed.toLowerCase().endsWith("s") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
}

function formatUnits(value: number, unit: string, precise = false) {
  const rounded = precise ? value : Math.round(value);
  const label = Math.abs(rounded - 1) < RECOVERY_EPSILON ? singularize(unit) : unit;
  return `${formatNumber(rounded, precise ? decimalPlaces(rounded) : 0)} ${label}`;
}

function formatRate(value: number, unit: string) {
  return `${formatNumber(value)} ${Math.abs(value - 1) < RECOVERY_EPSILON ? singularize(unit) : unit}/wk`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value);
}

function encodeScenario(scenario: Scenario) {
  const params = new URLSearchParams({ v: "2" });
  (Object.keys(hashKeys) as Array<keyof Scenario>).forEach((key) => {
    params.set(hashKeys[key], String(scenario[key]));
  });
  return params.toString();
}

function decodeScenario(hash: string): Scenario | null {
  if (!hash) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("v") !== "2") return null;

  const decoded: Scenario = { ...baseline };
  const unit = params.get(hashKeys.unitLabel);
  if (unit) decoded.unitLabel = unit.replace(/[<>]/g, "").trim().slice(0, 24) || baseline.unitLabel;

  for (const definition of numericInputs) {
    const raw = params.get(hashKeys[definition.key]);
    if (raw === null) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    decoded[definition.key] = bounded(value, definition.min, definition.hardMax);
  }
  return decoded;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

export function BacklogCalculator() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
  const [scenario, setScenario] = useState<Scenario>(baseline);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "fallback" | "error">("idle");
  const [leadMessage, setLeadMessage] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "fallback" | "error">("idle");
  const [artifactStatus, setArtifactStatus] = useState<"idle" | "downloaded" | "error">("idle");
  const noRecoveryTracked = useRef(false);
  const inquiryStarted = useRef(false);
  const sliderInputsTracked = useRef(new Set<NumericKey>());

  useEffect(() => {
    trackProductEvent("calculator_loaded", { model_version: MODEL_VERSION });
    const sharedScenario = decodeScenario(window.location.hash);
    if (!sharedScenario) return;
    const restore = window.setTimeout(() => setScenario(sharedScenario), 0);
    return () => window.clearTimeout(restore);
  }, []);

  const model = useMemo(() => {
    const agingFactor = 1 - (scenario.agingMix / 100) * 0.08;
    const yieldFactor =
      (scenario.utilization / 100) *
      (1 + scenario.automationGain / 100) *
      (1 - scenario.rework / 100) *
      agingFactor;
    const effectiveThroughput = scenario.ratedCapacity * yieldFactor + scenario.surgeCapacity;
    const netBurn = effectiveThroughput - scenario.weeklyInbound;
    const backlogGap = Math.max(0, scenario.currentBacklog - scenario.targetBacklog);
    const alreadyControlled = backlogGap === 0;
    const isRecovering = netBurn > RECOVERY_EPSILON;
    const isGrowing = netBurn < -RECOVERY_EPSILON;
    const operatingNetBurn = isRecovering || isGrowing ? netBurn : 0;
    const weeksToTarget = alreadyControlled ? 0 : isRecovering ? backlogGap / netBurn : Number.POSITIVE_INFINITY;
    const weeksToBreach = alreadyControlled && isGrowing
      ? Math.max(0, scenario.targetBacklog - scenario.currentBacklog) / Math.abs(netBurn)
      : Number.POSITIVE_INFINITY;
    const requiredThroughput = scenario.weeklyInbound + backlogGap / Math.max(1, scenario.targetWeeks);
    const effectiveCapacityGap = Math.max(0, requiredThroughput - effectiveThroughput);
    const ratedOutputNeeded = Math.max(0, requiredThroughput - scenario.surgeCapacity);
    const requiredRatedCapacity = ratedOutputNeeded === 0
      ? 0
      : yieldFactor > RECOVERY_EPSILON ? ratedOutputNeeded / yieldFactor : Number.POSITIVE_INFINITY;
    const incrementalRatedCapacity = Number.isFinite(requiredRatedCapacity)
      ? Math.max(0, requiredRatedCapacity - scenario.ratedCapacity)
      : Number.POSITIVE_INFINITY;

    // Sensitivity is applied to effective throughput, not net burn. This correctly
    // exposes the possibility of no recovery when a downside case crosses inbound.
    const optimisticBurn = effectiveThroughput * 1.12 - scenario.weeklyInbound;
    const pessimisticBurn = effectiveThroughput * 0.88 - scenario.weeklyInbound;
    const lowWeeks = alreadyControlled ? 0 : optimisticBurn > RECOVERY_EPSILON ? backlogGap / optimisticBurn : Number.POSITIVE_INFINITY;
    const highWeeks = alreadyControlled ? 0 : pessimisticBurn > RECOVERY_EPSILON ? backlogGap / pessimisticBurn : Number.POSITIVE_INFINITY;
    const status = alreadyControlled
      ? isGrowing ? "At risk" : "Controlled"
      : isRecovering ? "Recovery" : isGrowing ? "Growing" : "Stalled";
    const statusKey = status.toLowerCase().replace(/\s+/g, "-");
    const weeklyDelayExposure = backlogGap * scenario.costPerUnitWeek;
    const monthlyDelayExposure = weeklyDelayExposure * 52 / 12;
    const recoveryPeriodExposure = Number.isFinite(weeksToTarget)
      ? 0.5 * backlogGap * weeksToTarget * scenario.costPerUnitWeek
      : Number.POSITIVE_INFINITY;

    return {
      agingFactor,
      yieldFactor,
      effectiveThroughput,
      netBurn,
      operatingNetBurn,
      backlogGap,
      alreadyControlled,
      weeksToTarget,
      weeksToBreach,
      requiredThroughput,
      effectiveCapacityGap,
      requiredRatedCapacity,
      incrementalRatedCapacity,
      optimisticBurn,
      pessimisticBurn,
      lowWeeks,
      highWeeks,
      status,
      statusKey,
      weeklyDelayExposure,
      monthlyDelayExposure,
      recoveryPeriodExposure,
    };
  }, [scenario]);

  useEffect(() => {
    const noRecovery = model.backlogGap > 0 && !Number.isFinite(model.weeksToTarget);
    if (noRecovery && !noRecoveryTracked.current) {
      trackProductEvent("no_recovery_shown", { status: model.status, model_version: MODEL_VERSION });
    }
    noRecoveryTracked.current = noRecovery;
  }, [model.backlogGap, model.status, model.weeksToTarget]);

  const chart = useMemo(() => {
    const baseCandidate = Number.isFinite(model.weeksToTarget) ? roundFullWeeks(model.weeksToTarget) : scenario.targetWeeks;
    const highCandidate = Number.isFinite(model.highWeeks) ? roundFullWeeks(model.highWeeks) : scenario.targetWeeks;
    const horizon = Math.max(4, Math.min(156, Math.max(scenario.targetWeeks, baseCandidate, highCandidate)));
    const samples = Math.min(64, Math.max(16, horizon));
    const weeks = Array.from({ length: samples + 1 }, (_, index) => (horizon * index) / samples);
    const queueAt = (burn: number, week: number) => {
      if (model.alreadyControlled) return Math.max(0, scenario.currentBacklog - burn * week);
      return Math.max(scenario.targetBacklog, scenario.currentBacklog - burn * week);
    };
    const base = weeks.map((week) => ({ week, value: queueAt(model.operatingNetBurn, week) }));
    const optimistic = weeks.map((week) => ({ week, value: queueAt(model.optimisticBurn, week) }));
    const pessimistic = weeks.map((week) => ({ week, value: queueAt(model.pessimisticBurn, week) }));
    const required = weeks.map((week) => ({
      week,
      value: week >= scenario.targetWeeks
        ? scenario.targetBacklog
        : scenario.currentBacklog - (model.backlogGap / Math.max(1, scenario.targetWeeks)) * week,
    }));
    const yMax = Math.max(1, scenario.currentBacklog, scenario.targetBacklog, ...pessimistic.map((point) => point.value), ...optimistic.map((point) => point.value)) * 1.08;
    const left = 54;
    const right = 18;
    const top = 18;
    const bottom = 40;
    const width = 760;
    const height = 330;
    const x = (week: number) => left + (week / horizon) * (width - left - right);
    const y = (value: number) => top + (1 - value / yMax) * (height - top - bottom);
    const points = (series: Array<{ week: number; value: number }>) => series.map((point) => `${x(point.week).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
    const band = [
      ...optimistic.map((point, index) => `${x(point.week).toFixed(1)},${y(Math.min(point.value, pessimistic[index].value)).toFixed(1)}`),
      ...pessimistic.slice().reverse().map((point, reverseIndex) => {
        const index = pessimistic.length - 1 - reverseIndex;
        return `${x(point.week).toFixed(1)},${y(Math.max(point.value, optimistic[index].value)).toFixed(1)}`;
      }),
    ].join(" ");

    return { horizon, width, height, left, right, top, bottom, yMax, x, y, base, required, basePoints: points(base), requiredPoints: points(required), bandPoints: band };
  }, [model, scenario]);

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (scenario.targetBacklog > scenario.currentBacklog) {
      messages.push(`You are already below the ${formatUnits(scenario.targetBacklog, scenario.unitLabel)} threshold; the model now tests whether control is sustainable.`);
    }
    if (scenario.costPerUnitWeek > 0) {
      messages.push("Dollar outputs are exposure estimates based entirely on your cost input; they are not modeled savings or an accounting forecast.");
    }
    if (scenario.surgeCapacity > 0) {
      messages.push("Surge is treated as net usable output after operating losses.");
    }
    return messages;
  }, [scenario]);

  const sensitivityLabel = useMemo(() => {
    if (model.backlogGap === 0) return "Already controlled";
    if (!Number.isFinite(model.lowWeeks)) return "No recovery across band";
    if (!Number.isFinite(model.highWeeks)) return `${roundFullWeeks(model.lowWeeks)} wk–no recovery`;
    return `${roundFullWeeks(model.lowWeeks)}–${roundFullWeeks(model.highWeeks)} wk`;
  }, [model]);

  const update = (key: keyof Scenario, value: number | string) => {
    setActivePreset(null);
    setShareStatus("idle");
    setArtifactStatus("idle");
    setScenario((current) => ({ ...current, [key]: value }));
  };

  const selectPreset = (preset: (typeof presets)[number]) => {
    setScenario(preset.scenario);
    setActivePreset(preset.id);
    setShareStatus("idle");
    setArtifactStatus("idle");
    trackProductEvent("preset_selected", { preset: preset.id, model_version: MODEL_VERSION });
  };

  const trackInput = (key: NumericKey, control: "number" | "slider") => {
    if (control === "slider") {
      if (sliderInputsTracked.current.has(key)) return;
      sliderInputsTracked.current.add(key);
    }
    trackProductEvent("input_changed", { input: key, control, model_version: MODEL_VERSION });
  };

  async function copyScenarioLink() {
    const url = new URL(window.location.href);
    url.hash = encodeScenario(scenario);
    window.history.replaceState(null, "", url);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("copied");
      trackProductEvent("scenario_link_copied", { model_version: MODEL_VERSION });
    } catch {
      setShareStatus("fallback");
    }
  }

  function downloadArtifact() {
    try {
      const createdAt = new Date();
      const scenarioUrl = new URL(window.location.href);
      scenarioUrl.hash = encodeScenario(scenario);
      const chartBand = chart.bandPoints;
      const chartBase = chart.basePoints;
      const chartRequired = chart.requiredPoints;
      const rows = numericInputs.map((input) => `<tr><th>${escapeHtml(input.label(scenario.unitLabel))}</th><td>${escapeHtml(String(scenario[input.key]))}${escapeHtml(input.suffix(scenario.unitLabel))}</td></tr>`).join("");
      const costSection = scenario.costPerUnitWeek > 0
        ? `<section><h2>Delay-cost framing</h2><p><strong>${escapeHtml(formatCurrency(model.monthlyDelayExposure))}/month</strong> current excess-backlog exposure.</p><p>${Number.isFinite(model.recoveryPeriodExposure) ? `${escapeHtml(formatCurrency(model.recoveryPeriodExposure))} approximate exposure through the modeled recovery period.` : "Exposure remains open-ended because the current scenario does not recover."}</p><p class="boundary">This is an exposure estimate from the supplied unit-week cost, not modeled savings or an accounting forecast.</p></section>`
        : "";
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Backlog recovery decision brief</title><style>body{font:15px/1.5 Arial,sans-serif;color:#15212b;max-width:980px;margin:40px auto;padding:0 28px}header{border-bottom:3px solid #b99656;padding-bottom:22px;margin-bottom:28px}.eyebrow{letter-spacing:.12em;text-transform:uppercase;color:#806532;font-size:12px}h1{font:42px/1.05 Georgia,serif;margin:8px 0}.status{display:inline-block;padding:6px 10px;border:1px solid #b99656;border-radius:99px}section{margin:28px 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{border:1px solid #d8d4ca;padding:16px}.metric strong{display:block;font-size:22px}svg{width:100%;height:auto;background:#f7f5ef;border:1px solid #d8d4ca}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ddd;padding:8px}th{width:52%}.boundary{padding:14px;border-left:3px solid #b99656;background:#f7f5ef;color:#46515a}.small{font-size:12px;color:#5d666d;word-break:break-all}@media print{body{margin:0}.no-print{display:none}}@media(max-width:700px){.metrics{grid-template-columns:1fr 1fr}}</style></head><body><header><div class="eyebrow">Luna Sol Group · ${MODEL_VERSION}</div><h1>Backlog recovery decision brief</h1><p>${escapeHtml(scenario.unitLabel)} · Generated ${escapeHtml(createdAt.toLocaleString())}</p><span class="status">${escapeHtml(model.status)}</span></header><section class="metrics"><div class="metric">Net backlog burn<strong>${model.operatingNetBurn > 0 ? "−" : model.operatingNetBurn < 0 ? "+" : ""}${escapeHtml(formatRate(Math.abs(model.operatingNetBurn), scenario.unitLabel))}</strong></div><div class="metric">Full weeks to threshold<strong>${Number.isFinite(model.weeksToTarget) ? roundFullWeeks(model.weeksToTarget) : "No recovery"}</strong></div><div class="metric">Required throughput<strong>${escapeHtml(formatRate(model.requiredThroughput, scenario.unitLabel))}</strong></div><div class="metric">Sensitivity<strong>${escapeHtml(sensitivityLabel)}</strong></div></section><section><h2>Modeled burn-down</h2><svg viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-label="Modeled backlog path"><polygon points="${chartBand}" fill="#b99656" opacity=".18"/><line x1="${chart.left}" y1="${chart.y(scenario.targetBacklog)}" x2="${chart.width - chart.right}" y2="${chart.y(scenario.targetBacklog)}" stroke="#638075" stroke-dasharray="6 5"/><polyline points="${chartRequired}" fill="none" stroke="#7c8790" stroke-width="2" stroke-dasharray="5 5"/><polyline points="${chartBase}" fill="none" stroke="#142a3b" stroke-width="4"/><text x="${chart.left}" y="${chart.height - 12}" font-size="12">Week 0</text><text x="${chart.width - chart.right - 64}" y="${chart.height - 12}" font-size="12">Week ${chart.horizon}</text></svg><p class="small">Solid: modeled path · band: ±12% effective-throughput sensitivity · dashed: path required to hit leadership's target window · green: control threshold.</p></section>${costSection}<section><h2>Operating assumptions</h2><table><tr><th>Queue label</th><td>${escapeHtml(scenario.unitLabel)}</td></tr>${rows}</table></section><section><h2>Method and boundary</h2><p>Effective throughput = rated capacity × utilization × productivity lift × quality yield × aging factor + net surge output. Aging factor applies a fixed 8% handling penalty to the aged-work share. Sensitivity varies effective throughput ±12%. Full recovery weeks are rounded up because a partial weekly period is not an operationally completed week.</p><p class="boundary"><strong>Model boundary:</strong> This is a deterministic queue-flow scenario, not a statistical forecast. Validate assumptions with direct observation, operating data, frontline evidence, and financial owners before acting. Generated locally; no connection to client data.</p><p class="small">Portable scenario: ${escapeHtml(scenarioUrl.toString())}</p></section><button class="no-print" onclick="window.print()">Print or save as PDF</button></body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `backlog-recovery-${scenario.unitLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario"}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setArtifactStatus("downloaded");
      trackProductEvent("artifact_downloaded", { artifact: "decision_brief_html", model_version: MODEL_VERSION });
    } catch {
      setArtifactStatus("error");
    }
  }

  const scenarioSummary = [
    `${formatUnits(scenario.currentBacklog, scenario.unitLabel)} in queue; ${formatUnits(scenario.targetBacklog, scenario.unitLabel)} control threshold`,
    `${formatRate(scenario.weeklyInbound, scenario.unitLabel)} inbound; ${formatRate(model.effectiveThroughput, scenario.unitLabel)} effective output`,
    `${model.status}; ${Number.isFinite(model.weeksToTarget) ? `${formatNumber(model.weeksToTarget, 1)} modeled / ${roundFullWeeks(model.weeksToTarget)} full weeks` : "no recovery at current inputs"}`,
    scenario.costPerUnitWeek > 0 ? `${formatCurrency(model.monthlyDelayExposure)}/month modeled excess-backlog exposure` : "No dollar assumption supplied",
  ];

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setLeadStatus("sending");
    setLeadMessage("Sending the scenario and your note…");

    const summary = [
      `Backlog recovery scenario (${MODEL_VERSION}; unit: ${scenario.unitLabel})`,
      `Current backlog: ${formatUnits(scenario.currentBacklog, scenario.unitLabel)}`,
      `Target threshold: ${formatUnits(scenario.targetBacklog, scenario.unitLabel)}`,
      `Weekly inbound: ${formatRate(scenario.weeklyInbound, scenario.unitLabel)}`,
      `Rated capacity: ${formatRate(scenario.ratedCapacity, scenario.unitLabel)}`,
      `Utilization: ${scenario.utilization}% · Rework: ${scenario.rework}% · Aging mix: ${scenario.agingMix}%`,
      `Net surge output: ${formatRate(scenario.surgeCapacity, scenario.unitLabel)} · Productivity gain: ${scenario.automationGain}%`,
      `Target window: ${scenario.targetWeeks} weeks`,
      scenario.costPerUnitWeek > 0 ? `Estimated cost per unit-week: ${formatCurrency(scenario.costPerUnitWeek)}` : "Cost per unit-week: not supplied",
      "",
      `Modeled net burn: ${formatRate(model.operatingNetBurn, scenario.unitLabel)} (${model.status})`,
      `Modeled weeks to target: ${Number.isFinite(model.weeksToTarget) ? `${formatNumber(model.weeksToTarget, 1)} exact / ${roundFullWeeks(model.weeksToTarget)} full weeks` : "no recovery at current inputs"}`,
      `Effective-output gap vs. target window: ${formatRate(model.effectiveCapacityGap, scenario.unitLabel)}`,
      `Sensitivity: ${sensitivityLabel}`,
      scenario.costPerUnitWeek > 0 ? `Monthly excess-backlog exposure: ${formatCurrency(model.monthlyDelayExposure)}` : "",
      "",
      String(data.problem || ""),
    ].filter(Boolean).join("\n");

    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: data.name, email: data.email, company: data.company, problem: summary, website: data.website }),
      });
      const result = await response.json();
      if (response.ok && result.ok) {
        form.reset();
        setLeadStatus("sent");
        setLeadMessage("Scenario received. Ryan will reply within one business day with 2–3 operating observations—no deck, no pitch.");
        trackProductEvent("inquiry_submitted", { source: "backlog_calculator", model_status: model.status });
        return;
      }
      if (result.fallback && result.mailto) {
        setLeadStatus("fallback");
        setLeadMessage("Automatic delivery is unavailable. Your email app is opening with the scenario prefilled.");
        trackProductEvent("inquiry_failed", { source: "backlog_calculator", fallback: true });
        window.location.href = result.mailto;
        return;
      }
      throw new Error("failed");
    } catch {
      setLeadStatus("error");
      setLeadMessage(`The scenario could not be delivered. Nothing was lost—download the brief or email Ryan directly at ${contactEmail}.`);
      trackProductEvent("inquiry_failed", { source: "backlog_calculator", fallback: false });
    }
  }

  return (
    <div className="recovery-twin backlog-product-v2">
      <section className="twin-controls" aria-labelledby="queue-inputs-title">
        <div className="twin-panel-heading">
          <h3 id="queue-inputs-title">01 · Describe your queue</h3>
          <button type="button" onClick={() => { setScenario(baseline); setActivePreset(null); setShareStatus("idle"); }}>Reset example</button>
        </div>
        <p>Works for any queue-shaped operating problem. Nothing you enter is stored or sent unless you submit the review form. Shared links contain assumptions, never contact details.</p>

        <div className="backlog-presets" aria-labelledby="preset-label">
          <div className="backlog-presets-head">
            <strong id="preset-label">Start with an operating pattern</strong>
            <span>Illustrative starting points—not industry benchmarks.</span>
          </div>
          <div className="backlog-preset-grid">
            {presets.map((preset) => (
              <button type="button" key={preset.id} aria-pressed={activePreset === preset.id} onClick={() => selectPreset(preset)}>
                <strong>{preset.label}</strong><span>{preset.note}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="twin-input twin-input-text">
          <label htmlFor="backlog-unit"><strong>What are you tracking?</strong></label>
          <input
            id="backlog-unit"
            type="text"
            value={scenario.unitLabel}
            maxLength={24}
            onChange={(event) => update("unitLabel", event.target.value.replace(/[<>]/g, "") || "units")}
            placeholder="e.g. tickets, claims, orders, submissions"
            aria-describedby="backlog-unit-help"
          />
          <small id="backlog-unit-help">Used to label every output and exported artifact.</small>
        </div>

        <div className="twin-input-grid backlog-paired-inputs">
          {numericInputs.map((input) => {
            const value = scenario[input.key];
            const helperId = `${input.key}-help`;
            const rangeId = `${input.key}-range`;
            const numberId = `${input.key}-number`;
            return (
              <div className="twin-input backlog-paired-control" key={input.key}>
                <div className="backlog-control-heading">
                  <label htmlFor={numberId}><strong>{input.label(scenario.unitLabel)}</strong></label>
                  <output htmlFor={`${rangeId} ${numberId}`}>{input.key === "costPerUnitWeek" ? `${formatCurrency(value)} / unit-wk` : `${formatNumber(value)}${input.suffix(scenario.unitLabel)}`}</output>
                </div>
                <div className="backlog-control-pair">
                  <input
                    id={rangeId}
                    type="range"
                    min={input.min}
                    max={Math.max(input.sliderMax, value)}
                    step={input.step}
                    value={value}
                    onChange={(event) => update(input.key, Number(event.target.value))}
                    onPointerUp={() => trackInput(input.key, "slider")}
                    aria-label={`${input.label(scenario.unitLabel)} slider`}
                    aria-describedby={helperId}
                  />
                  <input
                    id={numberId}
                    className="backlog-number-input"
                    type="number"
                    inputMode="decimal"
                    min={input.min}
                    max={input.hardMax}
                    step={input.step}
                    value={value}
                    onChange={(event) => {
                      const next = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(next)) update(input.key, bounded(next, input.min, input.hardMax));
                    }}
                    onBlur={() => trackInput(input.key, "number")}
                    aria-describedby={helperId}
                  />
                </div>
                <small id={helperId}>{input.hint}</small>
              </div>
            );
          })}
        </div>

        {validationMessages.length > 0 && (
          <div className="backlog-assumption-notes" role="status">
            <strong>Assumptions active in this scenario</strong>
            <ul>{validationMessages.map((message) => <li key={message}>{message}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="twin-output" aria-labelledby="modeled-path-title" aria-live="polite">
        <div className="twin-panel-heading">
          <h3 id="modeled-path-title">02 · Modeled operating path</h3>
          <b className={`twin-status twin-status-${model.statusKey}`}>{model.status}</b>
        </div>

        <div className="twin-primary-output">
          <span>Net backlog burn</span>
          <strong>{model.operatingNetBurn > 0 ? "−" : model.operatingNetBurn < 0 ? "+" : ""}{formatUnits(Math.abs(model.operatingNetBurn), scenario.unitLabel, true)}<small>/ week</small></strong>
          <p>Effective output {formatRate(model.effectiveThroughput, scenario.unitLabel)} against {formatRate(scenario.weeklyInbound, scenario.unitLabel)} inbound.</p>
        </div>

        <div className="backlog-chart-card">
          <div className="backlog-chart-head">
            <div><strong>Backlog burn-down</strong><span>Base path, required path, and throughput sensitivity</span></div>
            <span>0–{chart.horizon} weeks</span>
          </div>
          <svg className="backlog-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-labelledby="backlog-chart-title backlog-chart-desc">
            <title id="backlog-chart-title">{`Modeled backlog trajectory over ${chart.horizon} weeks`}</title>
            <desc id="backlog-chart-desc">The primary line shows the current scenario, the shaded band varies effective throughput by plus or minus twelve percent, the dashed line shows the path required to meet the target window, and the horizontal line marks the control threshold.</desc>
            <line x1={chart.left} y1={chart.top} x2={chart.left} y2={chart.height - chart.bottom} className="backlog-axis" />
            <line x1={chart.left} y1={chart.height - chart.bottom} x2={chart.width - chart.right} y2={chart.height - chart.bottom} className="backlog-axis" />
            <line x1={chart.left} y1={chart.y(scenario.targetBacklog)} x2={chart.width - chart.right} y2={chart.y(scenario.targetBacklog)} className="backlog-threshold-line" />
            <polygon points={chart.bandPoints} className="backlog-sensitivity-band" />
            <polyline points={chart.requiredPoints} className="backlog-required-line" />
            <polyline points={chart.basePoints} className="backlog-base-line" />
            <circle cx={chart.x(0)} cy={chart.y(scenario.currentBacklog)} r="5" className="backlog-chart-point" />
            <text x={chart.left - 8} y={chart.top + 5} textAnchor="end" className="backlog-axis-label">{formatNumber(chart.yMax, 0)}</text>
            <text x={chart.left - 8} y={chart.y(scenario.targetBacklog) + 4} textAnchor="end" className="backlog-axis-label">{formatNumber(scenario.targetBacklog, 0)}</text>
            <text x={chart.left} y={chart.height - 13} className="backlog-axis-label">Week 0</text>
            <text x={chart.width - chart.right} y={chart.height - 13} textAnchor="end" className="backlog-axis-label">Week {chart.horizon}</text>
          </svg>
          <div className="backlog-chart-legend" aria-hidden="true"><span className="base">Modeled path</span><span className="band">±12% throughput</span><span className="required">Required path</span><span className="threshold">Control threshold</span></div>
          {chart.horizon === 156 && <p className="backlog-chart-limit">Chart shown through week 156. Exact modeled outputs remain unchanged.</p>}
        </div>

        <div className="twin-output-grid">
          <div><span>Weeks to threshold</span><strong>{Number.isFinite(model.weeksToTarget) ? roundFullWeeks(model.weeksToTarget) : "No recovery"}</strong><small>{model.alreadyControlled ? Number.isFinite(model.weeksToBreach) ? `Below threshold now; breach risk in ${roundFullWeeks(model.weeksToBreach)} wk` : "Already at or below the threshold" : Number.isFinite(model.weeksToTarget) ? `${formatNumber(model.weeksToTarget, 1)} modeled · rounded to full weeks` : "effective output does not exceed inbound"}</small></div>
          <div><span>Required throughput</span><strong>{formatRate(model.requiredThroughput, scenario.unitLabel)}</strong><small>To reach {formatUnits(scenario.targetBacklog, scenario.unitLabel)} in {scenario.targetWeeks} weeks</small></div>
          <div><span>Effective-output gap</span><strong>{formatRate(model.effectiveCapacityGap, scenario.unitLabel)}</strong><small>{model.effectiveCapacityGap > RECOVERY_EPSILON ? Number.isFinite(model.incrementalRatedCapacity) ? `${formatRate(model.incrementalRatedCapacity, scenario.unitLabel)} additional rated capacity at current yield` : "Rated capacity cannot close the gap while usable yield is zero" : "Current scenario supports the target path"}</small></div>
          <div><span>Sensitivity range</span><strong>{sensitivityLabel}</strong><small>±12% variation on effective throughput</small></div>
        </div>

        {scenario.costPerUnitWeek > 0 && (
          <div className="backlog-cost-panel">
            <div><span>Current excess-backlog exposure</span><strong>{formatCurrency(model.monthlyDelayExposure)}<small>/ month</small></strong></div>
            <div><span>Exposure through modeled recovery</span><strong>{Number.isFinite(model.recoveryPeriodExposure) ? formatCurrency(model.recoveryPeriodExposure) : "Open-ended"}</strong></div>
            <p>Calculated on backlog above the control threshold. This frames exposure, not guaranteed savings; intervention cost and counterfactual performance are not modeled.</p>
          </div>
        )}

        <div className="backlog-scenario-actions">
          <button className="button button-secondary" type="button" onClick={copyScenarioLink}>Copy scenario link</button>
          <button className="button button-secondary" type="button" onClick={downloadArtifact}>Download decision brief</button>
          <p className={`backlog-action-status ${shareStatus}`} aria-live="polite">
            {shareStatus === "copied" ? "Copied. The link reproduces these assumptions without contact information." : shareStatus === "fallback" ? "The scenario is now in the address bar. Copy the URL from your browser." : shareStatus === "error" ? "A share link could not be created." : ""}
          </p>
          <p className={`backlog-action-status ${artifactStatus}`} aria-live="polite">
            {artifactStatus === "downloaded" ? "Decision brief downloaded. Open it in a browser to print or save as PDF." : artifactStatus === "error" ? "The brief could not be generated in this browser." : ""}
          </p>
        </div>

        <p className="twin-disclaimer"><strong>Model boundary:</strong> A deterministic queue-flow scenario, not a statistical forecast. Effective throughput applies utilization, productivity gain, rework loss, a fixed 8% penalty to the aged-work share, and net surge output. The chart samples the same equations; it is not a prediction. Validate every assumption with operating evidence before acting. No connection to client data.</p>

        {model.backlogGap > 0 && !Number.isFinite(model.weeksToTarget) && (
          <aside className="backlog-escalation" aria-labelledby="capacity-gap-heading">
            <span>Structural capacity gap</span>
            <h3 id="capacity-gap-heading">This queue cannot recover under the current operating design.</h3>
            <p>Before adding overtime or headcount, test which constraint is actually limiting usable throughput.</p>
            <Link className="button" href="/tools/constraint-diagnostic" prefetch={false} onClick={() => trackProductEvent("constraint_cta_clicked", { source: "backlog_calculator", model_status: model.status })}>Build the constraint hypothesis map <span aria-hidden="true">→</span></Link>
          </aside>
        )}

        <div className="backlog-send-summary" aria-labelledby="scenario-payload-heading">
          <div><strong id="scenario-payload-heading">What will be sent</strong><span>Only this scenario and the contact fields you choose to submit.</span></div>
          <ul>{scenarioSummary.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>

        {leadStatus === "sent" ? (
          <div className="calculator-lead-success" role="status">
            <span>Scenario received</span>
            <h3>Expect a direct reply within one business day.</h3>
            <p>{leadMessage}</p>
            <div><Link href="/work/psa" prefetch={false} onClick={() => trackProductEvent("psa_case_clicked", { source: "backlog_calculator_success" })}>See the recovery case behind the model <span aria-hidden="true">→</span></Link><button type="button" onClick={() => { setLeadStatus("idle"); setLeadMessage(""); }}>Send another scenario</button></div>
          </div>
        ) : (
          <form className="calculator-lead inquiry-form" onSubmit={submitLead} onFocusCapture={() => {
            if (!inquiryStarted.current) {
              inquiryStarted.current = true;
              trackProductEvent("inquiry_started", { source: "backlog_calculator" });
            }
          }}>
            <div className="calculator-lead-head"><strong>Get 2–3 operating observations</strong><span>Ryan will reply within one business day—no deck, no pitch.</span></div>
            <div className="field-grid">
              <label><span>Name <small>(optional)</small></span><input name="name" autoComplete="name" maxLength={100} /></label>
              <label><span>Work email</span><input name="email" type="email" autoComplete="email" required maxLength={160} /></label>
            </div>
            <label><span>Company (optional)</span><input name="company" autoComplete="organization" maxLength={140} /></label>
            <label><span>Anything else worth knowing? (optional)</span><textarea name="problem" maxLength={1200} rows={3} placeholder="Urgency, what has already been tried, and constraints worth knowing." /></label>
            <label className="honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
            <button className="button" type="submit" disabled={leadStatus === "sending"}>
              {leadStatus === "sending" ? "Sending…" : "Send this scenario to Ryan"} <span aria-hidden="true">→</span>
            </button>
            <p className={`form-status ${leadStatus}`} aria-live="polite">{leadMessage}</p>
            {(leadStatus === "error" || leadStatus === "fallback") && <p className="calculator-lead-fallback"><a href={`mailto:${contactEmail}`}>Email Ryan directly</a> or download the decision brief above.</p>}
          </form>
        )}
      </section>
    </div>
  );
}
