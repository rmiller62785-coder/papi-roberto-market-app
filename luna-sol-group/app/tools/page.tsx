import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Operations Products",
  description: "A working executive operations studio plus transparent decision utilities for control towers, portfolio governance, weekly business reviews, constraint testing, and recovery modeling.",
  alternates: { canonical: "/tools" },
};

const utilities = [
  {
    n: "01",
    type: "Triage utility",
    title: "Constraint Hypothesis Map",
    description: "Rank which operating mechanism deserves evidence first without pretending a self-assessment is a root-cause diagnosis.",
    output: "Prioritized hypotheses, falsifiers, next tests, and the decision each test unlocks.",
    href: "/tools/constraint-diagnostic",
    cta: "Build the hypothesis map",
  },
  {
    n: "02",
    type: "Scenario utility",
    title: "Backlog Recovery Model",
    description: "Translate demand, effective capacity, quality loss, surge options, and timing into an operating recovery path.",
    output: "Net burn, weeks to threshold, throughput requirement, capacity gap, and sensitivity range.",
    href: "/tools/backlog-recovery-calculator",
    cta: "Model a recovery path",
  },
  {
    n: "03",
    type: "Case proof",
    title: "PSA Recovery Digital Twin",
    description: "A sanitized reconstruction connecting the public PSA backlog arc to adjustable recovery mechanics.",
    output: "A case-calibrated scenario with demand-shock sensitivity and a transparent attribution boundary.",
    href: "/diagnostic",
    cta: "Open the case model",
  },
];

export default function ToolsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero lab-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Luna Sol Operations Products</span>
            <h1>Inspect the operating mechanisms—not just <em>the claims.</em></h1>
            <p>The flagship studio runs a complete executive workflow. The supporting utilities isolate individual decisions. Every model publishes its assumptions and produces an artifact you can use outside the website.</p>
            <div className="diagnostic-facts">
              <span><strong>3</strong> Connected studio modules</span>
              <span><strong>3</strong> Focused decision utilities</span>
              <span><strong>0</strong> Signup required</span>
            </div>
          </div>
        </section>

        <section className="section lab-flagship-section">
          <div className="shell lab-flagship-grid">
            <div className="lab-flagship-copy">
              <span className="section-label light">Flagship product</span>
              <h2>Executive Operations Studio</h2>
              <p>One working environment for the mechanisms senior operators are expected to build: a 13-week control tower, a value-and-risk portfolio optimizer, and a weekly business review with decision closure.</p>
              <ul><li>Import weekly operating data from CSV</li><li>Model capacity, demand shocks, quality loss, and backlog</li><li>Prioritize initiatives inside a funding envelope</li><li>Generate a 90-day activation sequence</li><li>Export an executive brief, portfolio, and WBR memo</li></ul>
              <Link className="button" href="/tools/executive-operations-studio">Open the working studio <span aria-hidden="true">→</span></Link>
            </div>
            <div className="lab-flagship-preview" aria-label="Executive Operations Studio preview">
              <div className="lab-preview-top"><span>Operating control view</span><b>WATCH</b></div>
              <div className="lab-preview-kpis"><div><span>Coverage</span><strong>100.7%</strong></div><div><span>13-week backlog</span><strong>16.1k</strong></div><div><span>Portfolio value</span><strong>$29.1M</strong></div><div><span>KPIs controlled</span><strong>4/5</strong></div></div>
              <div className="lab-preview-flow"><span>Data</span><i>→</i><span>Scenario</span><i>→</i><span>Portfolio</span><i>→</i><span>WBR</span></div>
              <div className="lab-preview-modules"><article><b>01</b><span>Control Tower</span><small>Demand · capacity · quality · risk</small></article><article><b>02</b><span>Portfolio</span><small>Value · readiness · investment</small></article><article><b>03</b><span>WBR</span><small>KPI · owner · decision · closure</small></article></div>
              <p>Local data mode · published formulas · exportable outputs</p>
            </div>
          </div>
        </section>

        <section className="section paper lab-section">
          <div className="shell">
            <div className="section-heading compact-heading"><div><span className="section-label">Decision utilities</span><h2>Use one mechanism<br />without opening the full studio.</h2></div><p>These smaller tools are deliberately narrow. They structure a first test, one recovery scenario, or a public case reconstruction.</p></div>
            <div className="lab-grid">
              {utilities.map((tool) => (
                <article className="lab-card" key={tool.n}>
                  <header><b>{tool.n}</b><span>{tool.type}</span></header>
                  <h2>{tool.title}</h2><p>{tool.description}</p>
                  <dl><div><dt>Produces</dt><dd>{tool.output}</dd></div></dl>
                  <Link href={tool.href}>{tool.cta} <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
            <p className="lab-boundary"><strong>Product boundary:</strong> The products structure operating decisions and produce inspectable artifacts. They do not replace source-system validation, frontline observation, legal or compliance review, or accountable executive judgment.</p>
          </div>
        </section>

        <section className="section diagnostic-after lab-after">
          <div className="shell narrow-shell">
            <span className="section-label light">When the generic model stops</span>
            <h2>A product creates leverage only when the operating system can act on it.</h2>
            <p>Luna Sol adapts the data model, decision rights, thresholds, integrations, and management cadence to the business—not the other way around.</p>
            <div className="approach-actions"><Link className="button button-light" href="/#contact">Discuss the operating decision</Link><Link className="text-link light" href="/approach">See the Luna OS decision system →</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
