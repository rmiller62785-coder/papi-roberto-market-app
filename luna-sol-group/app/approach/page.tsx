import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Decision-Grade Operating Intelligence",
  description: "The Luna Sol decision system: establish operating truth, form a falsifiable constraint hypothesis, test intervention economics, and install durable control.",
  alternates: { canonical: "/approach" },
};

const decisionSystem = [
  {
    n: "01",
    eyebrow: "Evidence",
    title: "Establish operating truth.",
    description: "Reconcile dashboards, raw workflow evidence, frontline reality, and financial consequence before asking leadership to act.",
    outputs: ["Claim and source registry", "Signal-integrity audit", "Fact base with confidence labels"],
    link: { href: "/work/psa#evidence", label: "Inspect a live evidence room" },
  },
  {
    n: "02",
    eyebrow: "Hypothesis",
    title: "Name what must be tested.",
    description: "Turn competing explanations into falsifiable hypotheses, then sequence the minimum evidence needed to identify the binding constraint.",
    outputs: ["Constraint hypothesis map", "Falsification tests", "Decision unlocked by each test"],
    link: { href: "/tools/constraint-diagnostic", label: "Build a constraint hypothesis" },
  },
  {
    n: "03",
    eyebrow: "Economics",
    title: "Model the intervention path.",
    description: "Connect demand, effective capacity, quality loss, investment, and timing so leaders can compare mechanisms—not just recommendations.",
    outputs: ["Scenario and sensitivity model", "Capacity or value gap", "Thresholds for action"],
    link: { href: "/tools/backlog-recovery-calculator", label: "Model a recovery scenario" },
  },
  {
    n: "04",
    eyebrow: "Implementation",
    title: "Make the change executable.",
    description: "Convert the chosen path into launch gates, process ownership, decision rights, tested controls, and a handoff the steady-state team can accept.",
    outputs: ["Launch-readiness decision", "SOP and RACI architecture", "Risk-and-control register"],
    link: { href: "/tools/implementation-workbench", label: "Build the implementation system" },
  },
  {
    n: "05",
    eyebrow: "Control",
    title: "Make the result operable.",
    description: "Translate the chosen path into owners, decision rights, leading indicators, escalation thresholds, and a cadence operators can run under pressure.",
    outputs: ["Operating architecture", "Executive control cadence", "Benefits-verification mechanism"],
    link: { href: "/tools/executive-operations-studio", label: "Run the control system" },
  },
];

const standards = [
  { b: "01", h3: "Claim provenance", p: "Every material public claim carries a source, date, and attribution boundary. Engagement scope and company-reported outcomes remain visibly separate." },
  { b: "02", h3: "Model transparency", p: "Inputs, assumptions, formulas, and sensitivity ranges are inspectable. A modeled output is labeled as a model—not presented as observed fact." },
  { b: "03", h3: "Decision traceability", p: "Analysis is organized around the decision it supports, the evidence that could change it, and the owner accountable for acting." },
  { b: "04", h3: "Permissioned validation", p: "No client quote is published without explicit approval. An absent testimonial is not turned into a placeholder or synthetic endorsement." },
];

export default function ApproachPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero approach-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Luna OS™ · Decision system</span>
            <h1>Evidence in. <em>Controlled execution out.</em></h1>
            <p>Luna Sol converts contested operating signals into a decision-ready fact base, a falsifiable constraint hypothesis, an executable intervention, and a control system that holds after the engagement ends.</p>
            <div className="diagnostic-facts">
              <span><strong>01</strong> Establish operating truth</span>
              <span><strong>02</strong> Test the material constraint</span>
              <span><strong>03</strong> Install durable control</span>
            </div>
          </div>
        </section>

        <section className="section paper">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">The decision system</span><h2>Five gates between signal and sustained value.</h2></div>
              <p>Each gate produces an executive decision and an operator-owned mechanism. The tools and case studies on this site demonstrate the same architecture at different levels of fidelity.</p>
            </div>
            <div className="approach-system-grid">
              {decisionSystem.map((stage) => (
                <article className="approach-system-card" key={stage.n}>
                  <div><b>{stage.n}</b><span>{stage.eyebrow}</span></div>
                  <h3>{stage.title}</h3>
                  <p>{stage.description}</p>
                  <ul>{stage.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
                  <Link href={stage.link.href}>{stage.link.label} <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section diagnostic-after">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Decision-grade standard</span><h2>Trust is designed into the work.</h2></div>
              <p>Technology can accelerate analysis. It does not replace evidence, judgment, attribution, or accountability.</p>
            </div>
            <div className="approach-standard-grid">
              {standards.map((standard) => <article key={standard.b}><b>{standard.b}</b><h3>{standard.h3}</h3><p>{standard.p}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section paper2 principal-section">
          <div className="shell principal-grid">
            <div className="principal-card approach-control-card">
              <span>Decision control</span>
              <dl>
                <div><dt>Question</dt><dd>What must leadership decide?</dd></div>
                <div><dt>Evidence</dt><dd>What would change that decision?</dd></div>
                <div><dt>Mechanism</dt><dd>What must operators run differently?</dd></div>
                <div><dt>Control</dt><dd>How will leadership know it is holding?</dd></div>
              </dl>
            </div>
            <div className="principal-copy">
              <span className="section-label">The practical difference</span>
              <h2>A recommendation can be admired. A control system can be run.</h2>
              <p className="principal-lead">The work is complete only when the operating team can see the signal, make the decision, execute the mechanism, and verify the result without depending on the consultant.</p>
              <p>The Implementation Workbench makes an approved change executable. The Executive Operations Studio keeps the resulting operation under control. The case studies show how the same standard is applied to real operating environments.</p>
              <div className="approach-actions"><Link className="button" href="/tools/executive-operations-studio">Use the Executive Operations Studio</Link><Link className="text-link dark" href="/tools/implementation-workbench">Open the Implementation Workbench →</Link><Link className="text-link dark" href="/#featured-work">Explore the case studies →</Link></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
