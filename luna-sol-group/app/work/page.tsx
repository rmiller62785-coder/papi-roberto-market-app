import type { Metadata } from "next";
import Link from "next/link";
import { HomeCaseIndex } from "../components/HomeCaseIndex";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Selected Work | Operating Transformation Case Studies",
  description: "Evidence-aware case studies from Luna Sol Group engagements with PSA, HopSkipDrive, and Maid of the Mist, with prior operating experience labeled separately.",
  alternates: { canonical: "/work" },
};

export default function WorkPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="firm-index-page">
        <section className="subpage-hero firm-index-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Selected work · Evidence-aware dossiers</span>
            <h1>Operating transformation, shown with the <em>claim boundary intact.</em></h1>
            <p>Three advisory engagements. Each story separates the operating context, Ryan Miller’s scope, the system designed, and the public evidence that can—and cannot—support the outcome.</p>
            <div className="diagnostic-facts"><span><strong>3</strong> Client engagements</span><span><strong>3</strong> Dedicated dossiers</span><span><strong>1</strong> Evidence standard</span></div>
          </div>
        </section>
        <HomeCaseIndex showHeading={false} />
        <section className="section work-principle-section">
          <div className="shell case-two-column">
            <div className="sticky-intro"><span className="section-label light">Portfolio standard</span><h2>What is not shown matters too.</h2></div>
            <div className="case-prose"><p className="case-lead">Confidential client material is not repackaged as public proof.</p><p>The dossiers use sanitized operating architecture, clearly labeled personal scope, public company information, and third-party sources. No implied testimonial, invented artifact, or sole-attribution claim is used to fill a credibility gap.</p><div className="work-principle-actions"><Link className="button button-light" href="/approach" prefetch={false}>Inspect the evidence standard →</Link><Link className="text-link light" href="/about" prefetch={false}>Meet the operator behind the work</Link></div></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
