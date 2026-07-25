import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Operations Lab",
  description: "Three transparent operating tools for moving from a contested signal to a testable constraint hypothesis and a modeled decision path.",
  alternates: { canonical: "/tools" },
};

const tools = [
  {
    n: "01",
    type: "Triage",
    title: "Constraint Hypothesis Map",
    description: "Rank which operating mechanism deserves evidence first—without pretending a self-assessment is a root-cause diagnosis.",
    useWhen: "Several explanations are competing and leadership needs a disciplined first test.",
    output: "Prioritized hypotheses, a falsifier, the next test, and the decision that test unlocks.",
    href: "/tools/constraint-diagnostic",
    cta: "Build the hypothesis map",
  },
  {
    n: "02",
    type: "Scenario",
    title: "Backlog Recovery Model",
    description: "Translate demand, effective capacity, quality loss, surge options, and timing into an operating recovery path.",
    useWhen: "A queue is visible and leaders need to compare the capacity required with the capacity available.",
    output: "Net burn, weeks to threshold, throughput requirement, capacity gap, and sensitivity range.",
    href: "/tools/backlog-recovery-calculator",
    cta: "Model a recovery path",
  },
  {
    n: "03",
    type: "Case proof",
    title: "PSA Recovery Digital Twin",
    description: "A sanitized, case-specific reconstruction connecting the public PSA backlog arc to adjustable recovery mechanics.",
    useWhen: "You want to inspect how Luna Sol turns a live operating case into an auditable decision model.",
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
            <span className="kicker">Luna Sol Operations Lab</span>
            <h1>From contested signal to a <em>testable decision.</em></h1>
            <p>Use the tools in sequence or independently. Each exposes its assumptions, computes locally in your browser, and tells you where the model stops and operating validation must begin.</p>
            <div className="diagnostic-facts">
              <span><strong>3</strong> Distinct decision tools</span>
              <span><strong>0</strong> Signup required to use them</span>
              <span><strong>1</strong> Shared decision architecture</span>
            </div>
          </div>
        </section>

        <section className="section paper lab-section">
          <div className="shell">
            <div className="lab-sequence" aria-label="Operations Lab sequence"><span>Signal</span><i>→</i><span>Hypothesis</span><i>→</i><span>Scenario</span><i>→</i><span>Decision</span><i>→</i><span>Control</span></div>
            <div className="lab-grid">
              {tools.map((tool) => (
                <article className="lab-card" key={tool.n}>
                  <header><b>{tool.n}</b><span>{tool.type}</span></header>
                  <h2>{tool.title}</h2><p>{tool.description}</p>
                  <dl><div><dt>Use when</dt><dd>{tool.useWhen}</dd></div><div><dt>Produces</dt><dd>{tool.output}</dd></div></dl>
                  <Link href={tool.href}>{tool.cta} <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
            <p className="lab-boundary"><strong>Model boundary:</strong> These tools structure a hypothesis or scenario. They do not replace direct observation, operating data, frontline validation, or executive judgment.</p>
          </div>
        </section>

        <section className="section diagnostic-after lab-after">
          <div className="shell narrow-shell">
            <span className="section-label light">When the model is no longer enough</span>
            <h2>A decision tool creates leverage only when the organization can act on it.</h2>
            <p>When the issue crosses functions, incentives, technology, governance, or material financial risk, Luna Sol turns the model into an operating architecture and implementation path.</p>
            <div className="approach-actions"><Link className="button button-light" href="/#contact">Discuss the operating decision</Link><Link className="text-link light" href="/approach">See the Luna OS decision system →</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
