"use client";

import { FormEvent, useMemo, useState } from "react";

type CategoryKey = "demand" | "capacity" | "quality" | "sequencing" | "decisionRights" | "measurement";

type Category = {
  key: CategoryKey;
  label: string;
  question: string;
  checks: [string, string, string];
  nextStep: string;
  weakener: string;
  decision: string;
};

const categories: Category[] = [
  {
    key: "demand",
    label: "Demand signal",
    question: "How strong is the operating evidence that inbound demand changed outside its normal range?",
    checks: ["The change is visible in raw inbound counts", "It begins at a nameable trigger or date", "The increase remains after seasonality is removed"],
    nextStep: "Build an indexed inbound trend around the trigger and compare it with the same period last year.",
    weakener: "Backlog grows while normalized inbound remains inside its historical range.",
    decision: "Whether intake controls or demand-shaping belong in the recovery plan.",
  },
  {
    key: "capacity",
    label: "Effective capacity",
    question: "How strong is the evidence that rated capacity is not translating into available output?",
    checks: ["Actual output persistently trails rated capacity", "Absence, turnover, or downtime explains part of the loss", "Surge labor is already required to hold service"],
    nextStep: "Measure effective capacity by workflow stage and shift, then reconcile the result to the planning assumption.",
    weakener: "Effective output matches plan even during the periods when the queue grows.",
    decision: "Whether the intervention requires added capacity or removal of a different constraint.",
  },
  {
    key: "quality",
    label: "Quality and rework",
    question: "How strong is the evidence that apparent throughput includes work being done more than once?",
    checks: ["First-pass output is materially below reported output", "Rework rate increased before the queue worsened", "Defects cluster around a specific step or cohort"],
    nextStep: "Separate first-pass yield from gross throughput and build a defect Pareto by workflow step.",
    weakener: "First-pass yield is stable and rework consumes an immaterial share of capacity.",
    decision: "Whether quality containment produces more capacity than staffing or automation.",
  },
  {
    key: "sequencing",
    label: "Sequencing and flow",
    question: "How strong is the evidence that work is entering the right system but moving in the wrong order?",
    checks: ["Aging work exceeds its service target", "Priority rules differ by team or shift", "Work-in-process accumulates at a specific handoff"],
    nextStep: "Map age cohorts and work-in-process across each handoff, then compare actual sequencing with the stated rule.",
    weakener: "Age cohorts move proportionally and no handoff accumulates work faster than the others.",
    decision: "Whether queue discipline and flow controls can recover service without adding capacity.",
  },
  {
    key: "decisionRights",
    label: "Decision rights",
    question: "How strong is the evidence that the operating problem changes faster than the organization can respond?",
    checks: ["Frontline reallocation requires higher approval", "Escalation time exceeds the problem's timescale", "The same decision is repeatedly reopened"],
    nextStep: "Time the escalation path from detection to action and identify the first approval that does not change the risk.",
    weakener: "Operators can act inside the required timescale and escalation rarely delays recovery.",
    decision: "Which decisions should move closer to the work and which controls must remain centralized.",
  },
  {
    key: "measurement",
    label: "Measurement integrity",
    question: "How strong is the evidence that the reported signal is materially different from operating reality?",
    checks: ["A definition, exemption, or classification rule changed", "Raw counts disagree with the management metric", "Frontline experience contradicts the reported trend"],
    nextStep: "Reconcile a sample period from raw events through every adjustment used in the management metric.",
    weakener: "Raw events, adjusted reporting, and frontline observations reconcile within an acceptable tolerance.",
    decision: "Whether leadership can use the current signal or must repair measurement before allocating resources.",
  },
];

type State = Record<CategoryKey, { evidence: number; checks: [boolean, boolean, boolean] }>;

const initialState: State = categories.reduce((acc, category) => {
  acc[category.key] = { evidence: 0, checks: [false, false, false] };
  return acc;
}, {} as State);

function scoreFor(entry: State[CategoryKey]) {
  const observedShare = entry.checks.filter(Boolean).length / 3;
  return Math.round(entry.evidence * 0.4 + observedShare * 60);
}

export function ConstraintDiagnostic() {
  const [state, setState] = useState<State>(initialState);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "fallback" | "error">("idle");
  const [leadMessage, setLeadMessage] = useState("");

  const ranked = useMemo(() => categories.map((category) => ({ category, score: scoreFor(state[category.key]) })).sort((a, b) => b.score - a.score), [state]);
  const hasEvidence = ranked[0].score > 0;
  const spread = hasEvidence && ranked.length > 1 ? ranked[0].score - ranked[1].score : 0;
  const signal = !hasEvidence ? "Evidence required" : spread >= 15 ? "Clear first test" : "Multi-constraint pattern";
  const top = ranked[0];

  const updateEvidence = (key: CategoryKey, value: number) => setState((current) => ({ ...current, [key]: { ...current[key], evidence: value } }));
  const toggleCheck = (key: CategoryKey, index: 0 | 1 | 2) => {
    setState((current) => {
      const checks = [...current[key].checks] as [boolean, boolean, boolean];
      checks[index] = !checks[index];
      return { ...current, [key]: { ...current[key], checks } };
    });
  };

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setLeadStatus("sending");
    setLeadMessage("Sending...");

    const summary = [
      "Constraint hypothesis map",
      ...ranked.map((row, index) => `${index + 1}. ${row.category.label} — test priority ${row.score}/100 (evidence strength ${state[row.category.key].evidence}, observed checks: ${state[row.category.key].checks.filter(Boolean).length}/3)`),
      "",
      `Pattern: ${signal}${hasEvidence ? ` (top-two spread ${spread} points)` : ""}`,
      `First test: ${hasEvidence ? top.category.nextStep : "No evidence entered"}`,
      "",
      String(data.problem || ""),
    ].join("\n");

    try {
      const response = await fetch("/api/inquiry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.name, email: data.email, company: data.company, problem: summary, website: data.website }) });
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
    <div className="recovery-twin constraint-diagnostic">
      <div className="twin-controls">
        <div className="twin-panel-heading"><span>01 · Build the evidence pattern</span><button type="button" onClick={() => setState(initialState)}>Reset</button></div>
        <p>Rate the strength of evidence already available, then mark only the observations you can support. The output is a test-priority map—not a probability or root-cause verdict.</p>
        <div className="constraint-list">
          {categories.map((category) => (
            <div className="constraint-item" key={category.key}>
              <label className="twin-input">
                <span><strong>{category.label}</strong><b>{state[category.key].evidence}/100</b></span>
                <input type="range" min={0} max={100} step={10} value={state[category.key].evidence} onChange={(event) => updateEvidence(category.key, Number(event.target.value))} aria-label={category.question} />
                <small>{category.question}</small>
              </label>
              <div className="constraint-checks">
                {category.checks.map((check, index) => (
                  <label className="constraint-check" key={check}><input type="checkbox" checked={state[category.key].checks[index]} onChange={() => toggleCheck(category.key, index as 0 | 1 | 2)} /><span>{check}</span></label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="twin-output" aria-live="polite">
        <div className="twin-panel-heading"><span>02 · Prioritized test sequence</span><b className={`twin-status ${hasEvidence && spread >= 15 ? "twin-status-recovery" : "twin-status-stalled"}`}>{signal}</b></div>
        <div className="twin-primary-output">
          <span>Highest-priority hypothesis</span>
          <strong>{hasEvidence ? top.category.label : "No hypothesis ranked"}{hasEvidence ? <small>{top.score}/100 priority</small> : null}</strong>
          <p>{hasEvidence ? top.category.nextStep : "Add evidence strength or a supported observation to create the first test sequence."}</p>
        </div>
        {hasEvidence ? <div className="constraint-decision-brief"><div><span>What would weaken it</span><p>{top.category.weakener}</p></div><div><span>Decision this test unlocks</span><p>{top.category.decision}</p></div></div> : null}
        <ol className="constraint-ranking">
          {ranked.map((row, index) => <li key={row.category.key}><b>{index + 1}</b><span>{row.category.label}</span><i><em style={{ width: `${row.score}%` }} /></i><strong>{row.score}</strong></li>)}
        </ol>
        <p className="twin-disclaimer"><strong>Published scoring:</strong> 40% stated evidence strength + 60% supported observations. The score ranks what to test first; it does not estimate causal probability. An engagement validates the hypothesis against operating data before action.</p>

        <form className="calculator-lead inquiry-form" onSubmit={submitLead}>
          <div className="calculator-lead-head"><strong>Want help validating the first test?</strong><span>Send the evidence pattern to Ryan—no obligation.</span></div>
          <div className="field-grid"><label><span>Name</span><input name="name" autoComplete="name" required maxLength={100} /></label><label><span>Work email</span><input name="email" type="email" autoComplete="email" required maxLength={160} /></label></div>
          <label><span>Company (optional)</span><input name="company" autoComplete="organization" maxLength={140} /></label>
          <label><span>Anything else worth knowing? (optional)</span><textarea name="problem" maxLength={1200} rows={3} placeholder="Urgency, what has already been tried, or the decision this needs to support." /></label>
          <label className="honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          <button className="button" type="submit" disabled={leadStatus === "sending" || !hasEvidence}>{leadStatus === "sending" ? "Sending…" : hasEvidence ? "Send the hypothesis map" : "Add evidence to continue"} <span aria-hidden="true">→</span></button>
          <p className={`form-status ${leadStatus}`} aria-live="polite">{leadMessage}</p>
        </form>
      </section>
    </div>
  );
}
