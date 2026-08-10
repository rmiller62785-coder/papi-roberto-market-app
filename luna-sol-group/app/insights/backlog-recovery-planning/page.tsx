import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";
const path = "/insights/backlog-recovery-planning";

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Backlog recovery planning: capacity is not the same as throughput",
    description: "A practical operating method for separating rated capacity, effective output, incoming demand, and the backlog recovery commitment.",
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
      { "@type": "ListItem", position: 3, name: "Backlog Recovery Planning", item: `${siteUrl}${path}` },
    ],
  },
];

export const metadata: Metadata = {
  title: "Backlog Recovery Planning: Capacity vs. Demand",
  description: "Learn how to calculate effective throughput, net backlog burn, recovery timing, and the capacity required to make an operating commitment credible.",
  alternates: { canonical: path },
};

export default function BacklogRecoveryPlanningInsight() {
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
                <Link href="/insights" prefetch={false}>Insights</Link><span aria-hidden="true">/</span><b>Backlog recovery planning</b>
              </nav>
              <span className="kicker">Operating brief · Capacity and queue control</span>
              <h1>Backlog recovery planning starts by separating <em>capacity from throughput.</em></h1>
              <p>Rated capacity describes a system under stated conditions. A credible recovery plan starts with the output the operation can actually realize—then compares it with the work still arriving.</p>
              <div className="insight-article-meta"><span>By Ryan Miller, EMBA</span><span>7-minute read</span><time dateTime="2026-08-10">August 10, 2026</time></div>
            </div>
          </header>

          <section className="section paper insight-article-section" aria-labelledby="planning-problem-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">The planning error</span><h2 id="planning-problem-heading">A capacity number is not a recovery plan.</h2></div>
              <div className="case-prose insight-prose">
                <p className="case-lead">Queues recover only when effective output remains above incoming demand long enough to reach a defined control threshold.</p>
                <p>Teams often begin with theoretical capacity: stations, labor hours, system slots, or vendor commitments. That is a useful ceiling, but it ignores utilization loss, rework, aged-work complexity, downtime, and the volatility of incoming demand.</p>
                <p>A date becomes credible only after those losses are visible. Otherwise, the “recovery plan” is a target divided by an output rate the operation has never demonstrated.</p>
                <div className="insight-equation" aria-label="Effective throughput equation">
                  <span>Effective throughput</span>
                  <strong>rated capacity × utilization × productivity × quality × aging factor + surge</strong>
                  <p>Every factor should be observable, explicitly assumed, or labeled for validation.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-framework-section" aria-labelledby="recovery-equations-heading">
            <div className="shell narrow-shell">
              <span className="section-label light">The recovery logic</span>
              <h2 id="recovery-equations-heading" className="insight-section-title">Three equations turn a queue into a decision.</h2>
              <div className="after-grid insight-equation-grid">
                <div><b>01</b><h3>Net backlog burn</h3><p><strong>Effective throughput − weekly inbound.</strong> If the result is zero or negative, the queue will not recover under the current assumptions.</p></div>
                <div><b>02</b><h3>Weeks to threshold</h3><p><strong>(Current backlog − control threshold) ÷ net burn.</strong> Use ceiling rounding when commitments are expressed in whole weeks.</p></div>
                <div><b>03</b><h3>Required throughput</h3><p><strong>Weekly inbound + backlog gap ÷ target weeks.</strong> The difference from effective throughput is the capacity gap.</p></div>
              </div>
            </div>
          </section>

          <section className="section paper insight-checklist-section" aria-labelledby="recovery-checklist-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">Decision checklist</span><h2 id="recovery-checklist-heading">Pressure-test the promise before publishing the date.</h2></div>
              <div className="insight-checklist">
                <ol>
                  <li><strong>Define the queue.</strong><span>Confirm what enters, exits, ages, reopens, or bypasses the backlog measure.</span></li>
                  <li><strong>Choose the control threshold.</strong><span>“Zero” is rarely required. Define the stable level the operating system can manage.</span></li>
                  <li><strong>Use demonstrated output.</strong><span>Reconcile rated capacity with realized utilization, yield, downtime, and skill constraints.</span></li>
                  <li><strong>Separate temporary and structural capacity.</strong><span>Overtime or contractors can bridge a window; they should not disguise an unstable base system.</span></li>
                  <li><strong>Stress demand and execution.</strong><span>Test what happens when inbound or effective throughput misses the central assumption.</span></li>
                  <li><strong>Name the decision owner.</strong><span>Assign who can fund capacity, reset scope, control intake, or change the target date.</span></li>
                </ol>
                <div className="mandate-box insight-boundary-box"><span>Model boundary</span><p>This framework is deterministic. It does not forecast demand, discover constraints, optimize a workforce, or validate the source data. Use it to expose assumptions and define the operating evidence required before action.</p></div>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-action-section" aria-labelledby="planning-action-heading">
            <div className="shell narrow-shell insight-action-grid">
              <div><span className="section-label light">Put the method to work</span><h2 id="planning-action-heading">Model the path. Then inspect the mechanism.</h2><p>The calculator turns your assumptions into recovery timing and a capacity gap. If it returns no recovery, move to constraint validation before asking the organization to commit more resources.</p></div>
              <div className="insight-action-links">
                <Link className="button button-light" href="/tools/backlog-recovery-calculator" prefetch={false}>Open the recovery calculator →</Link>
                <Link className="text-link light" href="/tools/constraint-diagnostic" prefetch={false}>Build the constraint hypothesis</Link>
                <Link className="text-link light" href="/work/psa" prefetch={false}>Review the PSA evidence room</Link>
              </div>
            </div>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
