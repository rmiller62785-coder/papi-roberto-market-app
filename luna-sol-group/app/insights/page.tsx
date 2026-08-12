import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";

const published = [
  { format: "Operating brief", topic: "Recovery systems", title: "Backlog recovery planning: capacity is not the same as throughput", description: "Separate rated capacity, effective output, incoming demand, and the recovery commitment.", href: "/insights/backlog-recovery-planning", read: "7 min", date: "2026-08-10", image: "/psa-timeline.png" },
  { format: "Finance brief", topic: "Value control", title: "Cost of delay for operating queues—without calling exposure savings", description: "A finance-ready method that keeps modeled risk, cash impact, and realized value distinct.", href: "/insights/cost-of-delay-operating-queues", read: "6 min", date: "2026-08-10", image: "/og-evidence-room.jpg" },
  { format: "Field guide", topic: "Constraint validation", title: "Validate the constraint before adding staffing", description: "Test whether labor, process, quality, scheduling, or technology is actually limiting output.", href: "/insights/validate-constraints-before-staffing", read: "8 min", date: "2026-08-10", image: "/hopskipdrive-expansion.jpg" },
];

const researchAgenda = [
  ["Operating models", "What the operating model actually controls"],
  ["Transformation control", "The WBR as a decision system"],
  ["Regulated mobility", "Compliance-by-design in dispatch operations"],
  ["Guest operations", "Guest-flow measurement beyond average wait time"],
  ["Digital operations", "Where human controls remain mandatory in AI-enabled work"],
  ["Investor-backed operations", "Operational diligence that management can execute"],
];

export const metadata: Metadata = { title: "Insights | Operating Transformation", description: "Evidence-aware operating briefs, field guides, research, and decision products from Luna Sol Group.", alternates: { canonical: "/insights" } };

export default function InsightsPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Luna Sol Insights", url: `${siteUrl}/insights`, hasPart: published.map((item) => ({ "@type": "Article", name: item.title, url: `${siteUrl}${item.href}` })) };
  return <><SiteHeader /><main id="main" className="rebuild-insights">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    <section className="rebuild-library-hero"><div className="shell"><span>Insights · Models · Field guides</span><h1>Ideas built to move an operating decision.</h1><p>Every piece exposes the mechanism, the assumptions, and where leadership judgment begins. Read the argument, inspect the evidence, then apply the linked product.</p></div></section>
    <section className="rebuild-featured-insight"><div className="shell rebuild-featured-insight-grid"><figure><Image src="/psa-timeline.png" width={1080} height={1350} alt="PSA backlog recovery timeline" unoptimized /></figure><div><span>{published[0].format} · {published[0].topic}</span><h2>{published[0].title}</h2><p>{published[0].description}</p><time dateTime={published[0].date}>August 10, 2026 · {published[0].read}</time><Link href={published[0].href}>Read the operating brief →</Link></div></div></section>
    <section className="section paper rebuild-library"><div className="shell"><header><div><span>Published perspectives</span><h2>Evidence before opinion.</h2></div><p>Current writing connects directly to a case, model, or decision product.</p></header><div className="rebuild-editorial-grid">{published.slice(1).map((item) => <article key={item.href}><figure><Image src={item.image} width={1200} height={800} alt="" unoptimized /></figure><div><span>{item.format} · {item.topic}</span><h3>{item.title}</h3><p>{item.description}</p><time dateTime={item.date}>August 10, 2026 · {item.read}</time><Link href={item.href}>Read and apply →</Link></div></article>)}</div></div></section>
    <section className="section rebuild-agenda"><div className="shell"><header><span>Research agenda</span><h2>What Luna Sol is working on next.</h2><p>Forthcoming topics are shown as an editorial agenda, not published advice.</p></header><div>{researchAgenda.map(([topic,title], index) => <article key={title}><b>{String(index+1).padStart(2,"0")}</b><span>{topic}</span><h3>{title}</h3><small>In development</small></article>)}</div></div></section>
    <section className="rebuild-insight-close"><div className="shell"><span>Working products</span><h2>Do not stop at the article.</h2><p>Translate the mechanism into your own operating scenario using Luna Sol’s transparent decision products.</p><Link className="button" href="/tools">Enter the Operations Lab →</Link></div></section>
  </main><SiteFooter /></>;
}
