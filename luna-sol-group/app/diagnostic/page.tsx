import type { Metadata } from "next";
import Link from "next/link";
import { PsaRecoveryTwin } from "../components/PsaRecoveryTwin";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "PSA Recovery Digital Twin",
  description: "An interactive, sanitized operating model for testing backlog recovery, capacity, demand, quality, and control-threshold scenarios.",
  alternates: { canonical: "/diagnostic" },
};

export default function DiagnosticPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">PSA recovery digital twin · Sanitized portfolio reconstruction</span>
            <h1>Test the mechanics behind a <em>controlled recovery.</em></h1>
            <p>Model how inbound demand, rated capacity, utilization, rework, aging work, surge capacity, and productivity gains change the path from an 11 million-unit public checkpoint toward a five million-unit control threshold.</p>
            <div className="diagnostic-facts">
              <span><strong>10</strong> Adjustable operating inputs</span>
              <span><strong>6</strong> Decision outputs</span>
              <span><strong>0</strong> Data stored</span>
            </div>
          </div>
        </section>
        <section className="section paper diagnostic-page-section">
          <div className="shell">
            <PsaRecoveryTwin />
          </div>
        </section>
        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">How leadership uses the model</span>
            <div className="after-grid">
              <div><b>01</b><h3>Pressure-test the target</h3><p>See whether current effective throughput can reach the operating threshold inside the desired window.</p></div>
              <div><b>02</b><h3>Expose the capacity gap</h3><p>Separate theoretical capacity from output after utilization, quality, aging-work, and demand effects.</p></div>
              <div><b>03</b><h3>Choose the mechanism</h3><p>Compare intake controls, surge labor, process gains, and durable capacity before committing resources.</p></div>
            </div>
            <p className="diagnostic-case-link"><Link href="/work/psa">Read the evidence-backed PSA case study <span aria-hidden="true">→</span></Link></p>
            <p className="diagnostic-case-link"><Link href="/tools">Return to the Operations Lab <span aria-hidden="true">→</span></Link></p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
