"use client";

import { useEffect, useMemo, useState } from "react";

type WorkbenchTab = "launch" | "sop" | "risk";

type LaunchGate = {
  id: number;
  domain: string;
  item: string;
  owner: string;
  critical: boolean;
  done: boolean;
};

type ProcessStep = {
  id: number;
  name: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
  input: string;
  output: string;
  sla: number;
  control: string;
};

type Risk = {
  id: number;
  risk: string;
  category: string;
  owner: string;
  likelihood: number;
  impact: number;
  control: string;
  effectiveness: number;
  response: string;
  due: string;
};

const launchGates: LaunchGate[] = [
  { id: 1, domain: "Operations", item: "Day-one volume and capacity plan approved", owner: "Operations", critical: true, done: true },
  { id: 2, domain: "Operations", item: "Escalation path tested in a live simulation", owner: "Site lead", critical: true, done: false },
  { id: 3, domain: "Operations", item: "Steady-state handoff owner accepted", owner: "Program", critical: false, done: true },
  { id: 4, domain: "Technology", item: "Production integrations passed end-to-end testing", owner: "Technology", critical: true, done: false },
  { id: 5, domain: "Technology", item: "Rollback and fail-safe criteria documented", owner: "Product", critical: true, done: true },
  { id: 6, domain: "Technology", item: "Support model and severity routing active", owner: "Support", critical: false, done: true },
  { id: 7, domain: "People", item: "Staffing plan meets launch and surge requirements", owner: "Workforce", critical: true, done: true },
  { id: 8, domain: "People", item: "Role-based training completion verified", owner: "Training", critical: true, done: false },
  { id: 9, domain: "People", item: "Frontline job aids deployed at point of work", owner: "Operations", critical: false, done: true },
  { id: 10, domain: "Compliance", item: "Legal, safety, and policy sign-offs complete", owner: "Compliance", critical: true, done: true },
  { id: 11, domain: "Compliance", item: "Incident reporting and retention controls tested", owner: "Safety", critical: true, done: false },
  { id: 12, domain: "Compliance", item: "Required vendor attestations current", owner: "Vendor lead", critical: false, done: true },
  { id: 13, domain: "Data", item: "Source-of-truth metrics reconcile to raw events", owner: "Analytics", critical: true, done: false },
  { id: 14, domain: "Data", item: "Launch dashboard thresholds and owners approved", owner: "Program", critical: false, done: true },
  { id: 15, domain: "Data", item: "Day-one monitoring coverage confirmed", owner: "Analytics", critical: false, done: true },
  { id: 16, domain: "Customer", item: "Customer communications and recovery path ready", owner: "CX", critical: true, done: true },
  { id: 17, domain: "Customer", item: "Support teams briefed on expected contacts", owner: "Support", critical: false, done: false },
  { id: 18, domain: "Customer", item: "Post-launch feedback loop scheduled", owner: "Product", critical: false, done: true },
];

const processSteps: ProcessStep[] = [
  { id: 1, name: "Receive request", responsible: "Customer operations", accountable: "Operations lead", consulted: "Account team", informed: "Planning", input: "Validated request", output: "Time-stamped case", sla: 15, control: "Required-field validation" },
  { id: 2, name: "Triage and classify", responsible: "Dispatch", accountable: "Dispatch lead", consulted: "Compliance", informed: "Customer operations", input: "Time-stamped case", output: "Priority and service path", sla: 10, control: "Severity decision table" },
  { id: 3, name: "Assign capacity", responsible: "Dispatch", accountable: "Operations lead", consulted: "Workforce planning", informed: "Service team", input: "Priority and service path", output: "Named resource and ETA", sla: 20, control: "Capacity and credential check" },
  { id: 4, name: "Execute service", responsible: "Service team", accountable: "Field leader", consulted: "Safety", informed: "Customer operations", input: "Named resource and ETA", output: "Completed service record", sla: 120, control: "Completion and exception evidence" },
  { id: 5, name: "Close exception", responsible: "Customer operations", accountable: "Operations lead", consulted: "Quality", informed: "Executive sponsor", input: "Completed service record", output: "Closed case and defect code", sla: 60, control: "Closure audit and defect taxonomy" },
];

const risks: Risk[] = [
  { id: 1, risk: "Launch capacity is below demand at peak hour", category: "Capacity", owner: "Operations", likelihood: 4, impact: 5, control: "Flex capacity trigger and reserve roster", effectiveness: 60, response: "Validate roster at T-14 and T-7", due: "T-14" },
  { id: 2, risk: "Integration failure creates duplicate work", category: "Technology", owner: "Product", likelihood: 3, impact: 5, control: "Idempotency check and rollback path", effectiveness: 75, response: "Complete failure-mode test", due: "T-10" },
  { id: 3, risk: "Frontline training does not cover exception path", category: "People", owner: "Training", likelihood: 3, impact: 4, control: "Scenario certification", effectiveness: 45, response: "Run exception simulation", due: "T-7" },
  { id: 4, risk: "Incident reporting misses required evidence", category: "Compliance", owner: "Safety", likelihood: 2, impact: 5, control: "Mandatory evidence checklist", effectiveness: 70, response: "Audit first 25 cases", due: "Day 2" },
];

const storageKey = "luna-sol-implementation-workbench-v1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function residualScore(risk: Risk) {
  return risk.likelihood * risk.impact * (1 - risk.effectiveness / 100);
}

function riskBand(score: number) {
  if (score >= 10) return "critical";
  if (score >= 5) return "high";
  if (score >= 2.5) return "moderate";
  return "controlled";
}

export function ImplementationWorkbench() {
  const [tab, setTab] = useState<WorkbenchTab>("launch");
  const [gates, setGates] = useState<LaunchGate[]>(launchGates);
  const [goLive, setGoLive] = useState("2026-09-15");
  const [steps, setSteps] = useState<ProcessStep[]>(processSteps);
  const [riskRows, setRiskRows] = useState<Risk[]>(risks);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved.gates) && saved.gates.length) setGates(saved.gates);
          if (typeof saved.goLive === "string") setGoLive(saved.goLive);
          if (Array.isArray(saved.steps) && saved.steps.length) setSteps(saved.steps);
          if (Array.isArray(saved.riskRows) && saved.riskRows.length) setRiskRows(saved.riskRows);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ gates, goLive, steps, riskRows }));
  }, [gates, goLive, hydrated, riskRows, steps]);

  const launchModel = useMemo(() => {
    const possible = gates.reduce((sum, gate) => sum + (gate.critical ? 2 : 1), 0);
    const complete = gates.reduce((sum, gate) => sum + (gate.done ? gate.critical ? 2 : 1 : 0), 0);
    const readiness = Math.round(complete / Math.max(possible, 1) * 100);
    const criticalOpen = gates.filter((gate) => gate.critical && !gate.done);
    const open = gates.filter((gate) => !gate.done);
    const status = criticalOpen.length || readiness < 70 ? "No-go" : readiness < 90 ? "Conditional" : "Go";
    const domains = [...new Set(gates.map((gate) => gate.domain))].map((domain) => {
      const rows = gates.filter((gate) => gate.domain === domain);
      return { domain, done: rows.filter((row) => row.done).length, total: rows.length };
    });
    return { readiness, criticalOpen, open, status, domains };
  }, [gates]);

  const processModel = useMemo(() => {
    const fields: (keyof ProcessStep)[] = ["responsible", "accountable", "consulted", "informed", "input", "output", "control"];
    const total = steps.length * (fields.length + 1);
    const complete = steps.reduce((sum, step) => sum + fields.filter((field) => String(step[field]).trim()).length + (step.sla > 0 ? 1 : 0), 0);
    const gaps = steps.flatMap((step) => [
      !step.responsible ? `${step.name}: no responsible owner` : null,
      !step.accountable ? `${step.name}: no accountable decision owner` : null,
      !step.output ? `${step.name}: no defined output` : null,
      !step.control ? `${step.name}: no control or verification point` : null,
      step.sla <= 0 ? `${step.name}: no service-level expectation` : null,
    ].filter(Boolean) as string[]);
    const handoffs = steps.slice(1).filter((step, index) => step.responsible !== steps[index].responsible).length;
    return { completeness: Math.round(complete / Math.max(total, 1) * 100), gaps, handoffs, totalSla: steps.reduce((sum, step) => sum + Math.max(0, step.sla), 0) };
  }, [steps]);

  const riskModel = useMemo(() => {
    const ranked = riskRows.map((risk) => ({ ...risk, inherent: risk.likelihood * risk.impact, residual: residualScore(risk), band: riskBand(residualScore(risk)) })).sort((a, b) => b.residual - a.residual);
    const residual = ranked.reduce((sum, risk) => sum + risk.residual, 0);
    const inherent = ranked.reduce((sum, risk) => sum + risk.inherent, 0);
    const reduction = inherent ? Math.round((1 - residual / inherent) * 100) : 0;
    return { ranked, residual, inherent, reduction, material: ranked.filter((risk) => risk.residual >= 5) };
  }, [riskRows]);

  function reset() {
    setGates(launchGates);
    setGoLive("2026-09-15");
    setSteps(processSteps);
    setRiskRows(risks);
    window.localStorage.removeItem(storageKey);
  }

  function exportLaunch() {
    const lines = [
      "LAUNCH READINESS DECISION BRIEF",
      `Go-live date: ${goLive || "Not set"}`,
      `Decision: ${launchModel.status}`,
      `Weighted readiness: ${launchModel.readiness}%`,
      `Critical gates open: ${launchModel.criticalOpen.length}`,
      "",
      "DOMAIN READINESS",
      ...launchModel.domains.map((domain) => `- ${domain.domain}: ${domain.done}/${domain.total}`),
      "",
      "OPEN CRITICAL GATES",
      ...(launchModel.criticalOpen.length ? launchModel.criticalOpen.map((gate) => `- ${gate.item} | owner: ${gate.owner}`) : ["- None"]),
      "",
      "GO/NO-GO RULE",
      "No-go when any critical gate remains open or weighted readiness is below 70%. Conditional from 70–89%. Go at 90%+ with no critical gate open.",
    ];
    download("launch-readiness-brief.txt", lines.join("\n"));
  }

  function exportSop() {
    const header = "sequence,step,responsible,accountable,consulted,informed,input,output,sla_minutes,control";
    const rows = steps.map((step, index) => [index + 1, step.name, step.responsible, step.accountable, step.consulted, step.informed, step.input, step.output, step.sla, step.control].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    download("operating-process-and-raci.csv", [header, ...rows].join("\n"), "text/csv");
  }

  function exportRisk() {
    const header = "risk,category,owner,likelihood,impact,inherent_score,control,effectiveness,residual_score,residual_band,response,due";
    const rows = riskModel.ranked.map((risk) => [risk.risk, risk.category, risk.owner, risk.likelihood, risk.impact, risk.inherent, risk.control, risk.effectiveness, risk.residual.toFixed(1), risk.band, risk.response, risk.due].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    download("risk-and-control-register.csv", [header, ...rows].join("\n"), "text/csv");
  }

  return (
    <div className="implementation-product">
      <div className="implementation-topbar"><div><span>Implementation workspace</span><strong>{hydrated ? "Saved locally on this device" : "Loading workspace"}</strong></div><label><span>Target go-live</span><input type="date" value={goLive} onChange={(event) => setGoLive(event.target.value)} /></label><button type="button" onClick={reset}>Reset demo</button></div>
      <div className="implementation-tabs" role="tablist" aria-label="Implementation Workbench modules">
        <button type="button" role="tab" aria-selected={tab === "launch"} onClick={() => setTab("launch")}><b>01</b><span>Launch Readiness<small>Phase gates · owners · go/no-go</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "sop"} onClick={() => setTab("sop")}><b>02</b><span>SOP + RACI Architect<small>Workflow · handoffs · controls</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "risk"} onClick={() => setTab("risk")}><b>03</b><span>Risk + Control Register<small>Exposure · mitigation · closure</small></span></button>
      </div>

      {tab === "launch" ? <section className="implementation-module" role="tabpanel">
        <header className="implementation-module-head"><div><span>Launch Readiness Command Center</span><h2>Make the go/no-go decision from evidence—not optimism.</h2></div><button type="button" onClick={exportLaunch}>Export decision brief</button></header>
        <div className="launch-summary"><article><span>Go-live decision</span><strong className={`launch-${launchModel.status.toLowerCase()}`}>{launchModel.status}</strong><small>Published rule applied</small></article><article><span>Weighted readiness</span><strong>{launchModel.readiness}%</strong><small>Critical gates count twice</small></article><article><span>Critical gates open</span><strong>{launchModel.criticalOpen.length}</strong><small>Must close before launch</small></article><article><span>Total actions open</span><strong>{launchModel.open.length}</strong><small>Across {launchModel.domains.length} domains</small></article></div>
        <div className="launch-domain-grid">{launchModel.domains.map((domain) => <article key={domain.domain}><div><span>{domain.domain}</span><strong>{domain.done}/{domain.total}</strong></div><i><b style={{ width: `${domain.done / domain.total * 100}%` }} /></i></article>)}</div>
        <div className="launch-gates"><div className="implementation-panel-label"><span>Readiness gates</span><small>Critical gates carry 2× weight</small></div>{gates.map((gate) => <article key={gate.id} className={gate.done ? "is-complete" : ""}><label><input type="checkbox" checked={gate.done} onChange={() => setGates((current) => current.map((row) => row.id === gate.id ? { ...row, done: !row.done } : row))} /><span><b>{gate.item}</b><small>{gate.domain} · {gate.critical ? "Critical gate" : "Standard gate"}</small></span></label><input aria-label={`${gate.item} owner`} value={gate.owner} onChange={(event) => setGates((current) => current.map((row) => row.id === gate.id ? { ...row, owner: event.target.value } : row))} /><button type="button" onClick={() => setGates((current) => current.filter((row) => row.id !== gate.id))} aria-label={`Remove ${gate.item}`}>×</button></article>)}</div>
        <div className="implementation-add"><button type="button" onClick={() => setGates((current) => [...current, { id: Date.now(), domain: "Custom", item: "New readiness gate", owner: "TBD", critical: false, done: false }])}>+ Add readiness gate</button></div>
        <p className="implementation-boundary"><strong>Decision rule:</strong> No-go when any critical gate remains open or weighted readiness is below 70%. Conditional from 70–89%. Go at 90%+ with no critical gate open. The checklist must be adapted to applicable legal, safety, technology, and customer obligations.</p>
      </section> : null}

      {tab === "sop" ? <section className="implementation-module" role="tabpanel">
        <header className="implementation-module-head"><div><span>SOP + RACI Architect</span><h2>Design the work, the handoffs, and the decision rights in one operating thread.</h2></div><button type="button" onClick={exportSop}>Export SOP + RACI CSV</button></header>
        <div className="process-summary"><article><span>Control completeness</span><strong>{processModel.completeness}%</strong></article><article><span>Process steps</span><strong>{steps.length}</strong></article><article><span>Cross-owner handoffs</span><strong>{processModel.handoffs}</strong></article><article><span>Modeled end-to-end SLA</span><strong>{processModel.totalSla} min</strong></article></div>
        <div className="process-flow" aria-label="Process sequence">{steps.map((step, index) => <div key={step.id}><b>{String(index + 1).padStart(2, "0")}</b><span>{step.name}</span>{index < steps.length - 1 ? <i>→</i> : null}</div>)}</div>
        <div className="implementation-table-wrap"><table className="implementation-table process-table"><thead><tr><th>#</th><th>Step</th><th>Responsible</th><th>Accountable</th><th>Consulted</th><th>Informed</th><th>Input</th><th>Output</th><th>SLA min</th><th>Control</th><th></th></tr></thead><tbody>{steps.map((step, index) => <tr key={step.id}><td><div className="process-order"><button type="button" disabled={index === 0} onClick={() => setSteps((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button type="button" disabled={index === steps.length - 1} onClick={() => setSteps((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}>↓</button></div></td>{(["name", "responsible", "accountable", "consulted", "informed", "input", "output"] as const).map((field) => <td key={field}><input aria-label={`${step.name} ${field}`} value={step[field]} onChange={(event) => setSteps((current) => current.map((row) => row.id === step.id ? { ...row, [field]: event.target.value } : row))} /></td>)}<td><input aria-label={`${step.name} SLA minutes`} type="number" min={0} max={10080} value={step.sla} onChange={(event) => setSteps((current) => current.map((row) => row.id === step.id ? { ...row, sla: clamp(Number(event.target.value), 0, 10080) } : row))} /></td><td><input aria-label={`${step.name} control`} value={step.control} onChange={(event) => setSteps((current) => current.map((row) => row.id === step.id ? { ...row, control: event.target.value } : row))} /></td><td><button className="implementation-remove" type="button" disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((row) => row.id !== step.id))}>×</button></td></tr>)}</tbody></table></div>
        <div className="process-gap-panel"><div><span>Control-gap analysis</span><strong>{processModel.gaps.length ? `${processModel.gaps.length} gaps require closure` : "No structural gaps detected"}</strong></div>{processModel.gaps.length ? <ul>{processModel.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>Every step has a responsible owner, accountable owner, defined output, SLA, and control point.</p>}<button type="button" onClick={() => setSteps((current) => [...current, { id: Date.now(), name: "New process step", responsible: "", accountable: "", consulted: "", informed: "", input: "", output: "", sla: 0, control: "" }])}>+ Add process step</button></div>
        <p className="implementation-boundary"><strong>Design boundary:</strong> Completeness checks structure an SOP; they do not validate whether the procedure is safe, legal, technically feasible, or executable under real operating conditions. Validate at the point of work before release.</p>
      </section> : null}

      {tab === "risk" ? <section className="implementation-module" role="tabpanel">
        <header className="implementation-module-head"><div><span>Risk + Control Register</span><h2>Translate risk language into exposure, ownership, and closure.</h2></div><button type="button" onClick={exportRisk}>Export risk register CSV</button></header>
        <div className="risk-summary"><article><span>Inherent exposure</span><strong>{riskModel.inherent.toFixed(1)}</strong><small>Likelihood × impact</small></article><article><span>Residual exposure</span><strong>{riskModel.residual.toFixed(1)}</strong><small>After stated controls</small></article><article><span>Modeled reduction</span><strong>{riskModel.reduction}%</strong><small>Control-effectiveness assumption</small></article><article><span>Material risks</span><strong>{riskModel.material.length}</strong><small>Residual score ≥ 5</small></article></div>
        <div className="implementation-table-wrap"><table className="implementation-table risk-table"><thead><tr><th>Band</th><th>Risk / category</th><th>Owner</th><th>Likelihood</th><th>Impact</th><th>Control</th><th>Effectiveness</th><th>Residual</th><th>Response / due</th><th></th></tr></thead><tbody>{riskModel.ranked.map((risk) => <tr key={risk.id}><td><span className={`risk-band risk-${risk.band}`}>{risk.band}</span></td><td><input aria-label="Risk statement" value={risk.risk} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, risk: event.target.value } : row))} /><input className="implementation-subinput" aria-label={`${risk.risk} category`} value={risk.category} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, category: event.target.value } : row))} /></td><td><input aria-label={`${risk.risk} owner`} value={risk.owner} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, owner: event.target.value } : row))} /></td>{(["likelihood", "impact"] as const).map((field) => <td key={field}><input aria-label={`${risk.risk} ${field}`} type="number" min={1} max={5} value={risk[field]} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, [field]: clamp(Number(event.target.value), 1, 5) } : row))} /></td>)}<td><input aria-label={`${risk.risk} control`} value={risk.control} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, control: event.target.value } : row))} /></td><td><input aria-label={`${risk.risk} effectiveness`} type="number" min={0} max={100} value={risk.effectiveness} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, effectiveness: clamp(Number(event.target.value), 0, 100) } : row))} /></td><td><strong>{risk.residual.toFixed(1)}</strong></td><td><input aria-label={`${risk.risk} response`} value={risk.response} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, response: event.target.value } : row))} /><input className="implementation-subinput" aria-label={`${risk.risk} due`} value={risk.due} onChange={(event) => setRiskRows((current) => current.map((row) => row.id === risk.id ? { ...row, due: event.target.value } : row))} /></td><td><button className="implementation-remove" type="button" disabled={riskRows.length === 1} onClick={() => setRiskRows((current) => current.filter((row) => row.id !== risk.id))}>×</button></td></tr>)}</tbody></table></div>
        <div className="risk-action-panel"><div><span>Highest residual exposure</span><strong>{riskModel.ranked[0]?.risk || "No risk entered"}</strong><small>{riskModel.ranked[0] ? `${riskModel.ranked[0].owner} · residual ${riskModel.ranked[0].residual.toFixed(1)} · ${riskModel.ranked[0].response}` : ""}</small></div><button type="button" onClick={() => setRiskRows((current) => [...current, { id: Date.now(), risk: "New risk", category: "Operational", owner: "TBD", likelihood: 3, impact: 3, control: "", effectiveness: 0, response: "", due: "TBD" }])}>+ Add risk</button></div>
        <p className="implementation-boundary"><strong>Scoring boundary:</strong> Residual score = likelihood × impact × (1 − stated control effectiveness). It is a prioritization mechanism, not an actuarial probability or compliance opinion. Control effectiveness must be evidenced and periodically tested.</p>
      </section> : null}
    </div>
  );
}
