"use client";

import { FormEvent, useMemo, useState } from "react";

type CategoryKey = "demand" | "capacity" | "quality" | "sequencing" | "decisionRights" | "measurement";

type Category = {
  key: CategoryKey;
  label: string;
  question: string;
  checks: [string, string];
  nextStep: string;
};

const categories: Category[] = [
  {
    key: "demand",
    label: "Demand signal",
    question: "How much do you suspect inbound demand itself is the constraint?",
    checks: [
      "Inbound volume increased materially in recent weeks",
      "The increase coincides with a nameable trigger (price change, seasonality, policy change)",
    ],
    nextStep: "Compare inbound volume against the same period last year, isolating the trigger event, before assuming demand is structurally higher.",
  },
  {
    key: "capacity",
    label: "Capacity & staffing",
    question: "How much do you suspect rated capacity isn't actually available?",
    checks: [
      "Rated capacity assumes less absence/turnover than you're actually seeing",
      "Overtime or surge capacity is already being used to keep pace",
    ],
    nextStep: "Time-motion or shadow a sample of the workflow to measure effective capacity against the assumption on paper.",
  },
  {
    key: "quality",
    label: "Quality & rework",
    question: "How much do you suspect throughput is being consumed by fixing mistakes?",
    checks: [
      "A meaningful share of throughput is rework, not new work",
      "The rework rate has increased recently, not just the absolute volume",
    ],
    nextStep: "Separate first-pass throughput from rework in your reporting before drawing conclusions about total capacity.",
  },
  {
    key: "sequencing",
    label: "Sequencing & prioritization",
    question: "How much do you suspect work is being worked in the wrong order?",
    checks: [
      "Older work sits significantly longer than its service-level target",
      "There's no clear, consistently applied rule for what gets worked next",
    ],
    nextStep: "Map actual work sequencing against target SLA by age cohort to see where aging work is actually accumulating.",
  },
  {
    key: "decisionRights",
    label: "Decision rights & escalation",
    question: "How much do you suspect slow decision rights are the constraint?",
    checks: [
      "Frontline managers need approval above their level to reallocate resources",
      "Escalations take longer to resolve than the problem's own timescale",
    ],
    nextStep: "Map the actual escalation path end to end and time it against how fast the underlying problem changes.",
  },
  {
    key: "measurement",
    label: "Measurement integrity",
    question: "How much do you suspect the reported signal itself is distorted?",
    checks: [
      "A metric definition or exemption rule changed recently",
      "Reported performance looks better than frontline experience suggests",
    ],
    nextStep: "Reconcile the reported metric against a raw, unadjusted count for a sample period before trusting the trend line.",
  },
];

type State = Record<CategoryKey, { suspicion: number; checks: [boolean, boolean] }>;

const initialState: State = categories.reduce((acc, category) => {
  acc[category.key] = { suspicion: 40, checks: [false, false] };
  return acc;
}, {} as State);

function scoreFor(entry: State[CategoryKey]) {
  const suspicionShare = entry.suspicion / 100;
  const evidenceShare = (Number(entry.checks[0]) + Number(entry.checks[1])) / 2;
  return Math.round((suspicionShare * 0.5 + evidenceShare * 0.5) * 100);
}

export function ConstraintDiagnostic() {
  const [state, setState] = useState<State>(initialState);
  const [leadStatus, setLeadStatus] = useState<"idle" | "sending" | "sent" | "fallback" | "error">("idle");
  const [leadMessage, setLeadMessage] = useState("");

  const ranked = useMemo(() => {
    const rows = categories.map((category) => ({ category, score: scoreFor(state[category.key]) }));
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [state]);

  const spread = ranked.length > 1 ? ranked[0].score - ranked[1].score : 0;
  const signal = spread >= 15 ? "Clear signal" : "Mixed signal";

  const updateSuspicion = (key: CategoryKey, value: number) => {
    setState((current) => ({ ...current, [key]: { ...current[key], suspicion: value } }));
  };
  const toggleCheck = (key: CategoryKey, index: 0 | 1) => {
    setState((current) => {
      const checks = [...current[key].checks] as [boolean, boolean];
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
      "Constraint diagnostic scenario",
      ...ranked.map((row, index) => `${index + 1}. ${row.category.label} — score ${row.score}/100 (suspicion ${state[row.category.key].suspicion}, checks: ${state[row.category.key].checks.map((c) => (c ? "yes" : "no")).join("/")})`),
      "",
      `Signal quality: ${signal} (top two categories ${spread} points apart)`,
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
    <div className="recovery-twin constraint-diagnostic">
      <div className="twin-controls">
        <div className="twin-panel-heading">
          <span>01 · Rate each candidate constraint</span>
          <button type="button" onClick={() => setState(initialState)}>Reset</button>
        </div>
        <p>For each category: how much do you suspect it, plus two quick yes/no checks. The checks carry equal weight to your own instinct&mdash;this is a structured hypothesis, not a black box.</p>
        <div className="constraint-list">
          {categories.map((category) => (
            <div className="constraint-item" key={category.key}>
              <label className="twin-input">
                <span><strong>{category.label}</strong><b>{state[category.key].suspicion}</b></span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={state[category.key].suspicion}
                  onChange={(event) => updateSuspicion(category.key, Number(event.target.value))}
                  aria-label={category.question}
                />
                <small>{category.question}</small>
              </label>
              <div className="constraint-checks">
                {category.checks.map((check, index) => (
                  <label className="constraint-check" key={check}>
                    <input
                      type="checkbox"
                      checked={state[category.key].checks[index]}
                      onChange={() => toggleCheck(category.key, index as 0 | 1)}
                    />
                    <span>{check}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="twin-output" aria-live="polite">
        <div className="twin-panel-heading"><span>02 · Ranked hypothesis</span><b className={`twin-status ${spread >= 15 ? "twin-status-recovery" : "twin-status-stalled"}`}>{signal}</b></div>
        <div className="twin-primary-output">
          <span>Most likely binding constraint</span>
          <strong>{ranked[0].category.label}<small>{ranked[0].score}/100</small></strong>
          <p>{ranked[0].category.nextStep}</p>
        </div>
        <ol className="constraint-ranking">
          {ranked.map((row, index) => (
            <li key={row.category.key}>
              <b>{index + 1}</b>
              <span>{row.category.label}</span>
              <i><em style={{ width: `${row.score}%` }} /></i>
              <strong>{row.score}</strong>
            </li>
          ))}
        </ol>
        <p className="twin-disclaimer"><strong>Model boundary:</strong> A structured hypothesis from the inputs you provide, not a diagnosis. Luna Sol&rsquo;s actual engagements validate a hypothesis like this against real operating data before recommending action.</p>

        <form className="calculator-lead inquiry-form" onSubmit={submitLead}>
          <div className="calculator-lead-head"><strong>Want help validating this?</strong><span>Send this ranking to Ryan&mdash;no obligation.</span></div>
          <div className="field-grid">
            <label><span>Name</span><input name="name" autoComplete="name" required maxLength={100} /></label>
            <label><span>Work email</span><input name="email" type="email" autoComplete="email" required maxLength={160} /></label>
          </div>
          <label><span>Company (optional)</span><input name="company" autoComplete="organization" maxLength={140} /></label>
          <label><span>Anything else worth knowing? (optional)</span><textarea name="problem" maxLength={1200} rows={3} placeholder="Urgency, what's already been tried, constraints we should know about." /></label>
          <label className="honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          <button className="button" type="submit" disabled={leadStatus === "sending"}>
            {leadStatus === "sending" ? "Sending…" : "Send this ranking to Ryan"} <span aria-hidden="true">→</span>
          </button>
          <p className={`form-status ${leadStatus}`} aria-live="polite">{leadMessage}</p>
        </form>
      </section>
    </div>
  );
}
