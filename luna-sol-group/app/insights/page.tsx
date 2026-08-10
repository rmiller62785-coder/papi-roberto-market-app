import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";

const insights = [
  {
    index: "01",
    title: "Backlog recovery planning: capacity is not the same as throughput",
    description: "A practical method for separating rated capacity, effective output, incoming demand, and the recovery commitment.",
    href: "/insights/backlog-recovery-planning",
    read: "7-minute operating brief",
  },
  {
    index: "02",
    title: "Cost of delay for operating queues—without pretending exposure is savings",
    description: "A finance-ready way to frame queue exposure while keeping modeled risk, cash impact, and realized value distinct.",
    href: "/insights/cost-of-delay-operating-queues",
    read: "6-minute operating brief",
  },
  {
    index: "03",
    title: "Validate the constraint before adding staffing",
    description: "An evidence sequence for testing whether labor, process, quality, scheduling, or technology is actually limiting output.",
    href: "/insights/validate-constraints-before-staffing",
    read: "8-minute operating brief",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Luna Sol Operations Insights",
    description: "Practical operating briefs on backlog recovery, cost of delay, capacity, and constraint validation.",
    url: `${siteUrl}/insights`,
    hasPart: insights.map((insight) => ({ "@type": "Article", name: insight.title, url: `${siteUrl}${insight.href}` })),
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Operations Insights", item: `${siteUrl}/insights` },
    ],
  },
];

export const metadata: Metadata = {
  title: "Operations Insights | Backlog, Capacity & Constraint Planning",
  description: "Practical operating briefs on backlog recovery planning, queue cost of delay, capacity, and constraint validation from Luna Sol Group.",
  alternates: { canonical: "/insights" },
};

export default function InsightsPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="insights-index">
        {structuredData.map((entry, index) => (
          <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }} />
        ))}
        <section className="subpage-hero insight-index-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Luna Sol Operations Insights</span>
            <h1>Operating judgment, made <em>inspectable.</em></h1>
            <p>Short, technical briefs for leaders deciding whether to add capacity, reset a commitment, quantify queue exposure, or test the mechanism behind a visible backlog.</p>
            <div className="diagnostic-facts">
              <span><strong>3</strong> Decision mechanisms</span>
              <span><strong>3</strong> Working-tool handoffs</span>
              <span><strong>0</strong> Black-box recommendations</span>
            </div>
          </div>
        </section>

        <section className="section paper insight-index-section" aria-labelledby="insight-library-heading">
          <div className="shell">
            <header className="section-heading compact-heading">
              <div><span className="section-label">The operating library</span><h2 id="insight-library-heading">Read the mechanism.<br />Then test the decision.</h2></div>
              <p>Each brief exposes its equation, evidence sequence, and boundary. The linked tools let you replace the example with your own operating assumptions.</p>
            </header>
            <div className="insight-index-grid">
              {insights.map((insight) => (
                <article className="insight-index-card" key={insight.href}>
                  <header><b>{insight.index}</b><span>{insight.read}</span></header>
                  <h3>{insight.title}</h3>
                  <p>{insight.description}</p>
                  <Link href={insight.href} prefetch={false}>Read the operating brief <span aria-hidden="true">→</span></Link>
                </article>
              ))}
            </div>
            <p className="insight-index-boundary"><strong>Editorial boundary:</strong> These briefs are operating education, not business-specific advice. Validate source data, constraints, financial treatment, workforce implications, and accountable decision rights before implementation.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
