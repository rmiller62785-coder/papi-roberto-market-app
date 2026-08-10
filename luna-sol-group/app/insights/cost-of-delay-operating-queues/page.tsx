import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";
const path = "/insights/cost-of-delay-operating-queues";

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Cost of delay for operating queues—without pretending exposure is savings",
    description: "A finance-ready framework for estimating queue exposure while keeping modeled risk, cash impact, and realized value distinct.",
    datePublished: "2026-08-10",
    dateModified: "2026-08-10",
    mainEntityOfPage: `${siteUrl}${path}`,
    author: { "@type": "Person", name: "Ryan Miller", jobTitle: "Founder and Principal" },
    publisher: { "@type": "Organization", name: "Luna Sol Group", url: siteUrl },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Operations Insights", item: `${siteUrl}/insights` },
      { "@type": "ListItem", position: 3, name: "Cost of Delay for Operating Queues", item: `${siteUrl}${path}` },
    ],
  },
];

export const metadata: Metadata = {
  title: "Cost of Delay for Operating Queues | Exposure, Not Claimed Savings",
  description: "Estimate backlog cost-of-delay exposure without confusing modeled risk, avoidable cost, booked savings, and realized value.",
  alternates: { canonical: path },
};

export default function CostOfDelayInsight() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="insight-article">
        {structuredData.map((entry, index) => (
          <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }} />
        ))}
        <article>
          <header className="subpage-hero insight-article-hero">
            <div className="shell narrow-shell">
              <nav className="case-route insight-breadcrumb" aria-label="Breadcrumb">
                <Link href="/" prefetch={false}>Home</Link><span aria-hidden="true">/</span>
                <Link href="/insights" prefetch={false}>Insights</Link><span aria-hidden="true">/</span><b>Cost of delay</b>
              </nav>
              <span className="kicker">Operating brief · Queue economics</span>
              <h1>Use cost of delay to frame queue exposure—<em>not to manufacture savings.</em></h1>
              <p>A backlog is an operating state. Its financial meaning depends on what waiting changes: service penalties, working capital, cancellation risk, labor touches, or lost decision time.</p>
              <div className="insight-article-meta"><span>By Ryan Miller, EMBA</span><span>6-minute read</span><time dateTime="2026-08-10">August 10, 2026</time></div>
            </div>
          </header>

          <section className="section paper insight-article-section" aria-labelledby="delay-language-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">The finance translation</span><h2 id="delay-language-heading">Call the number what it is.</h2></div>
              <div className="case-prose insight-prose">
                <p className="case-lead">Modeled exposure is not booked savings, and risk reduction is not automatically cash impact.</p>
                <p>Cost-of-delay analysis is useful because it translates time into a comparable operating consequence. It becomes unreliable when several categories are collapsed into one dramatic dollar figure or when an avoided scenario is presented as realized value.</p>
                <div className="insight-equation" aria-label="Queue exposure equation">
                  <span>Modeled queue exposure</span>
                  <strong>Σ (ending backlog in week t × estimated cost per unit-week)</strong>
                  <p>Use the queue path over time. Multiplying only today&rsquo;s backlog by a monthly number can hide how quickly exposure changes.</p>
                </div>
                <p>A responsible executive brief shows a central estimate, a range, the included cost categories, the owner of each assumption, and how finance would validate any realized benefit after implementation.</p>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-framework-section" aria-labelledby="value-ladder-heading">
            <div className="shell narrow-shell">
              <span className="section-label light">The value ladder</span>
              <h2 id="value-ladder-heading" className="insight-section-title">Keep four financial statements separate.</h2>
              <div className="after-grid insight-value-grid">
                <div><b>01</b><h3>Exposure</h3><p>The estimated consequence if work remains in queue. It can include time-dependent risk without assuming the full amount will occur.</p></div>
                <div><b>02</b><h3>Avoidable cost</h3><p>The portion of exposure that a specific intervention can credibly influence, net of costs that continue regardless.</p></div>
                <div><b>03</b><h3>Realized value</h3><p>The observed change after implementation, measured against an agreed baseline and adjusted for other material causes.</p></div>
              </div>
              <p className="insight-value-note"><strong>Booked savings is a fourth test:</strong> finance determines whether realized value changes the P&amp;L, balance sheet, cash flow, or only operational risk.</p>
            </div>
          </section>

          <section className="section paper insight-checklist-section" aria-labelledby="delay-checklist-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">Assumption register</span><h2 id="delay-checklist-heading">Build the estimate from observable consequences.</h2></div>
              <div className="insight-checklist">
                <ol>
                  <li><strong>Define the unit and clock.</strong><span>Ticket-day, claim-week, order-day, permit-week, or another interval that matches how harm accumulates.</span></li>
                  <li><strong>Separate direct cost.</strong><span>Penalties, expedited shipping, repeat handling, storage, contractor premiums, or other attributable spend.</span></li>
                  <li><strong>Label probabilistic risk.</strong><span>Cancellation, churn, regulatory breach, or lost revenue should include probability and evidence—not certainty.</span></li>
                  <li><strong>Avoid double counting.</strong><span>Do not add revenue at risk, margin at risk, and customer lifetime value when they describe the same economic event.</span></li>
                  <li><strong>Include intervention cost.</strong><span>Surge labor, technology, quality controls, training, and change capacity belong in the decision case.</span></li>
                  <li><strong>Assign validation owners.</strong><span>Finance, operations, commercial, and compliance should approve the assumptions they own.</span></li>
                </ol>
                <div className="mandate-box insight-boundary-box"><span>Model boundary</span><p>A cost-of-delay estimate is a scenario input, not an accounting conclusion or promise of savings. Validate material values with finance and legal or compliance owners, and report realized outcomes separately from modeled exposure.</p></div>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-action-section" aria-labelledby="delay-action-heading">
            <div className="shell narrow-shell insight-action-grid">
              <div><span className="section-label light">Connect economics to flow</span><h2 id="delay-action-heading">First model the queue path. Then price the exposure.</h2><p>Recovery timing determines how long each unit remains exposed. Use the calculator to create that operating path before attaching a cost-of-delay assumption.</p></div>
              <div className="insight-action-links">
                <Link className="button button-light" href="/tools/backlog-recovery-calculator" prefetch={false}>Model the recovery path →</Link>
                <Link className="text-link light" href="/tools/constraint-diagnostic" prefetch={false}>Test the operating constraint</Link>
                <Link className="text-link light" href="/work/psa" prefetch={false}>See evidence and attribution in practice</Link>
              </div>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
