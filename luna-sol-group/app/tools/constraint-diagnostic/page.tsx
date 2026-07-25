import type { Metadata } from "next";
import Link from "next/link";
import { ConstraintDiagnostic } from "../../components/ConstraintDiagnostic";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Constraint Hypothesis Map",
  description: "Build an evidence-weighted test sequence across demand, capacity, quality, flow, decision rights, and measurement integrity.",
  alternates: { canonical: "/tools/constraint-diagnostic" },
  openGraph: {
    title: "Constraint Hypothesis Map",
    description: "Prioritize which operating hypothesis to test first—without presenting a self-assessment as a root-cause diagnosis.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Luna Sol Group constraint diagnostic tool" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Constraint Hypothesis Map",
    description: "Prioritize which operating hypothesis to test first—without presenting a self-assessment as a root-cause diagnosis.",
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
            <span className="kicker">Operations Lab · Evidence-weighted triage</span>
            <h1>Decide what to <em>test first.</em></h1>
            <p>
              Structure the six most common explanations for an operating problem, mark what the evidence actually supports,
              and leave with a falsifiable first test—not a software-generated claim that the root cause has been found.
            </p>
            <div className="diagnostic-facts">
              <span><strong>6</strong> Operating hypotheses</span>
              <span><strong>24</strong> Evidence inputs</span>
              <span><strong>1</strong> Prioritized test sequence</span>
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
            <span className="section-label light">How to use the output</span>
            <div className="after-grid">
              <div><b>01</b><h3>Challenge the evidence</h3><p>Ask which observation is measured, which is inferred, and which would be contested by the frontline or finance.</p></div>
              <div><b>02</b><h3>Run the falsifier</h3><p>Test the leading hypothesis against the condition that would weaken it before allocating resources.</p></div>
              <div><b>03</b><h3>Model the decision</h3><p>If the hypothesis survives, use the Recovery Model to quantify the capacity or timing consequence.</p></div>
            </div>
            <p className="diagnostic-case-link"><Link href="/tools">Return to the Operations Lab <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
