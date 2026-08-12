import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { capabilities } from "@/app/data/expertise";

export const metadata: Metadata = {
  title: "Capabilities | Performance, Operating Model & Transformation",
  description: "Operator-led capabilities in performance transformation, operating-model design, transformation execution, and digital operations.",
  alternates: { canonical: "/capabilities" },
};

export default function CapabilitiesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="depth-hero depth-hero-dark">
          <div className="shell depth-hero-grid">
            <div>
              <span className="depth-eyebrow">Capabilities · From diagnosis to control</span>
              <h1>Strategy becomes valuable when the operation can <em>run it.</em></h1>
            </div>
            <div className="depth-hero-aside">
              <p>Luna Sol connects the executive decision to the operating mechanism, implementation path, and management system required to hold the result.</p>
              <dl><div><dt>Entry point</dt><dd>The first unresolved decision</dd></div><div><dt>Exit condition</dt><dd>A mechanism the team can sustain</dd></div></dl>
            </div>
          </div>
        </section>

        <section className="depth-index-section">
          <div className="shell">
            <header className="depth-section-head"><div><span>What we do</span><h2>One operating thread. Four entry points.</h2></div><p>Each capability has its own questions, work modules, decision outputs, and evidence boundary.</p></header>
            <div className="depth-index-grid">
              {capabilities.map((item) => (
                <Link className="depth-index-card" href={`/capabilities/${item.slug}`} key={item.slug} prefetch={false}>
                  <span>{item.index}</span>
                  <div><h2>{item.title}</h2><p>{item.promise}</p></div>
                  <strong>Explore capability <i aria-hidden="true">↗</i></strong>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="depth-method-band">
          <div className="shell depth-method-grid"><div><span>Luna Sol decision system</span><h2>Truth → Constraint → Architecture → Adoption → Control</h2></div><div><p>The method remains constant while the starting point changes. Every phase should produce an inspectable decision, an accountable owner, and evidence of whether the mechanism works.</p><Link className="button button-light" href="/approach" prefetch={false}>Inspect the approach →</Link></div></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
