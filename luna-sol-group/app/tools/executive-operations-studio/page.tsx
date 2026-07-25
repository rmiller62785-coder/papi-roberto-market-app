import type { Metadata } from "next";
import Link from "next/link";
import { ExecutiveOperationsStudio } from "../../components/ExecutiveOperationsStudio";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Executive Operations Studio",
  description: "A working operating system for 13-week capacity control, transformation portfolio decisions, and weekly executive business reviews.",
  alternates: { canonical: "/tools/executive-operations-studio" },
};

const proof = [
  { n: "01", title: "Self-service operating analytics", body: "Import a weekly CSV, reconcile demand and effective capacity, and expose the gap before it becomes a customer or cost event." },
  { n: "02", title: "Capacity and scenario planning", body: "Model demand shock, productive utilization, quality loss, flex capacity, backlog burn, and target timing over a 13-week horizon." },
  { n: "03", title: "Portfolio and benefits governance", body: "Challenge value, investment, confidence, readiness, urgency, and delivery risk inside a visible prioritization rule and funding envelope." },
  { n: "04", title: "WBR operating mechanisms", body: "Convert KPIs into thresholds, trend signals, named owners, decisions, due dates, and an exportable executive review memo." },
  { n: "05", title: "Business-to-technical translation", body: "The import schema, calculation logic, state model, and outputs make the product requirements inspectable instead of merely described." },
  { n: "06", title: "Data ownership by design", body: "The working state remains on the visitor’s device. No operating data is transmitted by the studio, and every output can be exported." },
];

export default function ExecutiveOperationsStudioPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="studio-hero">
          <div className="shell">
            <div className="studio-hero-grid">
              <div>
                <span className="kicker">Flagship product · Executive Operations Studio</span>
                <h1>Run the operating week <em>before it runs you.</em></h1>
                <p>A working control system for the decisions senior operators are hired to own: capacity, service, portfolio value, cross-functional execution, and weekly performance control.</p>
                <div className="studio-hero-actions"><a className="button" href="#studio">Open the working studio <span aria-hidden="true">↓</span></a><Link className="button button-ghost" href="/experience/amazon">See the operator experience behind it</Link></div>
              </div>
              <div className="studio-hero-proof">
                <div><span>Product modules</span><strong>3</strong><small>Control Tower · Portfolio · WBR</small></div>
                <div><span>Data path</span><strong>CSV</strong><small>Import · local state · export</small></div>
                <div><span>Decision horizon</span><strong>13 wk</strong><small>Adjustable from 4 to 26 weeks</small></div>
                <div><span>Black-box scoring</span><strong>0</strong><small>Every formula is published</small></div>
              </div>
            </div>
            <div className="studio-trust-strip"><span><i /> No signup</span><span><i /> Local working state</span><span><i /> Downloadable artifacts</span><span><i /> Transparent assumptions</span></div>
          </div>
        </section>

        <section className="studio-stage" id="studio">
          <div className="shell"><ExecutiveOperationsStudio /></div>
        </section>

        <section className="section paper studio-proof-section">
          <div className="shell">
            <div className="section-heading compact-heading"><div><span className="section-label">What the product demonstrates</span><h2>Not a portfolio claim.<br />An inspectable operating mechanism.</h2></div><p>The studio turns the capabilities normally buried in a résumé into a working system a COO, transformation leader, or hiring panel can interrogate directly.</p></div>
            <div className="studio-proof-grid">{proof.map((item) => <article key={item.n}><b>{item.n}</b><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
          </div>
        </section>

        <section className="section diagnostic-after studio-final-cta">
          <div className="shell narrow-shell">
            <span className="section-label light">From demonstration to deployment</span>
            <h2>The demo is generic. The operating architecture should not be.</h2>
            <p>Luna Sol adapts the data model, decision thresholds, owners, integrations, and review cadence to the way your operation actually creates value and risk.</p>
            <div className="approach-actions"><Link className="button button-light" href="/#contact">Discuss a comparable operating system</Link><Link className="text-link light" href="/tools">Explore the full Operations Lab →</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
