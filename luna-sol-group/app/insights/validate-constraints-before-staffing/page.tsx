import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";
const path = "/insights/validate-constraints-before-staffing";

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Validate the constraint before adding staffing",
    description: "An evidence sequence for determining whether labor, process, quality, scheduling, or technology is actually limiting operating output.",
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
      { "@type": "ListItem", position: 3, name: "Validate Constraints Before Staffing", item: `${siteUrl}${path}` },
    ],
  },
];

export const metadata: Metadata = {
  title: "Validate the Operating Constraint Before Adding Staffing",
  description: "Use observable tests to distinguish a labor shortage from process, quality, scheduling, skill-mix, technology, or demand-control constraints.",
  alternates: { canonical: path },
};

export default function ConstraintValidationInsight() {
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
                <Link href="/insights" prefetch={false}>Insights</Link><span aria-hidden="true">/</span><b>Constraint validation</b>
              </nav>
              <span className="kicker">Operating brief · Evidence before resourcing</span>
              <h1>Validate the operating constraint <em>before adding staffing.</em></h1>
              <p>A growing queue proves that effective output is below incoming demand. It does not prove that headcount is the limiting mechanism.</p>
              <div className="insight-article-meta"><span>By Ryan Miller, EMBA</span><span>8-minute read</span><time dateTime="2026-08-10">August 10, 2026</time></div>
            </div>
          </header>

          <section className="section paper insight-article-section" aria-labelledby="constraint-error-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">The diagnosis error</span><h2 id="constraint-error-heading">A symptom does not identify its mechanism.</h2></div>
              <div className="case-prose insight-prose">
                <p className="case-lead">The queue can grow because labor is insufficient. It can also grow because available labor is waiting, switching, reworking, or processing the wrong work.</p>
                <p>Staffing is visible, measurable, and purchasable, so it often becomes the default explanation. But adding people upstream of a technical bottleneck, into an unstable process, or without the required skill mix can increase work in process without increasing completed output.</p>
                <div className="insight-equation" aria-label="Constraint validation rule">
                  <span>Decision rule</span>
                  <strong>Fund the mechanism only after its predicted signal is observed</strong>
                  <p>A credible hypothesis states what evidence should appear if it is true—and what result would falsify it.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-framework-section" aria-labelledby="constraint-tests-heading">
            <div className="shell narrow-shell">
              <span className="section-label light">Competing hypotheses</span>
              <h2 id="constraint-tests-heading" className="insight-section-title">Six mechanisms deserve a test before the hiring request.</h2>
              <div className="insight-hypothesis-grid">
                <article><b>01</b><h3>True labor capacity</h3><p><strong>Signal:</strong> productive stations remain continuously loaded, service time is stable, and added trained hours create proportional completed output.</p></article>
                <article><b>02</b><h3>Skill mix</h3><p><strong>Signal:</strong> work waits at specific certifications or decision rights while other labor has availability.</p></article>
                <article><b>03</b><h3>Process flow</h3><p><strong>Signal:</strong> queues concentrate at handoffs, batching points, approvals, or exception loops rather than across the entire process.</p></article>
                <article><b>04</b><h3>Quality loss</h3><p><strong>Signal:</strong> rework, reopen rates, defects, or first-pass yield explain a material share of consumed capacity.</p></article>
                <article><b>05</b><h3>Schedule alignment</h3><p><strong>Signal:</strong> capacity and demand exist at different hours, days, sites, or service windows.</p></article>
                <article><b>06</b><h3>Technology or policy</h3><p><strong>Signal:</strong> downtime, latency, access, rules, or approval thresholds cap output while labor waits or works around the system.</p></article>
              </div>
            </div>
          </section>

          <section className="section paper insight-checklist-section" aria-labelledby="validation-sequence-heading">
            <div className="shell case-two-column">
              <div className="sticky-intro"><span className="section-label">Validation sequence</span><h2 id="validation-sequence-heading">Move from suspicion to a fundable decision.</h2></div>
              <div className="insight-checklist">
                <ol>
                  <li><strong>Map the work at queue level.</strong><span>Measure arrivals, completions, aging, WIP, service time, and waits by step—not only at the final output.</span></li>
                  <li><strong>Rank competing mechanisms.</strong><span>Use observed queue location, utilization, yield, downtime, and schedule patterns to prioritize tests.</span></li>
                  <li><strong>Write a falsifier.</strong><span>State what evidence would show the leading explanation is wrong before collecting more confirmatory data.</span></li>
                  <li><strong>Run the smallest discriminating test.</strong><span>A controlled shift, dedicated skill cell, batch-size change, downtime window, or quality intervention should distinguish mechanisms.</span></li>
                  <li><strong>Measure completed output.</strong><span>Do not declare success from activity, staffed hours, or local utilization if the end-to-end queue does not move.</span></li>
                  <li><strong>Scale only after the response is repeatable.</strong><span>Convert the test into a staffing, process, technology, or governance decision with an accountable owner.</span></li>
                </ol>
                <div className="mandate-box insight-boundary-box"><span>Decision boundary</span><p>A self-assessment ranks hypotheses; it does not diagnose a system. Validate the leading mechanism with direct observation and source-system data, and include safety, workforce, legal, and compliance owners where the test could affect people or service.</p></div>
              </div>
            </div>
          </section>

          <section className="section diagnostic-after insight-action-section" aria-labelledby="constraint-action-heading">
            <div className="shell narrow-shell insight-action-grid">
              <div><span className="section-label light">Test before scaling</span><h2 id="constraint-action-heading">Rank the hypothesis. Then model the capacity response.</h2><p>The constraint tool structures the first evidence test. Once the mechanism is supported, use the recovery model to quantify whether the intervention closes the throughput gap in the required window.</p></div>
              <div className="insight-action-links">
                <Link className="button button-light" href="/tools/constraint-diagnostic" prefetch={false}>Build the hypothesis map →</Link>
                <Link className="text-link light" href="/tools/backlog-recovery-calculator" prefetch={false}>Model the recovery path</Link>
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
