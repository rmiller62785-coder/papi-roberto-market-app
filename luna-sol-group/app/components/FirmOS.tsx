"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type View = "overview" | "pipeline" | "delivery" | "evidence";

type OpsItem = {
  id: number;
  ownerEmail: string;
  recordType: string;
  title: string;
  client: string;
  status: string;
  priority: string;
  dueDate: string;
  notes: string;
  value: number;
  link: string;
  createdAt: string;
  updatedAt: string;
};

const types = ["lead", "engagement", "task", "decision", "deliverable", "risk", "evidence"];
const statuses = ["new", "qualified", "proposal", "active", "open", "at risk", "blocked", "monitoring", "follow-up", "verified", "live", "complete", "closed"];
const priorities = ["critical", "high", "medium", "low"];

function formatValue(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function dueState(date: string) {
  if (!date) return "none";
  const due = new Date(`${date}T23:59:59`);
  if (Number.isNaN(due.getTime())) return "none";
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "future";
}

export function FirmOS({ operatorName, operatorEmail, signOutHref }: { operatorName: string; operatorEmail: string; signOutHref: string }) {
  const [items, setItems] = useState<OpsItem[]>([]);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  async function loadItems() {
    try {
      const response = await fetch("/api/ops", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load workspace");
      const result = await response.json();
      setItems(result.items || []);
      setMessage("");
    } catch {
      setMessage("The private workspace could not be loaded. Refresh or sign in again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadItems(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const model = useMemo(() => {
    const openStatuses = new Set(["new", "qualified", "proposal", "active", "open", "at risk", "blocked", "monitoring", "follow-up"]);
    const active = items.filter((item) => openStatuses.has(item.status.toLowerCase()));
    const engagements = items.filter((item) => item.recordType === "engagement" && !["closed", "complete"].includes(item.status.toLowerCase()));
    const leads = items.filter((item) => item.recordType === "lead" && !["closed", "complete"].includes(item.status.toLowerCase()));
    const overdue = items.filter((item) => openStatuses.has(item.status.toLowerCase()) && dueState(item.dueDate) === "overdue");
    const atRisk = items.filter((item) => ["risk", "decision", "task"].includes(item.recordType) && ["critical", "high"].includes(item.priority.toLowerCase()) && openStatuses.has(item.status.toLowerCase()));
    const pipelineValue = leads.reduce((sum, item) => sum + item.value, 0);
    const next = [...active].filter((item) => item.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
    return { active, engagements, leads, overdue, atRisk, pipelineValue, next };
  }, [items]);

  const filtered = useMemo(() => {
    const source = view === "pipeline" ? items.filter((item) => ["lead", "engagement"].includes(item.recordType)) : view === "delivery" ? items.filter((item) => ["task", "decision", "deliverable", "risk"].includes(item.recordType)) : view === "evidence" ? items.filter((item) => item.recordType === "evidence") : items;
    const query = search.trim().toLowerCase();
    return source.filter((item) => (typeFilter === "all" || item.recordType === typeFilter) && (!query || `${item.title} ${item.client} ${item.notes}`.toLowerCase().includes(query)));
  }, [items, search, typeFilter, view]);

  async function seed() {
    setSaving(true);
    const response = await fetch("/api/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "seed" }) });
    setSaving(false);
    if (response.ok) await loadItems();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    setSaving(true);
    const response = await fetch("/api/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!response.ok) { setMessage("The record could not be created."); return; }
    form.reset();
    setMessage("Record added to Firm OS.");
    await loadItems();
  }

  async function update(id: number, patch: Partial<OpsItem>) {
    setSaving(true);
    const response = await fetch("/api/ops", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    setSaving(false);
    if (!response.ok) { setMessage("The update could not be saved."); return; }
    const result = await response.json();
    setItems((current) => current.map((item) => item.id === id ? result.item : item));
  }

  async function remove(id: number) {
    if (!window.confirm("Remove this record from Firm OS?")) return;
    setSaving(true);
    const response = await fetch(`/api/ops?id=${id}`, { method: "DELETE" });
    setSaving(false);
    if (response.ok) setItems((current) => current.filter((item) => item.id !== id));
  }

  return <div className="firmos-app">
    <header className="firmos-header"><Link className="firmos-brand" href="/"><span>LS</span><div><strong>Luna Sol Firm OS</strong><small>Private operating console</small></div></Link><div className="firmos-header-actions"><Link href="/tools">Public products ↗</Link><div><span>{operatorName}</span><small>{operatorEmail}</small></div><a href={signOutHref}>Sign out</a></div></header>
    <div className="firmos-layout">
      <aside className="firmos-sidebar"><nav>{([[
        "overview", "Command Center", "Portfolio and next decisions",
      ], ["pipeline", "Pipeline", "Leads and engagements"], ["delivery", "Delivery", "Tasks, decisions, risks"], ["evidence", "Evidence", "Sources and verification"]] as const).map(([id, label, detail]) => <button type="button" key={id} aria-current={view === id ? "page" : undefined} onClick={() => { setView(id); setTypeFilter("all"); }}><b>{label}</b><span>{detail}</span></button>)}</nav><div className="firmos-sidebar-status"><i /><span>Private workspace</span><small>Authenticated · durable records</small></div></aside>
      <main className="firmos-main">
        <section className="firmos-welcome"><div><span>{view === "overview" ? "Executive command center" : view}</span><h1>{view === "overview" ? "One operating view of the firm." : view === "pipeline" ? "From inquiry to active engagement." : view === "delivery" ? "Execution, decisions, and control." : "A claim is only as current as its source."}</h1></div><div className="firmos-save-state"><i className={saving ? "is-saving" : ""} /><span>{saving ? "Saving changes" : "All changes persisted"}</span></div></section>

        {view === "overview" ? <>
          <section className="firmos-kpis"><article><span>Active engagements</span><strong>{model.engagements.length}</strong><small>{model.active.length} open records total</small></article><article><span>Open leads</span><strong>{model.leads.length}</strong><small>{formatValue(model.pipelineValue)} modeled pipeline</small></article><article><span>Overdue commitments</span><strong className={model.overdue.length ? "is-alert" : ""}>{model.overdue.length}</strong><small>Open records past due</small></article><article><span>High-priority controls</span><strong>{model.atRisk.length}</strong><small>Risks, decisions, and tasks</small></article></section>
          {items.length === 0 && !loading ? <section className="firmos-empty"><span>Start the private workspace</span><h2>Load the public engagement portfolio and core operating records.</h2><p>This creates editable starter records for the three public engagements, product deliverables, an evidence check, and immediate decisions. Nothing is created until you choose to initialize it.</p><button type="button" onClick={seed} disabled={saving}>Initialize Luna Sol Firm OS</button></section> : null}
          <div className="firmos-overview-grid"><section><header><span>Engagement portfolio</span><a href="#capture">Add record ↓</a></header><div className="firmos-engagements">{model.engagements.map((item) => <article key={item.id}><div><span>{item.status}</span><b className={`priority-${item.priority}`}>{item.priority}</b></div><h3>{item.title}</h3><p>{item.notes || "No engagement note added."}</p><small>{item.client}</small></article>)}{model.engagements.length === 0 ? <p className="firmos-none">No active engagements.</p> : null}</div></section><section><header><span>Next commitments</span><b>{model.next.length}</b></header><div className="firmos-next">{model.next.map((item) => <article key={item.id}><i className={dueState(item.dueDate)} /><div><strong>{item.title}</strong><span>{item.client || item.recordType}</span></div><time>{item.dueDate}</time></article>)}{model.next.length === 0 ? <p className="firmos-none">No dated commitments.</p> : null}</div></section></div>
        </> : null}

        {view !== "overview" ? <section className="firmos-records"><header><div><span>{view} register</span><strong>{filtered.length} records</strong></div><div className="firmos-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, client, or note" /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All record types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></div></header><div className="firmos-table-wrap"><table><thead><tr><th>Type</th><th>Record / client</th><th>Status</th><th>Priority</th><th>Due</th><th>Value</th><th>Link</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><span className={`record-type type-${item.recordType}`}>{item.recordType}</span></td><td><strong>{item.title}</strong><small>{item.client || item.notes.slice(0, 80) || "No client"}</small></td><td><select value={item.status} onChange={(event) => void update(item.id, { status: event.target.value })}>{[...new Set([item.status, ...statuses])].map((status) => <option key={status}>{status}</option>)}</select></td><td><select value={item.priority} onChange={(event) => void update(item.id, { priority: event.target.value })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><input type="date" value={item.dueDate.match(/^\d{4}-\d{2}-\d{2}$/) ? item.dueDate : ""} onChange={(event) => void update(item.id, { dueDate: event.target.value })} /><small className={`due-${dueState(item.dueDate)}`}>{dueState(item.dueDate)}</small></td><td>{item.value ? formatValue(item.value) : "—"}</td><td>{item.link ? <a href={item.link} target={item.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer">Open ↗</a> : "—"}</td><td><button type="button" onClick={() => void remove(item.id)}>×</button></td></tr>)}</tbody></table>{filtered.length === 0 ? <p className="firmos-none">No records match this view.</p> : null}</div></section> : null}

        <section className="firmos-capture" id="capture"><header><span>Quick capture</span><h2>Add the record while the decision is still fresh.</h2></header><form onSubmit={create}><label><span>Record type</span><select name="recordType" required defaultValue="task">{types.map((type) => <option key={type}>{type}</option>)}</select></label><label className="capture-title"><span>Title</span><input name="title" required maxLength={220} placeholder="Decision, task, risk, evidence source, or opportunity" /></label><label><span>Client / account</span><input name="client" maxLength={160} /></label><label><span>Status</span><select name="status" defaultValue="open">{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Priority</span><select name="priority" defaultValue="medium">{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label><span>Due date</span><input name="dueDate" type="date" /></label><label><span>Value / pipeline</span><input name="value" type="number" min="0" step="1000" placeholder="0" /></label><label><span>Link</span><input name="link" type="url" placeholder="https://" /></label><label className="capture-notes"><span>Notes, next action, or evidence boundary</span><textarea name="notes" rows={3} maxLength={4000} /></label><button type="submit" disabled={saving}>{saving ? "Saving…" : "Add to Firm OS"}</button></form><p aria-live="polite">{message}</p></section>
      </main>
    </div>
  </div>;
}
