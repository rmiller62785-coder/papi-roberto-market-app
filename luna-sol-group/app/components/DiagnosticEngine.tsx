"use client";

import { useMemo, useState } from "react";

type Inputs = {
  scale: number;
  variance: number;
  signal: number;
  latency: number;
  complexity: number;
  adoption: number;
};

const labels: Array<{ key: keyof Inputs; label: string; low: string; high: string }> = [
  { key: "scale", label: "Operating scale", low: "Local", high: "Enterprise" },
  { key: "variance", label: "Performance variance", low: "Stable", high: "Volatile" },
  { key: "signal", label: "Signal uncertainty", low: "Trusted", high: "Contested" },
  { key: "latency", label: "Decision latency", low: "Fast", high: "Slow" },
  { key: "complexity", label: "Cross-functional complexity", low: "Contained", high: "Systemic" },
  { key: "adoption", label: "Adoption drag", low: "Low", high: "High" },
];

const initial: Inputs = { scale: 72, variance: 64, signal: 58, latency: 55, complexity: 74, adoption: 62 };

function assessment(score: number, values: Inputs) {
  const ranked = labels
    .map((item) => ({ ...item, value: values[item.key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  if (score >= 72) {
    return {
      level: "Enterprise intervention",
      thesis: "The operating risk is systemic. Leadership needs one fact base, explicit decision rights, and a cross-functional control loop—not another isolated workstream.",
      first: "Establish an executive-owned constraint map and value bridge before committing the transformation portfolio.",
      ranked,
    };
  }
  if (score >= 46) {
    return {
      level: "Structured transformation",
      thesis: "The problem likely crosses data, process, governance, and adoption. A targeted redesign can work if the causal mechanism and owners are made explicit.",
      first: "Run a focused diagnostic to isolate the material constraint and define the minimum viable operating-system change.",
      ranked,
    };
  }
  return {
    level: "Focused correction",
    thesis: "The issue appears contained enough for a bounded intervention. Confirm the signal before expanding scope or governance.",
    first: "Test the highest-confidence mechanism with a named owner, threshold, and two-week verification window.",
    ranked,
  };
}

export function DiagnosticEngine() {
  const [values, setValues] = useState<Inputs>(initial);
  const [copied, setCopied] = useState(false);
  const score = Math.round(
    values.scale * 0.16 + values.variance * 0.19 + values.signal * 0.18 +
    values.latency * 0.13 + values.complexity * 0.19 + values.adoption * 0.15,
  );
  const result = useMemo(() => assessment(score, values), [score, values]);
  const brief = [
    "LUNA SOL GROUP — EXECUTIVE SIGNAL DIAGNOSTIC",
    `Transformation intensity: ${score}/100 — ${result.level}`,
    "",
    result.thesis,
    "",
    `First executive move: ${result.first}`,
    "",
    "Highest-friction conditions:",
    ...result.ranked.map((item, index) => `${index + 1}. ${item.label}: ${item.value}/100`),
    "",
    "Directional diagnostic only. Not a financial valuation or guarantee.",
  ].join("\n");

  async function copyBrief() {
    await navigator.clipboard.writeText(brief);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const mailto = `mailto:Rmiller62785@gmail.com?subject=${encodeURIComponent(`Operating diagnostic — ${result.level}`)}&body=${encodeURIComponent(brief)}`;

  return (
    <div className="diagnostic-engine">
      <div className="diagnostic-controls">
        <div className="diagnostic-intro">
          <span className="section-label">Six operating conditions</span>
          <p>Move each signal based on what is true now—not what the dashboard says should be true.</p>
        </div>
        {labels.map((item) => (
          <label className="diagnostic-slider" key={item.key}>
            <span><strong>{item.label}</strong><b>{values[item.key]}</b></span>
            <input
              type="range"
              min="0"
              max="100"
              value={values[item.key]}
              onChange={(event) => setValues({ ...values, [item.key]: Number(event.target.value) })}
            />
            <small><span>{item.low}</span><span>{item.high}</span></small>
          </label>
        ))}
      </div>
      <section className="diagnostic-output" aria-live="polite">
        <div className="output-score">
          <span>Transformation intensity</span>
          <strong>{score}<small>/100</small></strong>
        </div>
        <div>
          <span className="section-label">Assessment</span>
          <h2>{result.level}</h2>
          <p className="output-thesis">{result.thesis}</p>
        </div>
        <div className="priority-list">
          <span className="section-label">Highest-friction conditions</span>
          {result.ranked.map((item, index) => (
            <div key={item.key}><b>0{index + 1}</b><span>{item.label}</span><strong>{item.value}</strong></div>
          ))}
        </div>
        <div className="first-move">
          <span>First executive move</span>
          <p>{result.first}</p>
        </div>
        <div className="output-actions">
          <button className="button button-light" type="button" onClick={copyBrief}>{copied ? "Copied" : "Copy executive brief"}</button>
          <button className="text-button" type="button" onClick={() => window.print()}>Print / save PDF</button>
          <a className="text-button" href={mailto}>Send to Ryan</a>
        </div>
        <small className="diagnostic-disclaimer">Directional diagnostic only. It does not estimate financial value or guarantee an outcome.</small>
      </section>
    </div>
  );
}
