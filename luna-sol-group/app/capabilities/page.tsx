import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const engagements = [
  { n: "01", title: "Constraint Diagnostic Sprint", trigger: "Performance has moved, explanations are competing, or the visible queue is not the real mechanism.", outputs: ["Operating fact base", "Constraint hypothesis and falsifier", "Value-at-stake bridge", "30-day countermeasure path"], unlocks: "A defensible first intervention." },
  { n: "02", title: "Operating System Build", trigger: "Growth, regulation, or complexity has outrun the workflows and controls carrying the operation.", outputs: ["Target operating model", "Decision rights and governance", "SOP + RACI architecture", "Technical and implementation roadmap"], unlocks: "A system the operation can execute." },
  { n: "03", title: "Transformation Control Office", trigger: "The strategy is approved, but work is fragmented, risks are aging, or value is not holding.", outputs: ["Portfolio and dependency control", "Launch and readiness gates", "Weekly business review cadence", "Benefits and risk verification"], unlocks: "Controlled execution and accountable value." },
];

export const metadata: Metadata = {
  title: "What We Solve | Operating Transformation Engagements",
  description: "Three focused Luna Sol engagement paths for constraint diagnosis, operating-system design, and transformation control.",
  alternates: { canonical: "/capabilities" },
};

export default function CapabilitiesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="firm-index-page capability-index-page">
        <section className="subpage-hero firm-index-hero"><div className="shell narrow-shell"><span className="kicker">What we solve · Three entry points</span><h1>Engage around the <em>operating decision.</em></h1><p>Luna Sol does not begin with a predetermined transformation package. The starting point is the consequential decision, the evidence currently available, and the smallest system capable of moving the result.</p><div className="diagnostic-facts"><span><strong>01</strong> Diagnose</span><span><strong>02</strong> Build</span><span><strong>03</strong> Control</span></div></div></section>
        <section className="section paper capability-ledger-section"><div className="shell"><header className="editorial-heading"><div><span className="section-label">Engagement architecture</span><h2>From ambiguity to controlled execution.</h2></div><p>Each entry point produces inspectable operating artifacts and ends with a decision the accountable team can own.</p></header><div className="capability-ledger">{engagements.map((item) => <article key={item.n}><header><span>{item.n}</span><h2>{item.title}</h2></header><div><strong>Use when</strong><p>{item.trigger}</p></div><div><strong>Produces</strong><ul>{item.outputs.map((output) => <li key={output}>{output}</li>)}</ul></div><div className="capability-unlock"><strong>Decision unlocked</strong><p>{item.unlocks}</p></div></article>)}</div></div></section>
        <section className="section capability-method-section"><div className="shell case-two-column"><div className="sticky-intro"><span className="section-label light">Luna OS™</span><h2>One method. Different starting gates.</h2></div><div className="case-prose"><p className="case-lead">Truth → Constraint → Architecture → Adoption → Control</p><p>The sequence stays consistent, but the engagement begins at the first unresolved decision. Existing evidence and working mechanisms are preserved; unsupported assumptions are exposed.</p><div className="work-principle-actions"><Link className="button button-light" href="/approach" prefetch={false}>Inspect the decision system →</Link><Link className="text-link light" href="/tools" prefetch={false}>Use the decision products</Link></div></div></div></section>
        <section className="section paper capability-close-section"><div className="shell narrow-shell"><span className="section-label">The first conversation</span><h2>Bring the decision your current operating system cannot resolve.</h2><p>Ryan reviews the context directly and identifies the evidence required, the smallest useful starting point, and whether Luna Sol is the right intervention.</p><Link className="button" href="/#contact" prefetch={false}>Discuss the operating decision →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
