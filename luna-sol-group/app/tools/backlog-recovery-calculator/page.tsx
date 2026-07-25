import type { Metadata } from "next";
import Link from "next/link";
import { BacklogCalculator } from "../../components/BacklogCalculator";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Free Backlog Recovery Calculator",
  description: "A free, generic queue-recovery model for any backlog problem—support tickets, claims, orders, inspections, or grading submissions. Model demand, capacity, quality loss, and time-to-target.",
  alternates: { canonical: "/tools/backlog-recovery-calculator" },
  openGraph: {
    title: "Free Backlog Recovery Calculator",
    description: "Model your own backlog recovery: demand, capacity, quality loss, and time-to-target, in your browser.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Luna Sol Group backlog recovery calculator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Backlog Recovery Calculator",
    description: "Model your own backlog recovery: demand, capacity, quality loss, and time-to-target, in your browser.",
    images: ["/og.png"],
  },
};

export default function BacklogRecoveryCalculatorPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Operations Lab · Queue-flow scenario model</span>
            <h1>Model your own <em>backlog recovery.</em></h1>
            <p>
              The same recovery mechanics behind Luna Sol&rsquo;s PSA case study, generalized for any queue-shaped
              operating problem. Change demand, capacity, utilization, quality loss, aging work, and productivity
              assumptions, and see the modeled path to a controlled backlog.
            </p>
            <div className="diagnostic-facts">
              <span><strong>10</strong> Adjustable operating inputs</span>
              <span><strong>4</strong> Decision outputs</span>
              <span><strong>0</strong> Data stored unless you submit it</span>
            </div>
          </div>
        </section>
        <section className="section paper diagnostic-page-section">
          <div className="shell">
            <BacklogCalculator />
          </div>
        </section>
        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">Where this comes from</span>
            <div className="after-grid">
              <div><b>01</b><h3>Built for a real engagement</h3><p>This model is a generalized version of the recovery mechanics Luna Sol used on PSA&rsquo;s grading-backlog stabilization.</p></div>
              <div><b>02</b><h3>Works for any queue</h3><p>Support tickets, insurance claims, order fulfillment, inspections, permit review&mdash;anything with inbound demand and finite capacity.</p></div>
              <div><b>03</b><h3>Yours to keep or share</h3><p>Nothing is stored unless you choose to send a scenario to Ryan. Bookmark the page and rerun it any time your assumptions change.</p></div>
            </div>
            <p className="diagnostic-case-link"><Link href="/tools/constraint-diagnostic">Still testing the cause? Build the constraint hypothesis first <span aria-hidden="true">→</span></Link></p>
            <p className="diagnostic-case-link"><Link href="/work/psa">See the case-specific PSA application <span aria-hidden="true">→</span></Link></p>
            <p className="diagnostic-case-link"><Link href="/tools">Return to the Operations Lab <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
