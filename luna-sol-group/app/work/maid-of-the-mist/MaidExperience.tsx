"use client";

import { useEffect, useRef, useState } from "react";

const assessmentSteps = [
  {
    label: "Observe",
    title: "See the operation as the guest experiences it.",
    detail: "Observed the U.S. operation end to end, following demand from arrival through ticketing, queueing, boarding, vessel operations, and exit.",
    outputs: ["Field observation", "Guest journey", "Operating evidence"],
  },
  {
    label: "Map",
    title: "Make every handoff and delay visible.",
    detail: "Mapped physical flow, process steps, decision points, guest information, and the moments where variability accumulated.",
    outputs: ["Process map", "Handoff logic", "Experience friction"],
  },
  {
    label: "Measure",
    title: "Connect queue behavior to throughput and capacity.",
    detail: "Analyzed guest-flow patterns, queue dynamics, throughput, capacity, and labor implications as one operating system.",
    outputs: ["Queue analysis", "Throughput view", "Capacity signals"],
  },
  {
    label: "Constrain",
    title: "Identify the bottlenecks that shape the day.",
    detail: "Separated visible symptoms from the operating constraints that affected planning, resource deployment, and guest experience.",
    outputs: ["Bottleneck analysis", "Constraint map", "Demand patterns"],
  },
  {
    label: "Design",
    title: "Translate findings into operational and digital moves.",
    detail: "Developed executive recommendations spanning guest planning, queue management, operating visibility, labor, capacity, and digital experience.",
    outputs: ["Executive recommendations", "Digital concepts", "Value logic"],
  },
  {
    label: "Sequence",
    title: "Create a practical path from insight to implementation.",
    detail: "Structured the implementation plan so near-term guest improvements and longer-term operating enhancements could move together.",
    outputs: ["Implementation plan", "Priorities", "Stakeholder handoff"],
  },
];

const guestFlow = [
  { label: "Guest arrival", control: "Demand signal", detail: "The operating day begins before a guest joins the physical system. Arrival timing and trip planning shape downstream demand." },
  { label: "Ticket purchase", control: "Intent capture", detail: "Ticket activity creates early signals that can inform expected volume, staffing, and guest communication." },
  { label: "Queue", control: "Visible constraint", detail: "The queue concentrates demand and makes the consequences of variability immediately visible to guests and operators." },
  { label: "Wait-time prediction", control: "Planning insight", detail: "Historical demand patterns become a customer-facing planning signal that can help guests choose when to visit." },
  { label: "Boarding", control: "Flow synchronization", detail: "Boarding connects guest readiness, physical space, vessel cadence, safety requirements, and frontline coordination." },
  { label: "Vessel operations", control: "Capacity cycle", detail: "Safe vessel cycles define the heartbeat of the attraction and the practical limits of guest throughput." },
  { label: "Guest exit", control: "System reset", detail: "Exit circulation and handoffs must clear smoothly so the next operating cycle can begin without inherited congestion." },
  { label: "Operational analytics", control: "Executive learning", detail: "Demand, queue, capacity, and journey signals return to leaders as a repeatable improvement and planning loop." },
];

const flowStates = {
  before: {
    label: "Before",
    title: "Demand converges before the operation can respond.",
    stages: ["Limited pre-visit visibility", "Guest arrival concentration", "Reactive queue response", "Fragmented operating signals"],
    note: "The physical operation absorbs demand variability after guests arrive.",
  },
  after: {
    label: "After",
    title: "A planning signal moves the decision upstream.",
    stages: ["Historical wait-time insight", "Informed visit planning", "More distributed demand", "Clearer operating visibility"],
    note: "The public tool gives guests a planning input before they enter the physical queue.",
  },
};

export function AssessmentStory() {
  const [active, setActive] = useState(0);
  const cards = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.index || 0));
      },
      { rootMargin: "-30% 0px -45%", threshold: [0.25, 0.55, 0.8] },
    );
    cards.current.forEach((card) => card && observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const current = assessmentSteps[active];

  return (
    <div className="motm-story-grid">
      <aside className="motm-story-console" aria-live="polite">
        <div className="motm-console-top"><span>Operational assessment</span><b>0{active + 1} / 06</b></div>
        <div className="motm-console-water" aria-hidden="true"><i /><i /><i /><i /></div>
        <span className="motm-console-label">{current.label}</span>
        <h3>{current.title}</h3>
        <div className="motm-console-outputs">{current.outputs.map((output) => <span key={output}>{output}</span>)}</div>
        <div className="motm-console-progress"><i style={{ width: `${((active + 1) / assessmentSteps.length) * 100}%` }} /></div>
      </aside>
      <div className="motm-story-list">
        {assessmentSteps.map((step, index) => (
          <article
            className={active === index ? "motm-story-card active" : "motm-story-card"}
            data-index={index}
            key={step.label}
            ref={(node) => { cards.current[index] = node; }}
            onFocus={() => setActive(index)}
            onMouseEnter={() => setActive(index)}
            tabIndex={0}
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

export function GuestFlowExplorer() {
  const [active, setActive] = useState(0);
  const current = guestFlow[active];

  return (
    <div className="motm-flow-explorer">
      <div className="motm-flow-track" role="list" aria-label="Guest operating flow">
        {guestFlow.map((node, index) => (
          <div className="motm-flow-item" role="listitem" key={node.label}>
            <button type="button" className={active === index ? "active" : ""} aria-pressed={active === index} onClick={() => setActive(index)}>
              <b>0{index + 1}</b><span>{node.label}</span>
            </button>
            {index < guestFlow.length - 1 ? <i aria-hidden="true">↓</i> : null}
          </div>
        ))}
      </div>
      <div className="motm-flow-readout" aria-live="polite">
        <span>Active operating control</span>
        <strong>{current.control}</strong>
        <p>{current.detail}</p>
      </div>
    </div>
  );
}

export function BeforeAfterFlow() {
  const [mode, setMode] = useState<"before" | "after">("before");
  const current = flowStates[mode];

  return (
    <div className="motm-before-after">
      <div className="motm-mode-switch" role="group" aria-label="Compare operating flow">
        <button type="button" className={mode === "before" ? "active" : ""} aria-pressed={mode === "before"} onClick={() => setMode("before")}>Before insight</button>
        <button type="button" className={mode === "after" ? "active" : ""} aria-pressed={mode === "after"} onClick={() => setMode("after")}>With planning insight</button>
      </div>
      <div className={`motm-state-panel ${mode}`} aria-live="polite">
        <div className="motm-state-title"><span>{current.label}</span><h3>{current.title}</h3></div>
        <div className="motm-state-flow">
          {current.stages.map((stage, index) => <div key={stage}><b>0{index + 1}</b><strong>{stage}</strong>{index < current.stages.length - 1 ? <i aria-hidden="true">→</i> : null}</div>)}
        </div>
        <p>{current.note}</p>
      </div>
    </div>
  );
}

function AnimatedMetric({ value, suffix, label }: { value: number; suffix?: string; label: string }) {
  const [display, setDisplay] = useState(0);
  const target = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const started = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - started) / 900, 1);
        setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      observer.disconnect();
    }, { threshold: 0.45 });
    if (target.current) observer.observe(target.current);
    return () => observer.disconnect();
  }, [value]);

  return <div ref={target}><strong>{display}{suffix}</strong><span>{label}</span></div>;
}

export function AssessmentMetrics() {
  return (
    <div className="motm-metrics" aria-label="Assessment scope metrics">
      <AnimatedMetric value={8} label="guest-flow stages" />
      <AnimatedMetric value={6} label="supported contributions" />
      <AnimatedMetric value={3} label="public evidence links" />
    </div>
  );
}
