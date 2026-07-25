import type { Metadata } from "next";
import Link from "next/link";
import { ConstraintDiagnostic } from "../../components/ConstraintDiagnostic";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Free Constraint Diagnostic",
  description: "A free, transparent tool for ranking the likely binding constraint behind an operating problem across six categories: demand, capacity, quality, sequencing, decision rights, and measurement integrity.",
  alternates: { canonical: "/tools/constraint-diagnostic" },
  openGraph: {
    title: "Free Constraint Diagnostic",
    description: "Rank six candidate root causes for an operating problem. Transparent scoring, no black box.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Luna Sol Group constraint diagnostic tool" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Constraint Diagnostic",
    description: "Rank six candidate root causes for an operating problem. Transparent scoring, no black box.",
    images: ["/og.png"],
  },
};

export default function ConstraintDiagnosticPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Free tool &middot; No signup required &middot; No AI model involved</span>
            <h1>Rank the likely <em>binding constraint.</em></h1>
            <p>
              The same causal-decomposition step behind every Luna Sol engagement, before any redesign work
              starts. Rate six candidate categories&mdash;demand, capacity, quality, sequencing, decision rights,
              and measurement integrity&mdash;and see a transparent, scored ranking of where to look first.
            </p>
            <div className="diagnostic-facts">
              <span><strong>6</strong> Candidate constraint categories</span>
              <span><strong>18</strong> Inputs, fully visible in the score</span>
              <span><strong>0</strong> Black-box reasoning</span>
            </div>
          </div>
        </section>
        <section className="section paper diagnostic-page-section">
          <div className="shell">
            <ConstraintDiagnostic />
          </div>
        </section>
        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">Why this is scored, not generated</span>
            <div className="after-grid">
              <div><b>01</b><h3>No language model in the loop</h3><p>The ranking is a fixed, published weighting of your own inputs&mdash;half your stated suspicion, half the yes/no evidence checks. Nothing is generated; everything is computed.</p></div>
              <div><b>02</b><h3>A hypothesis, not a verdict</h3><p>The output names a next diagnostic step, not a conclusion. Luna Sol&rsquo;s actual engagements validate a ranking like this against real operating data before recommending action.</p></div>
              <div><b>03</b><h3>Pairs with the recovery model</h3><p>Once you have a binding-constraint hypothesis, the Backlog Recovery Calculator models what fixing it is actually worth.</p></div>
            </div>
            <p className="diagnostic-case-link"><Link href="/approach">Read why Luna Sol builds tools this way <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
