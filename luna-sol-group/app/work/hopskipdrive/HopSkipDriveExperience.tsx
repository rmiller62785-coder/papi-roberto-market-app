"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const storySteps = [
  {
    label: "Diagnose",
    title: "Establish the operating truth.",
    detail: "Mapped the current state across dispatch, compliance, risk, vendors, incidents, technology, and executive decision-making.",
    outputs: ["Current-state assessment", "Constraint map", "Risk inventory"],
  },
  {
    label: "Architect",
    title: "Design the enterprise operating model.",
    detail: "Defined how work, decisions, escalation, ownership, and information should move across a multi-market transportation platform.",
    outputs: ["Operating architecture", "Decision rights", "Control points"],
  },
  {
    label: "Control",
    title: "Build compliance into the workflow.",
    detail: "Embedded policy, evidence, risk thresholds, and incident-response logic into daily operations instead of treating compliance as a downstream audit.",
    outputs: ["Compliance controls", "Incident pathways", "Risk thresholds"],
  },
  {
    label: "Standardize",
    title: "Turn judgment into repeatable execution.",
    detail: "Created the SOP structure and dispatch workflows needed to preserve service and safety as volume, markets, and operating complexity increased.",
    outputs: ["SOP library", "Dispatch workflows", "Vendor standards"],
  },
  {
    label: "Instrument",
    title: "Give executives a usable control surface.",
    detail: "Translated operating health into an executive KPI framework, governance cadence, and named owners for corrective action.",
    outputs: ["Executive KPIs", "Governance cadence", "Accountability model"],
  },
  {
    label: "Enable",
    title: "Make the system deployable and durable.",
    detail: "Converted operating needs into technical requirements, a sequenced implementation roadmap, and knowledge transfer for the teams carrying the work forward.",
    outputs: ["Technical requirements", "Implementation roadmap", "Knowledge transfer"],
  },
];

const operatingNodes = [
  { label: "Customer", detail: "Demand enters with rider needs, service commitments, timing, and eligibility requirements.", control: "Structured intake" },
  { label: "Dispatch", detail: "Work is planned, matched, monitored, and escalated through a common operating cadence.", control: "Decision logic" },
  { label: "CareDriver", detail: "Clear requirements, readiness checks, and exception paths make frontline execution repeatable.", control: "Execution standard" },
  { label: "Compliance engine", detail: "Policies, evidence, thresholds, and approvals are embedded directly into the operating flow.", control: "Compliance by design" },
  { label: "Rider", detail: "Individual needs and safety considerations remain visible through every handoff and exception.", control: "Rider protection" },
  { label: "Destination", detail: "Completion evidence closes the operational loop and makes service performance auditable.", control: "Verified completion" },
  { label: "Executive dashboard", detail: "Leaders see operating health, risk, service, capacity, and ownership in one control surface.", control: "Executive control" },
];

const markets = [
  { label: "Washington", code: "WA", x: 14, y: 12, note: "Pacific Northwest coverage" },
  { label: "California", code: "CA", x: 10, y: 55, note: "West Coast operating coverage" },
  { label: "Nevada", code: "NV", x: 18, y: 45, note: "Mountain West coverage" },
  { label: "Arizona", code: "AZ", x: 23, y: 65, note: "Southwest coverage" },
  { label: "Colorado", code: "CO", x: 34, y: 47, note: "Mountain region coverage" },
  { label: "Texas", code: "TX", x: 43, y: 71, note: "Multi-market Texas coverage" },
  { label: "Oklahoma", code: "OK", x: 46, y: 58, note: "Central region coverage" },
  { label: "Louisiana", code: "LA", x: 54, y: 73, note: "Gulf region coverage" },
  { label: "Missouri / Kansas", code: "MO/KS", x: 50, y: 48, note: "Kansas City and central coverage" },
  { label: "Tennessee", code: "TN", x: 62, y: 55, note: "Southeast operating coverage" },
  { label: "Wisconsin", code: "WI", x: 57, y: 29, note: "Upper Midwest coverage" },
  { label: "Michigan", code: "MI", x: 65, y: 27, note: "Great Lakes coverage" },
  { label: "Indiana", code: "IN", x: 63, y: 40, note: "Midwest operating coverage" },
  { label: "Pennsylvania", code: "PA", x: 76, y: 34, note: "Mid-Atlantic coverage" },
  { label: "Virginia", code: "VA", x: 75, y: 47, note: "Mid-Atlantic operating coverage" },
  { label: "Maryland", code: "MD", x: 79, y: 42, note: "District and regional coverage" },
  { label: "Florida", code: "FL", x: 76, y: 79, note: "Florida expansion coverage" },
];

export function TransformationStory() {
  const [active, setActive] = useState(0);
  const cards = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.index || 0));
      },
      { rootMargin: "-30% 0px -45%", threshold: [0.2, 0.55, 0.8] },
    );
    cards.current.forEach((card) => card && observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const current = storySteps[active];

  return (
    <div className="hsd-story-grid">
      <aside className="hsd-story-console" aria-hidden="true">
        <div className="hsd-console-top"><span>Transformation architecture</span><b>0{active + 1} / 06</b></div>
        <div className="hsd-console-orbit" aria-hidden="true"><i /><i /><i /></div>
        <span className="hsd-console-label">{current.label}</span>
        <h3>{current.title}</h3>
        <div className="hsd-console-outputs">
          {current.outputs.map((output) => <span key={output}>{output}</span>)}
        </div>
        <div className="hsd-console-progress"><i style={{ width: `${((active + 1) / storySteps.length) * 100}%` }} /></div>
      </aside>
      <div className="hsd-story-list">
        {storySteps.map((step, index) => (
          <article
            className={index === active ? "hsd-story-card active" : "hsd-story-card"}
            data-index={index}
            key={step.label}
            ref={(node) => { cards.current[index] = node; }}
          >
            <div><b>0{index + 1}</b><span>{step.label}</span></div>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function OperatingModelExplorer() {
  const [active, setActive] = useState(0);
  const current = operatingNodes[active];

  return (
    <div className="hsd-operating-explorer">
      <div className="hsd-operating-flow" role="list" aria-label="Operating model stages">
        {operatingNodes.map((node, index) => (
          <div className="hsd-flow-item" role="listitem" key={node.label}>
            <button className={active === index ? "active" : ""} type="button" onClick={() => setActive(index)} aria-pressed={active === index}>
              <b>0{index + 1}</b><span>{node.label}</span>
            </button>
            {index < operatingNodes.length - 1 ? <i aria-hidden="true">→</i> : null}
          </div>
        ))}
      </div>
      <div className="hsd-operating-detail" aria-live="polite">
        <div><span>Active control</span><strong>{current.control}</strong></div>
        <p>{current.detail}</p>
      </div>
    </div>
  );
}

export function MarketMap() {
  const [active, setActive] = useState(0);
  const current = markets[active];

  return (
    <div className="hsd-market-explorer">
      <div className="hsd-map-shell">
        <Image src="/us-map.svg" width={959} height={593} alt="Map of the United States with HopSkipDrive engagement coverage marked" />
        {markets.map((market, index) => (
          <span
            className={active === index ? "hsd-market-node active" : "hsd-market-node"}
            key={market.code}
            style={{ left: `${market.x}%`, top: `${market.y}%` }}
            aria-hidden="true"
          ><span>{market.code}</span></span>
        ))}
        <div className="hsd-map-readout" aria-live="polite">
          <span>Selected coverage</span>
          <strong>{current.label}</strong>
          <p>{current.note}</p>
        </div>
      </div>
      <div className="hsd-market-list" aria-label="Engagement coverage list">
        {markets.map((market, index) => (
          <button className={active === index ? "active" : ""} type="button" key={market.code} onClick={() => setActive(index)}>{market.label}</button>
        ))}
      </div>
    </div>
  );
}

function EngagementMetric({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  return <div><strong>{value}{suffix}</strong><span>{label}</span></div>;
}

export function EngagementMetrics() {
  return (
    <div className="hsd-metrics" aria-label="Engagement scope metrics">
      <EngagementMetric value={30} suffix="+" label="metropolitan markets" />
      <EngagementMetric value={17} suffix="" label="coverage geographies" />
      <EngagementMetric value={10} suffix="" label="integrated workstreams" />
    </div>
  );
}
