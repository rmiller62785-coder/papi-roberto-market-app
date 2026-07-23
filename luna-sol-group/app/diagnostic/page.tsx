import type { Metadata } from "next";
import { DiagnosticEngine } from "../components/DiagnosticEngine";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Executive Signal Diagnostic",
  description: "Score six operating conditions and receive a decision-ready view of the intervention your operating problem may require.",
  alternates: { canonical: "/diagnostic" },
};

export default function DiagnosticPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Executive signal diagnostic · Directional, not promotional</span>
            <h1>Find the intervention your operating problem <em>actually requires.</em></h1>
            <p>Six conditions determine whether leadership needs a focused correction, a structured transformation, or an enterprise-level intervention. Your inputs stay in your browser.</p>
            <div className="diagnostic-facts">
              <span><strong>4 min</strong> Typical completion</span>
              <span><strong>6</strong> Operating conditions</span>
              <span><strong>0</strong> Data stored</span>
            </div>
          </div>
        </section>
        <section className="section paper diagnostic-page-section">
          <div className="shell">
            <DiagnosticEngine />
          </div>
        </section>
        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">How to use the result</span>
            <div className="after-grid">
              <div><b>01</b><h3>Challenge the score</h3><p>Ask which input would be most contested by the frontline, finance, or the customer.</p></div>
              <div><b>02</b><h3>Locate the mechanism</h3><p>Turn the highest-friction condition into a testable causal question—not a transformation slogan.</p></div>
              <div><b>03</b><h3>Name the decision</h3><p>Define what leadership must decide, by when, and what evidence would change that decision.</p></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
