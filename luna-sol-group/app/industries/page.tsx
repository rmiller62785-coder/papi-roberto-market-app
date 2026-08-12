import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { industries } from "@/app/data/expertise";

export const metadata: Metadata = {
  title: "Industries | Operating Transformation Expertise",
  description: "Focused operating expertise across logistics, mobility, consumer operations, and investor-backed businesses.",
  alternates: { canonical: "/industries" },
};

export default function IndustriesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="depth-hero depth-hero-navy">
          <div className="shell depth-hero-grid">
            <div><span className="depth-eyebrow">Industries · Operator depth</span><h1>Built where operations become <em>the customer promise.</em></h1></div>
            <div className="depth-hero-aside"><p>Luna Sol works in environments where physical flow, frontline execution, technology, risk, and economics must operate as one system.</p><dl><div><dt>Posture</dt><dd>Depth before breadth</dd></div><div><dt>Boundary</dt><dd>Evidence basis labeled by page</dd></div></dl></div>
          </div>
        </section>

        <section className="depth-index-section">
          <div className="shell"><header className="depth-section-head"><div><span>Industry focus</span><h2>Four operating environments.</h2></div><p>Each focus area is grounded in completed advisory work, prior operating experience, or a clearly labeled Luna Sol method proposition.</p></header><div className="depth-index-grid">{industries.map((item) => <Link className="depth-index-card" href={`/industries/${item.slug}`} key={item.slug} prefetch={false}><span>{item.index}</span><div><h2>{item.title}</h2><p>{item.promise}</p></div><strong>Explore industry <i aria-hidden="true">↗</i></strong></Link>)}</div></div>
        </section>

        <section className="depth-method-band"><div className="shell depth-method-grid"><div><span>Operating depth</span><h2>Lead where the record is credible.</h2></div><div><p>Luna Sol does not claim a universal industry footprint. The firm works where its operating pattern recognition is relevant and identifies when a decision requires additional specialist depth.</p><Link className="button button-light" href="/contact" prefetch={false}>Discuss the operating decision →</Link></div></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
