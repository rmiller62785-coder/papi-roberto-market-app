"use client";

import { useMemo, useState } from "react";

type Scenario = {
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
};

const baseline: Scenario = {
  currentBacklog: 11,
  targetBacklog: 5,
  weeklyInbound: 350,
  ratedCapacity: 650,
  utilization: 92,
  rework: 0.6,
  agingMix: 35,
  surgeCapacity: 60,
  automationGain: 8,
  targetWeeks: 26,
};

const inputs: Array<{
  key: keyof Scenario;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  hint: string;
}> = [
  { key: "currentBacklog", label: "Current backlog", min: 5, max: 18, step: 0.5, suffix: "m", hint: "Active units in queue" },
  { key: "targetBacklog", label: "Control threshold", min: 2, max: 10, step: 0.5, suffix: "m", hint: "Target operating position" },
  { key: "weeklyInbound", label: "Weekly inbound", min: 200, max: 700, step: 10, suffix: "k", hint: "New demand entering the system" },
  { key: "ratedCapacity", label: "Rated weekly capacity", min: 350, max: 900, step: 10, suffix: "k", hint: "Theoretical output before losses" },
  { key: "utilization", label: "Capacity utilization", min: 65, max: 100, step: 1, suffix: "%", hint: "Share of rated capacity realized" },
  { key: "rework", label: "Rework / defect load", min: 0, max: 5, step: 0.1, suffix: "%", hint: "Throughput consumed by quality loss" },
  { key: "agingMix", label: "Aging-work mix", min: 0, max: 80, step: 5, suffix: "%", hint: "Older work carrying added handling drag" },
  { key: "surgeCapacity", label: "Surge capacity", min: 0, max: 180, step: 10, suffix: "k", hint: "Overtime or weekend output" },
  { key: "automationGain", label: "Planned productivity gain", min: 0, max: 20, step: 1, suffix: "%", hint: "Technology and process improvement" },
  { key: "targetWeeks", label: "Target window", min: 8, max: 52, step: 1, suffix: " wk", hint: "Desired time to control threshold" },
];

const formatK = (value: number) => `${Math.round(value).toLocaleString()}k`;

export function PsaRecoveryTwin({ compact = false }: { compact?: boolean }) {
  const [scenario, setScenario] = useState<Scenario>(baseline);

  const model = useMemo(() => {
    const agingFactor = 1 - (scenario.agingMix / 100) * 0.08;
    const effectiveThroughput =
      scenario.ratedCapacity *
        (scenario.utilization / 100) *
        (1 + scenario.automationGain / 100) *
        (1 - scenario.rework / 100) *
        agingFactor +
      scenario.surgeCapacity;
    const netBurn = effectiveThroughput - scenario.weeklyInbound;
    const backlogGap = Math.max(0, scenario.currentBacklog - scenario.targetBacklog) * 1000;
    const weeksToTarget = netBurn > 0 ? backlogGap / netBurn : Number.POSITIVE_INFINITY;
    const requiredThroughput = scenario.weeklyInbound + backlogGap / scenario.targetWeeks;
    const capacityGap = Math.max(0, requiredThroughput - effectiveThroughput);
    const spikeBurn = effectiveThroughput - scenario.weeklyInbound * 1.2;
    const lowWeeks = netBurn > 0 ? backlogGap / (netBurn * 1.12) : Number.POSITIVE_INFINITY;
    const highWeeks = netBurn > 0 ? backlogGap / Math.max(1, netBurn * 0.88) : Number.POSITIVE_INFINITY;
    const targetDate = Number.isFinite(weeksToTarget)
      ? new Date(Date.UTC(2026, 6, 23 + Math.ceil(weeksToTarget * 7))).toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : "No recovery";
    const status = netBurn > 50 ? "Recovery" : netBurn >= 0 ? "Stalled" : "Growing";
    const projection = Array.from({ length: 14 }, (_, week) =>
      Math.max(scenario.targetBacklog, scenario.currentBacklog - (netBurn * week) / 1000),
    );

    return { effectiveThroughput, netBurn, weeksToTarget, requiredThroughput, capacityGap, spikeBurn, lowWeeks, highWeeks, targetDate, status, projection };
  }, [scenario]);

  const update = (key: keyof Scenario, value: number) => {
    setScenario((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className={`recovery-twin${compact ? " recovery-twin-compact" : ""}`}>
      <div className="twin-controls">
        <div className="twin-panel-heading">
          <span>01 · Scenario inputs</span>
          <button type="button" onClick={() => setScenario(baseline)}>Reset baseline</button>
        </div>
        <p>Adjust normalized operating assumptions. The model recalculates locally in your browser.</p>
        <div className="twin-input-grid">
          {inputs.map((input) => (
            <label className="twin-input" key={input.key}>
              <span><strong>{input.label}</strong><b>{scenario[input.key]}{input.suffix}</b></span>
              <input
                type="range"
                min={input.min}
                max={input.max}
                step={input.step}
                value={scenario[input.key]}
                onChange={(event) => update(input.key, Number(event.target.value))}
                aria-label={input.label}
              />
              <small>{input.hint}</small>
            </label>
          ))}
        </div>
      </div>

      <section className="twin-output" aria-live="polite">
        <div className="twin-panel-heading"><span>02 · Modeled operating path</span><b className={`twin-status twin-status-${model.status.toLowerCase()}`}>{model.status}</b></div>
        <div className="twin-primary-output">
          <span>Net backlog burn</span>
          <strong>{model.netBurn >= 0 ? "−" : "+"}{formatK(Math.abs(model.netBurn))}<small>/ week</small></strong>
          <p>Effective output {formatK(model.effectiveThroughput)} against {formatK(scenario.weeklyInbound)} inbound.</p>
        </div>
        <div className="twin-output-grid">
          <div><span>Estimated threshold</span><strong>{model.targetDate}</strong><small>{Number.isFinite(model.weeksToTarget) ? `${Math.ceil(model.weeksToTarget)} modeled weeks` : "Capacity does not exceed inbound"}</small></div>
          <div><span>Required throughput</span><strong>{formatK(model.requiredThroughput)}</strong><small>To reach {scenario.targetBacklog}m in {scenario.targetWeeks} weeks</small></div>
          <div><span>Capacity gap</span><strong>{formatK(model.capacityGap)}</strong><small>{model.capacityGap > 0 ? "Additional weekly output required" : "Current scenario clears the target"}</small></div>
          <div><span>+20% demand shock</span><strong>{model.spikeBurn >= 0 ? "−" : "+"}{formatK(Math.abs(model.spikeBurn))}</strong><small>{model.spikeBurn >= 0 ? "Weekly burn preserved" : "Weekly backlog growth"}</small></div>
        </div>
        <div className="twin-chart" aria-label="Thirteen-week backlog projection">
          <div><span>13-week backlog path</span><b>{model.projection[13].toFixed(1)}m projected</b></div>
          <div className="twin-bars">
            {model.projection.slice(1).map((value, index) => (
              <i key={index} style={{ height: `${Math.max(10, (value / Math.max(...model.projection)) * 100)}%` }}><span>{index === 0 || index === 6 || index === 12 ? `W${index + 1}` : ""}</span></i>
            ))}
          </div>
        </div>
        <div className="twin-confidence">
          <span>Illustrative confidence range</span>
          <strong>{Number.isFinite(model.weeksToTarget) ? `${Math.ceil(model.lowWeeks)}–${Math.ceil(model.highWeeks)} weeks` : "Recovery unavailable"}</strong>
          <small>Range applies ±12% variation to modeled net throughput.</small>
        </div>
        <p className="twin-disclaimer"><strong>Model boundary:</strong> A sanitized portfolio reconstruction using normalized inputs and public context. It contains no PSA-confidential data and is not a forecast or representation of PSA’s internal planning.</p>
      </section>
    </div>
  );
}
