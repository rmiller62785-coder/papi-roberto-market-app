"use client";

import { FormEvent, useMemo, useState } from "react";

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
};

const numericInputs: Array<{
  key: keyof Omit<Scenario, "unitLabel">;
  label: (unit: string) => string;
  min: number;
  max: number;
  step: number;
  suffix: (unit: string) => string;
  hint: string;
}> = [
  { key: "currentBacklog", label: (u) => `Current backlog (${u})`, min: 1, max: 500, step: 1, suffix: () => "", hint: "How much work is sitting in queue right now" },
  { key: "targetBacklog", label: (u) => `Control threshold (${u})`, min: 0, max: 400, step: 1, suffix: () => "", hint: "The backlog level you consider “back to normal”" },
  { key: "weeklyInbound", label: () => "Weekly inbound", min: 1, max: 200, step: 1, suffix: (u) => ` ${u}/wk`, hint: "New work entering the system each week" },
  { key: "ratedCapacity", label: () => "Rated weekly capacity", min: 1, max: 300, step: 1, suffix: (u) => ` ${u}/wk`, hint: "Theoretical output before losses" },
  { key: "utilization", label: () => "Capacity utilization", min: 40, max: 100, step: 1, suffix: () => "%", hint: "Share of rated capacity you actually realize" },
  { key: "rework", label: () => "Rework / defect loss", min: 0, max: 30, step: 1, suffix: () => "%", hint: "Throughput consumed by fixing mistakes" },
  { key: "agingMix", label: () => "Aging-work mix", min: 0, max: 80, step: 5, suffix: () => "%", hint: "Older work that carries added handling drag" },
  { key: "surgeCapacity", label: () => "Surge capacity", min: 0, max: 100, step: 1, suffix: (u) => ` ${u}/wk`, hint: "Overtime, temp labor, or weekend output" },
  { key: "automationGain", label: () => "Planned productivity gain", min: 0, max: 40, step: 1, suffix: () => "%", hint: "Expected lift from process or technology change" },
  { key: "targetWeeks", label: () => "Target window", min: 4, max: 78, step: 1, suffix: () => " wk", hint: "How fast leadership wants to reach the threshold" },
];

function formatUnits(value: number, unit: string) {
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function BacklogCalculator() {
  const [scenario, setScenario] = useState<Scenario>(baseline);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "fallback" | "error">("idle");
  const [leadMessage, setLeadMessage] = useState("");

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
    const backlogGap = Math.max(0, scenario.currentBacklog - scenario.targetBacklog);
    const weeksToTarget = netBurn > 0 ? backlogGap / netBurn : Number.POSITIVE_INFINITY;
    const requiredThroughput = scenario.weeklyInbound + backlogGap / scenario.targetWeeks;
    const capacityGap = Math.max(0, requiredThroughput - effectiveThroughput);
    const lowWeeks = netBurn > 0 ? backlogGap / (netBurn * 1.12) : Number.POSITIVE_INFINITY;
    const highWeeks = netBurn > 0 ? backlogGap / Math.max(0.01, netBurn * 0.88) : Number.POSITIVE_INFINITY;
    const status = netBurn > backlogGap * 0.02 ? "Recovery" : netBurn >= 0 ? "Stalled" : "Growing";

    return { effectiveThroughput, netBurn, weeksToTarget, requiredThroughput, capacityGap, lowWeeks, highWeeks, status };
  }, [scenario]);

  const update = (key: keyof Scenario, value: number | string) => {
    setScenario((current) => ({ ...current, [key]: value }));
  };

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setLeadStatus("sending");
    setLeadMessage("Sending...");

    const summary = [
      `Backlog calculator scenario (unit: ${scenario.unitLabel})`,
      `Current backlog: ${formatUnits(scenario.currentBacklog, scenario.unitLabel)}`,
      `Target threshold: ${formatUnits(scenario.targetBacklog, scenario.unitLabel)}`,
      `Weekly inbound: ${formatUnits(scenario.weeklyInbound, scenario.unitLabel)}`,
      `Rated capacity: ${formatUnits(scenario.ratedCapacity, scenario.unitLabel)}`,
      `Utilization: ${scenario.utilization}% · Rework: ${scenario.rework}% · Aging mix: ${scenario.agingMix}%`,
      `Surge capacity: ${formatUnits(scenario.surgeCapacity, scenario.unitLabel)} · Productivity gain: ${scenario.automationGain}%`,
      `Target window: ${scenario.targetWeeks} weeks`,
      "",
      `Modeled net burn: ${Math.round(model.netBurn)} ${scenario.unitLabel}/wk (${model.status})`,
      `Modeled weeks to target: ${Number.isFinite(model.weeksToTarget) ? Math.ceil(model.weeksToTarget) : "no recovery at current inputs"}`,
      `Capacity gap vs. target window: ${formatUnits(model.capacityGap, scenario.unitLabel)}/wk`,
      "",
      String(data.problem || ""),
    ].join("\n");

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
        setLeadMessage("Sent. Ryan will follow up on this scenario directly.");
        return;
      }
      if (result.fallback && result.mailto) {
        setLeadStatus("fallback");
        setLeadMessage("Opening your email app with the scenario prefilled.");
        window.location.href = result.mailto;
        return;
      }
      throw new Error("failed");
    } catch {
      setLeadStatus("error");
      setLeadMessage("Could not send automatically. Email Ryan directly instead.");
    }
  }

  return (
    <div className="recovery-twin">
      <div className="twin-controls">
        <div className="twin-panel-heading">
          <span>01 · Describe your queue</span>
          <button type="button" onClick={() => setScenario(baseline)}>Reset example</button>
        </div>
        <p>Works for any queue-shaped operating problem&mdash;support tickets, claims, orders, inspections, grading submissions. Nothing you enter is stored or sent anywhere unless you choose to submit it below.</p>
        <label className="twin-input twin-input-text">
          <span><strong>What are you tracking?</strong></span>
          <input
            type="text"
            value={scenario.unitLabel}
            maxLength={24}
            onChange={(event) => update("unitLabel", event.target.value || "units")}
            placeholder="e.g. tickets, claims, orders, submissions"
          />
          <small>Used to label every number below</small>
        </label>
        <div className="twin-input-grid">
          {numericInputs.map((input) => (
            <label className="twin-input" key={input.key}>
              <span><strong>{input.label(scenario.unitLabel)}</strong><b>{scenario[input.key]}{input.suffix(scenario.unitLabel)}</b></span>
              <input
                type="range"
                min={input.min}
                max={input.max}
                step={input.step}
                value={scenario[input.key]}
                onChange={(event) => update(input.key, Number(event.target.value))}
                aria-label={input.label(scenario.unitLabel)}
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
          <strong>{model.netBurn >= 0 ? "−" : "+"}{formatUnits(Math.abs(model.netBurn), scenario.unitLabel)}<small>/ week</small></strong>
          <p>Effective output {formatUnits(model.effectiveThroughput, scenario.unitLabel)} against {formatUnits(scenario.weeklyInbound, scenario.unitLabel)} inbound.</p>
        </div>
        <div className="twin-output-grid">
          <div><span>Weeks to threshold</span><strong>{Number.isFinite(model.weeksToTarget) ? Math.ceil(model.weeksToTarget) : "No recovery"}</strong><small>{Number.isFinite(model.weeksToTarget) ? "at current inputs" : "capacity does not exceed inbound"}</small></div>
          <div><span>Required throughput</span><strong>{formatUnits(model.requiredThroughput, scenario.unitLabel)}/wk</strong><small>To reach {formatUnits(scenario.targetBacklog, scenario.unitLabel)} in {scenario.targetWeeks} weeks</small></div>
          <div><span>Capacity gap</span><strong>{formatUnits(model.capacityGap, scenario.unitLabel)}/wk</strong><small>{model.capacityGap > 0 ? "Additional weekly output required" : "Current scenario clears the target"}</small></div>
          <div><span>Confidence range</span><strong>{Number.isFinite(model.weeksToTarget) ? `${Math.ceil(model.lowWeeks)}–${Math.ceil(model.highWeeks)} wk` : "Unavailable"}</strong><small>&plusmn;12% variation on modeled throughput</small></div>
        </div>
        <p className="twin-disclaimer"><strong>Model boundary:</strong> A generic queue-recovery model using the inputs you provide. It has no connection to any client&rsquo;s data and is not a forecast for any specific company.</p>

        <form className="calculator-lead inquiry-form" onSubmit={submitLead}>
          <div className="calculator-lead-head"><strong>Want a second set of eyes on this?</strong><span>Send this scenario to Ryan&mdash;no obligation.</span></div>
          <div className="field-grid">
            <label><span>Name</span><input name="name" autoComplete="name" required maxLength={100} /></label>
            <label><span>Work email</span><input name="email" type="email" autoComplete="email" required maxLength={160} /></label>
          </div>
          <label><span>Company (optional)</span><input name="company" autoComplete="organization" maxLength={140} /></label>
          <label><span>Anything else worth knowing? (optional)</span><textarea name="problem" maxLength={1200} rows={3} placeholder="Urgency, what's already been tried, constraints we should know about." /></label>
          <label className="honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          <button className="button" type="submit" disabled={leadStatus === "sending"}>
            {leadStatus === "sending" ? "Sending…" : "Send this scenario to Ryan"} <span aria-hidden="true">→</span>
          </button>
          <p className={`form-status ${leadStatus}`} aria-live="polite">{leadMessage}</p>
        </form>
      </section>
    </div>
  );
}
