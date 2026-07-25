"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type StudioTab = "control" | "portfolio" | "wbr";

type ControlState = {
  operationName: string;
  weeklyDemand: number;
  staffedCapacity: number;
  startingBacklog: number;
  productivity: number;
  qualityYield: number;
  flexCapacity: number;
  demandShock: number;
  targetBacklog: number;
  weeks: number;
  unitCost: number;
  slaTarget: number;
};

type Initiative = {
  id: number;
  name: string;
  owner: string;
  value: number;
  investment: number;
  confidence: number;
  readiness: number;
  urgency: number;
  deliveryRisk: number;
};

type Metric = {
  id: number;
  name: string;
  owner: string;
  actual: number;
  target: number;
  previous: number;
  direction: "higher" | "lower";
  unit: "%" | "$" | "k" | "x";
};

type Action = {
  id: number;
  decision: string;
  owner: string;
  due: string;
  status: "Open" | "At risk" | "Closed";
};

const defaultControl: ControlState = {
  operationName: "Multi-site service operation",
  weeklyDemand: 82000,
  staffedCapacity: 91000,
  startingBacklog: 24000,
  productivity: 94,
  qualityYield: 97.5,
  flexCapacity: 4500,
  demandShock: 6,
  targetBacklog: 5000,
  weeks: 13,
  unitCost: 6.8,
  slaTarget: 95,
};

const defaultInitiatives: Initiative[] = [
  { id: 1, name: "Capacity flex playbook", owner: "Operations", value: 8.4, investment: 1.2, confidence: 84, readiness: 78, urgency: 92, deliveryRisk: 24 },
  { id: 2, name: "Dynamic work-routing rules", owner: "Product + Tech", value: 14.5, investment: 3.8, confidence: 72, readiness: 56, urgency: 88, deliveryRisk: 43 },
  { id: 3, name: "Quality escape closure", owner: "Quality", value: 6.2, investment: 0.9, confidence: 90, readiness: 82, urgency: 76, deliveryRisk: 18 },
  { id: 4, name: "Control-tower data layer", owner: "Analytics", value: 10.8, investment: 4.5, confidence: 68, readiness: 41, urgency: 70, deliveryRisk: 52 },
];

const defaultMetrics: Metric[] = [
  { id: 1, name: "Service compliance", owner: "Operations", actual: 92.4, target: 95, previous: 91.6, direction: "higher", unit: "%" },
  { id: 2, name: "Cost per completed unit", owner: "Finance", actual: 6.8, target: 6.3, previous: 7.1, direction: "lower", unit: "$" },
  { id: 3, name: "Backlog", owner: "Planning", actual: 24, target: 8, previous: 29, direction: "lower", unit: "k" },
  { id: 4, name: "Quality yield", owner: "Quality", actual: 97.5, target: 98.5, previous: 97.2, direction: "higher", unit: "%" },
  { id: 5, name: "Capacity coverage", owner: "Workforce", actual: 102, target: 105, previous: 98, direction: "higher", unit: "%" },
];

const defaultActions: Action[] = [
  { id: 1, decision: "Approve two-week flex capacity trigger", owner: "COO", due: "Friday", status: "Open" },
  { id: 2, decision: "Lock quality-loss source of truth", owner: "Quality + BI", due: "Week 2", status: "At risk" },
  { id: 3, decision: "Retire duplicate backlog report", owner: "Analytics", due: "Complete", status: "Closed" },
];

const storageKey = "luna-sol-executive-operations-studio-v1";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
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

function priorityScore(item: Initiative) {
  const valueEfficiency = clamp((item.value / Math.max(item.investment, 0.1)) * 12, 0, 100);
  return Math.round(valueEfficiency * 0.3 + item.confidence * 0.2 + item.readiness * 0.2 + item.urgency * 0.2 + (100 - item.deliveryRisk) * 0.1);
}

function metricStatus(metric: Metric) {
  const favorable = metric.direction === "higher" ? metric.actual >= metric.target : metric.actual <= metric.target;
  if (favorable) return "green" as const;
  const ratio = metric.direction === "higher" ? metric.actual / Math.max(metric.target, 0.01) : metric.target / Math.max(metric.actual, 0.01);
  return ratio >= 0.95 ? "amber" as const : "red" as const;
}

function metricTrend(metric: Metric) {
  const delta = metric.direction === "higher" ? metric.actual - metric.previous : metric.previous - metric.actual;
  if (Math.abs(delta) < 0.001) return "flat";
  return delta > 0 ? "improving" : "worsening";
}

function formatMetric(value: number, unit: Metric["unit"]) {
  if (unit === "$") return `$${value.toFixed(2)}`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  return `${value.toFixed(1)}${unit}`;
}

export function ExecutiveOperationsStudio() {
  const [tab, setTab] = useState<StudioTab>("control");
  const [control, setControl] = useState<ControlState>(defaultControl);
  const [initiatives, setInitiatives] = useState<Initiative[]>(defaultInitiatives);
  const [budget, setBudget] = useState(6.5);
  const [metrics, setMetrics] = useState<Metric[]>(defaultMetrics);
  const [actions, setActions] = useState<Action[]>(defaultActions);
  const [hydrated, setHydrated] = useState(false);
  const [importMeta, setImportMeta] = useState<{ name: string; rows: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.control) setControl({ ...defaultControl, ...saved.control });
          if (Array.isArray(saved.initiatives) && saved.initiatives.length) setInitiatives(saved.initiatives);
          if (Number.isFinite(saved.budget)) setBudget(saved.budget);
          if (Array.isArray(saved.metrics) && saved.metrics.length) setMetrics(saved.metrics);
          if (Array.isArray(saved.actions) && saved.actions.length) setActions(saved.actions);
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
    window.localStorage.setItem(storageKey, JSON.stringify({ control, initiatives, budget, metrics, actions }));
  }, [actions, budget, control, hydrated, initiatives, metrics]);

  const controlModel = useMemo(() => {
    const scenarioDemand = control.weeklyDemand * (1 + control.demandShock / 100);
    const grossCapacity = control.staffedCapacity + control.flexCapacity;
    const effectiveOutput = grossCapacity * (control.productivity / 100) * (control.qualityYield / 100);
    const weeklyBurn = effectiveOutput - scenarioDemand;
    const targetDelta = Math.max(0, control.startingBacklog - control.targetBacklog);
    const weeksToTarget = targetDelta === 0 ? 0 : weeklyBurn > 0 ? Math.ceil(targetDelta / weeklyBurn) : Infinity;
    const forecast = Array.from({ length: control.weeks }, (_, index) => Math.max(0, control.startingBacklog - weeklyBurn * (index + 1)));
    const endingBacklog = forecast.at(-1) ?? control.startingBacklog;
    const requiredOutput = scenarioDemand + targetDelta / Math.max(control.weeks, 1);
    const capacityGap = Math.max(0, requiredOutput - effectiveOutput);
    const coverage = effectiveOutput / Math.max(scenarioDemand, 1) * 100;
    const workInProcessExposure = endingBacklog * control.unitCost;
    const status = weeklyBurn <= 0 ? "Critical" : weeksToTarget > control.weeks || coverage < 105 ? "Watch" : "Controlled";
    const alerts = [
      coverage < 105 ? `Capacity buffer is ${(coverage - 100).toFixed(1)}%; the operating guardrail is 5%.` : null,
      weeksToTarget > control.weeks ? `The backlog target misses the ${control.weeks}-week planning horizon.` : null,
      control.qualityYield < 98 ? `Quality yield is below the 98% control threshold and is consuming effective capacity.` : null,
      control.demandShock >= 10 ? `The active demand shock is material and should trigger the surge decision path.` : null,
    ].filter(Boolean) as string[];
    const decisions = [
      capacityGap > 0 ? `Secure ${compact(capacityGap)} additional effective units per week to hit the target inside the horizon.` : `Current effective output covers the target path; protect the ${Math.max(0, coverage - 100).toFixed(1)}% buffer.`,
      `A one-point productivity gain creates approximately ${compact(grossCapacity * (control.qualityYield / 100) * 0.01)} units of weekly output.`,
      `A one-point quality-yield gain returns approximately ${compact(grossCapacity * (control.productivity / 100) * 0.01)} units of weekly output.`,
    ];
    return { scenarioDemand, grossCapacity, effectiveOutput, weeklyBurn, weeksToTarget, forecast, endingBacklog, requiredOutput, capacityGap, coverage, workInProcessExposure, status, alerts, decisions };
  }, [control]);

  const portfolioModel = useMemo(() => {
    const ranked = initiatives.map((item) => ({ ...item, score: priorityScore(item) })).sort((a, b) => b.score - a.score);
    const selection = ranked.reduce<{ funded: typeof ranked; committed: number }>((current, item) => current.committed + item.investment <= budget
      ? { funded: [...current.funded, item], committed: current.committed + item.investment }
      : current, { funded: [], committed: 0 });
    const funded = selection.funded;
    const committed = selection.committed;
    const totalValue = funded.reduce((sum, item) => sum + item.value, 0);
    const roadmap = {
      now: funded.filter((item) => item.readiness >= 70),
      next: funded.filter((item) => item.readiness >= 45 && item.readiness < 70),
      later: funded.filter((item) => item.readiness < 45),
    };
    return { ranked, funded, committed, totalValue, multiple: totalValue / Math.max(committed, 0.1), roadmap };
  }, [budget, initiatives]);

  const wbrModel = useMemo(() => {
    const enriched = metrics.map((metric) => ({ ...metric, status: metricStatus(metric), trend: metricTrend(metric) }));
    const counts = { green: enriched.filter((metric) => metric.status === "green").length, amber: enriched.filter((metric) => metric.status === "amber").length, red: enriched.filter((metric) => metric.status === "red").length };
    const offTrack = enriched.filter((metric) => metric.status === "red");
    const improving = enriched.filter((metric) => metric.trend === "improving");
    const readout = offTrack.length
      ? `${offTrack.map((metric) => metric.name).join(" and ")} ${offTrack.length === 1 ? "is" : "are"} outside control. ${improving.length ? `${improving.map((metric) => metric.name).join(", ")} ${improving.length === 1 ? "is" : "are"} moving in the right direction.` : "No tracked KPI improved week over week."} Leadership should close the open decision with the largest service or capacity consequence before the next review.`
      : `All tracked KPIs are within or near control. Protect the current mechanisms and close remaining actions before adding new initiatives.`;
    return { enriched, counts, readout };
  }, [metrics]);

  function updateControl<K extends keyof ControlState>(key: K, value: ControlState[K]) {
    setControl((current) => ({ ...current, [key]: value }));
  }

  function resetStudio() {
    setControl(defaultControl);
    setInitiatives(defaultInitiatives);
    setBudget(6.5);
    setMetrics(defaultMetrics);
    setActions(defaultActions);
    setImportMeta(null);
    window.localStorage.removeItem(storageKey);
  }

  function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
      const rows = lines.slice(1).map((line) => {
        const values = line.split(",");
        return Object.fromEntries(headers.map((header, index) => [header, Number((values[index] || "").replace(/[$,%]/g, "").replace(/,/g, ""))]));
      }).filter((row) => Number.isFinite(row.demand) && Number.isFinite(row.capacity));
      if (!rows.length) return;
      const average = (key: string) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / rows.length;
      const last = rows.at(-1)!;
      setControl((current) => ({
        ...current,
        weeklyDemand: Math.round(average("demand")),
        staffedCapacity: Math.round(average("capacity")),
        qualityYield: Number.isFinite(average("quality_yield")) && average("quality_yield") > 0 ? Number(average("quality_yield").toFixed(1)) : current.qualityYield,
        startingBacklog: Number.isFinite(last.backlog) && last.backlog >= 0 ? last.backlog : current.startingBacklog,
      }));
      setImportMeta({ name: file.name, rows: rows.length });
      setTab("control");
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function exportControlBrief() {
    const lines = [
      "EXECUTIVE OPERATIONS BRIEF",
      control.operationName,
      new Date().toLocaleDateString(),
      "",
      `CONTROL STATUS: ${controlModel.status}`,
      `Scenario demand: ${compact(controlModel.scenarioDemand)} units/week`,
      `Effective output: ${compact(controlModel.effectiveOutput)} units/week`,
      `Capacity coverage: ${controlModel.coverage.toFixed(1)}%`,
      `Weekly backlog burn: ${compact(controlModel.weeklyBurn)} units`,
      `Week ${control.weeks} backlog: ${compact(controlModel.endingBacklog)} units`,
      `Target timing: ${Number.isFinite(controlModel.weeksToTarget) ? `${controlModel.weeksToTarget} weeks` : "No recovery under current assumptions"}`,
      "",
      "DECISIONS REQUIRED",
      ...controlModel.decisions.map((decision, index) => `${index + 1}. ${decision}`),
      "",
      "ACTIVE ALERTS",
      ...(controlModel.alerts.length ? controlModel.alerts.map((alert) => `- ${alert}`) : ["- No active control alerts."]),
      "",
      "MODEL BOUNDARY",
      "Deterministic 13-week scenario using the assumptions shown in the studio. Validate against source-system data, operating calendars, mix, and labor constraints before commitment.",
    ];
    download("executive-operations-brief.txt", lines.join("\n"));
  }

  function exportPortfolio() {
    const header = "recommended,name,owner,priority_score,gross_value_m,investment_m,confidence,readiness,urgency,delivery_risk";
    const fundedIds = new Set(portfolioModel.funded.map((item) => item.id));
    const rows = portfolioModel.ranked.map((item) => [fundedIds.has(item.id) ? "yes" : "no", `"${item.name}"`, `"${item.owner}"`, item.score, item.value, item.investment, item.confidence, item.readiness, item.urgency, item.deliveryRisk].join(","));
    download("transformation-portfolio.csv", [header, ...rows].join("\n"), "text/csv");
  }

  function exportWbr() {
    const lines = [
      "WEEKLY BUSINESS REVIEW",
      control.operationName,
      new Date().toLocaleDateString(),
      "",
      "EXECUTIVE READOUT",
      wbrModel.readout,
      "",
      "KPI SCORECARD",
      ...wbrModel.enriched.map((metric) => `- ${metric.name}: ${formatMetric(metric.actual, metric.unit)} vs ${formatMetric(metric.target, metric.unit)} target | ${metric.status.toUpperCase()} | ${metric.trend} | owner: ${metric.owner}`),
      "",
      "DECISION AND ACTION LOG",
      ...actions.map((action) => `- [${action.status}] ${action.decision} | ${action.owner} | ${action.due}`),
      "",
      "CONTROL RULE",
      "Every red KPI requires a named mechanism, owner, decision date, and verification point.",
    ];
    download("weekly-business-review.txt", lines.join("\n"));
  }

  const maxForecast = Math.max(control.startingBacklog, ...controlModel.forecast, 1);
  const fundedIds = new Set(portfolioModel.funded.map((item) => item.id));

  return (
    <div className="studio-product">
      <div className="studio-topbar">
        <label><span>Operating system</span><input value={control.operationName} onChange={(event) => updateControl("operationName", event.target.value)} maxLength={70} /></label>
        <div className="studio-data-state"><i /><span>{hydrated ? "Working state saved on this device" : "Loading working state"}</span></div>
        <button type="button" onClick={resetStudio}>Reset demo</button>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="Executive Operations Studio modules">
        <button type="button" role="tab" aria-selected={tab === "control"} onClick={() => setTab("control")}><b>01</b><span>Control Tower<small>13-week operating forecast</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "portfolio"} onClick={() => setTab("portfolio")}><b>02</b><span>Transformation Portfolio<small>Investment and roadmap logic</small></span></button>
        <button type="button" role="tab" aria-selected={tab === "wbr"} onClick={() => setTab("wbr")}><b>03</b><span>Weekly Business Review<small>KPI and decision mechanism</small></span></button>
      </div>

      {tab === "control" ? (
        <section className="studio-module" role="tabpanel">
          <header className="studio-module-head">
            <div><span>Operations Control Tower</span><h2>Convert demand, capacity, quality, and backlog into a controlled 13-week plan.</h2></div>
            <div className="studio-actions">
              <input ref={fileRef} className="studio-file" type="file" accept=".csv,text/csv" onChange={importCsv} />
              <button type="button" onClick={() => fileRef.current?.click()}>Import weekly CSV</button>
              <button type="button" onClick={() => download("operations-template.csv", "week,demand,capacity,quality_yield,backlog\n1,82000,91000,97.5,24000\n2,83500,92000,97.8,21500", "text/csv")}>Download template</button>
              <button className="studio-action-primary" type="button" onClick={exportControlBrief}>Export executive brief</button>
            </div>
          </header>
          {importMeta ? <div className="studio-import-note"><i /> Imported {importMeta.rows} valid rows from <strong>{importMeta.name}</strong>. Baseline assumptions were recalculated from the file.</div> : null}

          <div className="studio-control-layout">
            <div className="studio-input-panel">
              <div className="studio-panel-label"><span>Scenario assumptions</span><small>Editable · deterministic</small></div>
              <div className="studio-input-grid">
                {([
                  ["Weekly demand", "weeklyDemand", 1000, 500000, 1000, "units"],
                  ["Staffed capacity", "staffedCapacity", 1000, 550000, 1000, "units"],
                  ["Starting backlog", "startingBacklog", 0, 1000000, 1000, "units"],
                  ["Flex capacity", "flexCapacity", 0, 100000, 500, "units"],
                  ["Target backlog", "targetBacklog", 0, 500000, 500, "units"],
                  ["Unit handling cost", "unitCost", 0.1, 100, 0.1, "$"],
                ] as const).map(([label, key, min, max, step, unit]) => (
                  <label key={key}><span>{label}</span><div><input type="number" min={min} max={max} step={step} value={control[key]} onChange={(event) => updateControl(key, clamp(Number(event.target.value), min, max))} /><small>{unit}</small></div></label>
                ))}
              </div>
              <div className="studio-slider-grid">
                {([
                  ["Productive utilization", "productivity", 60, 100, 0.5, "%"],
                  ["Quality yield", "qualityYield", 80, 100, 0.1, "%"],
                  ["Demand shock", "demandShock", -20, 40, 1, "%"],
                  ["Planning horizon", "weeks", 4, 26, 1, " weeks"],
                ] as const).map(([label, key, min, max, step, suffix]) => (
                  <label key={key}><span><b>{label}</b><strong>{control[key]}{suffix}</strong></span><input type="range" min={min} max={max} step={step} value={control[key]} onChange={(event) => updateControl(key, Number(event.target.value))} /></label>
                ))}
              </div>
            </div>

            <div className="studio-output-panel">
              <div className="studio-panel-label"><span>Executive control view</span><b className={`studio-state studio-state-${controlModel.status.toLowerCase()}`}>{controlModel.status}</b></div>
              <div className="studio-kpi-grid">
                <article><span>Capacity coverage</span><strong>{controlModel.coverage.toFixed(1)}%</strong><small>Effective output ÷ scenario demand</small></article>
                <article><span>Weekly backlog burn</span><strong className={controlModel.weeklyBurn < 0 ? "negative" : ""}>{controlModel.weeklyBurn >= 0 ? "+" : ""}{compact(controlModel.weeklyBurn)}</strong><small>Positive reduces the active queue</small></article>
                <article><span>Target timing</span><strong>{Number.isFinite(controlModel.weeksToTarget) ? `${controlModel.weeksToTarget} wks` : "No path"}</strong><small>Against {compact(control.targetBacklog)} target</small></article>
                <article><span>WIP exposure · wk {control.weeks}</span><strong>{money(controlModel.workInProcessExposure)}</strong><small>Ending backlog × handling cost</small></article>
              </div>
              <div className="studio-forecast">
                <div><span>Backlog trajectory</span><b>{compact(control.startingBacklog)} → {compact(controlModel.endingBacklog)}</b></div>
                <div className="studio-bars" aria-label={`${control.weeks}-week backlog forecast`}>
                  {controlModel.forecast.map((value, index) => <i key={index} style={{ height: `${Math.max(5, value / maxForecast * 100)}%` }} title={`Week ${index + 1}: ${Math.round(value).toLocaleString()} units`}><span>{index === 0 || index === control.weeks - 1 || (index + 1) % 4 === 0 ? index + 1 : ""}</span></i>)}
                </div>
                <small>Week number · hover for projected units</small>
              </div>
              <div className="studio-brief-grid">
                <section><span>Decisions the model surfaces</span><ol>{controlModel.decisions.map((decision) => <li key={decision}>{decision}</li>)}</ol></section>
                <section><span>Active control alerts</span>{controlModel.alerts.length ? <ul>{controlModel.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul> : <p className="studio-clear"><i /> No active threshold alerts.</p>}</section>
              </div>
            </div>
          </div>
          <p className="studio-model-boundary"><strong>Model boundary:</strong> The forecast assumes stable weekly demand and effective output across the selected horizon. It deliberately excludes mix, shift calendars, hiring lead times, and site-level constraints until operating data is imported and validated.</p>
        </section>
      ) : null}

      {tab === "portfolio" ? (
        <section className="studio-module" role="tabpanel">
          <header className="studio-module-head">
            <div><span>Transformation Portfolio</span><h2>Force strategy, value, readiness, and delivery risk into one funding decision.</h2></div>
            <div className="studio-actions"><label className="studio-budget"><span>Investment envelope</span><input type="number" min={0.5} max={100} step={0.5} value={budget} onChange={(event) => setBudget(clamp(Number(event.target.value), 0.5, 100))} /><small>$M</small></label><button type="button" onClick={() => setInitiatives((current) => [...current, { id: Date.now(), name: "New initiative", owner: "TBD", value: 5, investment: 1, confidence: 50, readiness: 50, urgency: 50, deliveryRisk: 50 }])}>Add initiative</button><button className="studio-action-primary" type="button" onClick={exportPortfolio}>Export portfolio CSV</button></div>
          </header>
          <div className="studio-portfolio-summary">
            <article><span>Recommended portfolio</span><strong>{portfolioModel.funded.length}/{initiatives.length}</strong><small>Initiatives inside the envelope</small></article>
            <article><span>Investment committed</span><strong>${portfolioModel.committed.toFixed(1)}M</strong><small>of ${budget.toFixed(1)}M available</small></article>
            <article><span>Modeled gross value</span><strong>${portfolioModel.totalValue.toFixed(1)}M</strong><small>Input value · not guaranteed benefit</small></article>
            <article><span>Value / investment</span><strong>{portfolioModel.multiple.toFixed(1)}×</strong><small>Before timing and realization loss</small></article>
          </div>
          <div className="studio-table-wrap">
            <table className="studio-table studio-portfolio-table">
              <thead><tr><th>Fund</th><th>Initiative / owner</th><th>Value $M</th><th>Invest $M</th><th>Confidence</th><th>Readiness</th><th>Urgency</th><th>Risk</th><th>Priority</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{portfolioModel.ranked.map((item) => (
                <tr key={item.id} className={fundedIds.has(item.id) ? "is-funded" : ""}>
                  <td><span className="studio-fund-mark">{fundedIds.has(item.id) ? "YES" : "—"}</span></td>
                  <td><input aria-label="Initiative name" value={item.name} onChange={(event) => setInitiatives((current) => current.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} /><input className="studio-owner-input" aria-label="Initiative owner" value={item.owner} onChange={(event) => setInitiatives((current) => current.map((row) => row.id === item.id ? { ...row, owner: event.target.value } : row))} /></td>
                  {(["value", "investment", "confidence", "readiness", "urgency", "deliveryRisk"] as const).map((key) => <td key={key}><input aria-label={`${item.name} ${key}`} type="number" min={key === "value" || key === "investment" ? 0.1 : 0} max={key === "value" || key === "investment" ? 500 : 100} step={key === "value" || key === "investment" ? 0.1 : 1} value={item[key]} onChange={(event) => setInitiatives((current) => current.map((row) => row.id === item.id ? { ...row, [key]: Number(event.target.value) } : row))} /></td>)}
                  <td><strong>{item.score}</strong></td>
                  <td><button className="studio-remove" type="button" disabled={initiatives.length === 1} onClick={() => setInitiatives((current) => current.filter((row) => row.id !== item.id))} aria-label={`Remove ${item.name}`}>×</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="studio-roadmap">
            <div className="studio-panel-label"><span>90-day activation sequence</span><small>Recommended initiatives grouped by readiness</small></div>
            <div className="studio-roadmap-grid">
              {([[
                "0–30 days", "Mobilize now", portfolioModel.roadmap.now,
              ], ["31–60 days", "Resolve dependencies", portfolioModel.roadmap.next], ["61–90 days", "Build readiness", portfolioModel.roadmap.later]] as const).map(([period, label, items]) => <section key={period}><span>{period}</span><h3>{label}</h3>{items.length ? items.map((item) => <div key={item.id}><strong>{item.name}</strong><small>{item.owner} · score {item.score}</small></div>) : <p>No funded initiative in this readiness band.</p>}</section>)}
            </div>
          </div>
          <p className="studio-model-boundary"><strong>Published prioritization:</strong> 30% value efficiency + 20% confidence + 20% readiness + 20% urgency + 10% delivery-risk adjustment. Funding follows score order inside the investment envelope. This is an executive challenge mechanism, not an NPV or resource-level project plan.</p>
        </section>
      ) : null}

      {tab === "wbr" ? (
        <section className="studio-module" role="tabpanel">
          <header className="studio-module-head">
            <div><span>Weekly Business Review</span><h2>Turn metrics into a decision cadence—with owners, thresholds, and closure.</h2></div>
            <div className="studio-actions"><button type="button" onClick={() => setMetrics((current) => [...current, { id: Date.now(), name: "New KPI", owner: "TBD", actual: 0, target: 0, previous: 0, direction: "higher", unit: "%" }])}>Add KPI</button><button type="button" onClick={() => setActions((current) => [...current, { id: Date.now(), decision: "New decision or action", owner: "TBD", due: "TBD", status: "Open" }])}>Add action</button><button className="studio-action-primary" type="button" onClick={exportWbr}>Export WBR memo</button></div>
          </header>
          <div className="studio-wbr-status">
            <div className="studio-health-ring" aria-label={`${wbrModel.counts.green} green, ${wbrModel.counts.amber} amber, ${wbrModel.counts.red} red KPIs`}><strong>{metrics.length - wbrModel.counts.red}/{metrics.length}</strong><span>not red</span></div>
            <div><span>Deterministic executive readout</span><p>{wbrModel.readout}</p><div className="studio-health-counts"><b className="green">{wbrModel.counts.green} controlled</b><b className="amber">{wbrModel.counts.amber} watch</b><b className="red">{wbrModel.counts.red} off track</b></div></div>
          </div>
          <div className="studio-table-wrap">
            <table className="studio-table studio-wbr-table">
              <thead><tr><th>Status</th><th>KPI / owner</th><th>Actual</th><th>Target</th><th>Prior</th><th>Direction</th><th>Unit</th><th>Trend</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>{wbrModel.enriched.map((metric) => (
                <tr key={metric.id}>
                  <td><i className={`studio-kpi-state ${metric.status}`} /><span className="sr-only">{metric.status}</span></td>
                  <td><input aria-label="KPI name" value={metric.name} onChange={(event) => setMetrics((current) => current.map((row) => row.id === metric.id ? { ...row, name: event.target.value } : row))} /><input className="studio-owner-input" aria-label="KPI owner" value={metric.owner} onChange={(event) => setMetrics((current) => current.map((row) => row.id === metric.id ? { ...row, owner: event.target.value } : row))} /></td>
                  {(["actual", "target", "previous"] as const).map((key) => <td key={key}><input aria-label={`${metric.name} ${key}`} type="number" step="0.1" value={metric[key]} onChange={(event) => setMetrics((current) => current.map((row) => row.id === metric.id ? { ...row, [key]: Number(event.target.value) } : row))} /></td>)}
                  <td><select aria-label={`${metric.name} direction`} value={metric.direction} onChange={(event) => setMetrics((current) => current.map((row) => row.id === metric.id ? { ...row, direction: event.target.value as Metric["direction"] } : row))}><option value="higher">Higher</option><option value="lower">Lower</option></select></td>
                  <td><select aria-label={`${metric.name} unit`} value={metric.unit} onChange={(event) => setMetrics((current) => current.map((row) => row.id === metric.id ? { ...row, unit: event.target.value as Metric["unit"] } : row))}><option value="%">%</option><option value="$">$</option><option value="k">k</option><option value="x">x</option></select></td>
                  <td><span className={`studio-trend ${metric.trend}`}>{metric.trend}</span></td>
                  <td><button className="studio-remove" type="button" disabled={metrics.length === 1} onClick={() => setMetrics((current) => current.filter((row) => row.id !== metric.id))} aria-label={`Remove ${metric.name}`}>×</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="studio-decision-log">
            <div className="studio-panel-label"><span>Decision and action log</span><small>Every exception ends with an owner and closure point</small></div>
            <div>{actions.map((action) => <article key={action.id}>
              <select aria-label="Action status" value={action.status} onChange={(event) => setActions((current) => current.map((row) => row.id === action.id ? { ...row, status: event.target.value as Action["status"] } : row))}><option>Open</option><option>At risk</option><option>Closed</option></select>
              <input aria-label="Decision or action" value={action.decision} onChange={(event) => setActions((current) => current.map((row) => row.id === action.id ? { ...row, decision: event.target.value } : row))} />
              <input aria-label="Action owner" value={action.owner} onChange={(event) => setActions((current) => current.map((row) => row.id === action.id ? { ...row, owner: event.target.value } : row))} />
              <input aria-label="Action due date" value={action.due} onChange={(event) => setActions((current) => current.map((row) => row.id === action.id ? { ...row, due: event.target.value } : row))} />
              <button className="studio-remove" type="button" disabled={actions.length === 1} onClick={() => setActions((current) => current.filter((row) => row.id !== action.id))} aria-label={`Remove ${action.decision}`}>×</button>
            </article>)}</div>
          </div>
          <p className="studio-model-boundary"><strong>Control logic:</strong> A KPI is controlled at target, on watch within 5%, and off track beyond 5%. Directionality is explicit for every metric. The exported memo converts the scorecard into an executive narrative and action log without a black-box model.</p>
        </section>
      ) : null}
    </div>
  );
}
