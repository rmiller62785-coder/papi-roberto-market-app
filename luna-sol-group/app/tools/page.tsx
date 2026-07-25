import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Operations Products",
  description: "Working operations products for executive control, implementation readiness, portfolio governance, SOP and RACI design, risk control, constraint testing, and recovery modeling.",
  alternates: { canonical: "/tools" },
};

const products = [
  {
    n: "01",
    type: "Executive control system",
    title: "Executive Operations Studio",
    description: "Run the management mechanisms behind operating control: a 13-week capacity tower, a value-and-risk transformation portfolio, and a weekly business review with decision closure.",
    outputs: ["Capacity and backlog scenario", "Funded portfolio and 90-day sequence", "Executive WBR decision memo"],
    modules: ["Control Tower", "Portfolio", "WBR"],
    href: "/tools/executive-operations-studio",
    cta: "Open the Executive Operations Studio",
    status: "Working product · local data mode",
  },
  {
    n: "02",
    type: "Implementation control system",
    title: "Implementation Workbench",
    description: "Turn an approved strategy into an executable launch: weighted readiness gates, a process-level SOP and RACI, and a ranked risk-and-control register.",
    outputs: ["Go / no-go decision brief", "SOP and RACI process file", "Residual-risk control register"],
    modules: ["Launch Readiness", "SOP + RACI", "Risk + Control"],
    href: "/tools/implementation-workbench",
    cta: "Open the Implementation Workbench",
    status: "Working product · exportable artifacts",
  },
];

const utilities = [
  { n: "01", type: "Triage utility", title: "Constraint Hypothesis Map", description: "Rank which operating mechanism deserves evidence first without treating self-assessment as diagnosis.", output: "Hypotheses, falsifiers, next tests, and unlocked decisions.", href: "/tools/constraint-diagnostic", cta: "Build the hypothesis map" },
  { n: "02", type: "Scenario utility", title: "Backlog Recovery Model", description: "Translate demand, effective capacity, quality loss, surge options, and timing into a recovery path.", output: "Net burn, target timing, capacity gap, and sensitivity range.", href: "/tools/backlog-recovery-calculator", cta: "Model a recovery path" },
  { n: "03", type: "Case proof", title: "PSA Recovery Digital Twin", description: "Inspect a sanitized reconstruction connecting the public PSA backlog arc to adjustable recovery mechanics.", output: "A case-calibrated scenario with an explicit attribution boundary.", href: "/diagnostic", cta: "Open the case model" },
];

export default function ToolsPage() {
  return <>
    <SiteHeader />
    <main id="main">
      <section className="subpage-hero diagnostic-hero lab-hero">
        <div className="shell narrow-shell">
          <span className="kicker">Luna Sol Operations Products</span>
          <h1>Inspect the operating mechanisms—not just <em>the claims.</em></h1>
          <p>Two working environments cover the decisions before and after implementation. Focused utilities isolate a single question when the complete operating system is unnecessary.</p>
          <div className="diagnostic-facts">
            <span><strong>6</strong> Connected product modules</span>
            <span><strong>3</strong> Focused decision utilities</span>
            <span><strong>0</strong> Signup required</span>
          </div>
        </div>
      </section>

      <section className="section product-suite-section">
        <div className="shell">
          <div className="section-heading compact-heading dark-heading"><div><span className="section-label light">Flagship product suite</span><h2>Control the operation.<br />Then control the change.</h2></div><p>These are not lead-generation quizzes. Each is an editable working environment with published logic and outputs built to leave the browser.</p></div>
          <div className="product-suite-grid">
            {products.map((product) => <article className="product-suite-card" key={product.n}>
              <header><b>{product.n}</b><span>{product.type}</span><small>{product.status}</small></header>
              <h2>{product.title}</h2><p>{product.description}</p>
              <div className="product-module-rail">{product.modules.map((module, index) => <span key={module}><b>{String(index + 1).padStart(2, "0")}</b>{module}</span>)}</div>
              <div className="product-output-list"><span>Produces</span><ul>{product.outputs.map((output) => <li key={output}>{output}</li>)}</ul></div>
              <Link className="button" href={product.href}>{product.cta} <span aria-hidden="true">→</span></Link>
            </article>)}
          </div>
        </div>
      </section>

      <section className="section paper lab-section">
        <div className="shell">
          <div className="section-heading compact-heading"><div><span className="section-label">Decision utilities</span><h2>Isolate one decision<br />without opening a full system.</h2></div><p>Use these narrower models for initial triage, a recovery scenario, or inspection of a public case reconstruction.</p></div>
          <div className="lab-grid">{utilities.map((tool) => <article className="lab-card" key={tool.n}><header><b>{tool.n}</b><span>{tool.type}</span></header><h2>{tool.title}</h2><p>{tool.description}</p><dl><div><dt>Produces</dt><dd>{tool.output}</dd></div></dl><Link href={tool.href}>{tool.cta} <span aria-hidden="true">→</span></Link></article>)}</div>
          <p className="lab-boundary"><strong>Product boundary:</strong> These products structure operating decisions and produce inspectable artifacts. They do not replace source-system validation, frontline observation, legal or compliance review, or accountable executive judgment.</p>
        </div>
      </section>

      <section className="section diagnostic-after lab-after"><div className="shell narrow-shell"><span className="section-label light">When the generic model stops</span><h2>A product creates leverage only when the operating system can act on it.</h2><p>Luna Sol adapts the data model, decision rights, thresholds, integrations, and management cadence to the business—not the other way around.</p><div className="approach-actions"><Link className="button button-light" href="/#contact">Discuss the operating decision</Link><Link className="text-link light" href="/approach">See the Luna OS decision system →</Link></div></div></section>
    </main>
    <SiteFooter />
  </>;
}
