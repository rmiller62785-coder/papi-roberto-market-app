import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Ryan Miller | Founder and Principal",
  description: "Meet Ryan Miller, EMBA—founder of Luna Sol Group and former Amazon and Walmart operator working across logistics, retail, mobility, and transformation.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="about-page">
        <section className="about-hero"><div className="shell about-hero-grid"><figure><Image src="/ryan-miller-stage.png" width={800} height={800} priority sizes="(max-width: 760px) 100vw, 45vw" alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage." /><figcaption>Ryan Miller · Founder and Principal</figcaption></figure><div><span className="kicker">Operator first · Advisor second</span><h1>Built inside the work.</h1><p className="about-lead">Ryan has operated inside two of the world’s most demanding physical networks, then translated that experience into a founder-led advisory model for companies whose growth has outrun their operating system.</p><p>His work spans global last-mile transformation, network economics, delivery-partner architecture, capacity planning, customer experience, AI-enabled operations, and large-scale frontline execution.</p><a className="button button-light" href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">View LinkedIn profile ↗</a></div></div></section>
        <section className="section paper about-record-section"><div className="shell"><header className="editorial-heading"><div><span className="section-label">Operator record</span><h2>The through-line is operating control.</h2></div><p>Across retail, last mile, mobility, and advisory work, the recurring problem is the same: turn ambiguous signals into a system people can execute under pressure.</p></header><div className="about-record-grid"><article><span>Amazon</span><strong>Global last-mile leadership</strong><p>Operating-system, delivery-partner, capacity, network-economics, and transformation work across North America, Europe, and Japan.</p><Link href="/experience/amazon" prefetch={false}>Read the retrospective →</Link></article><article><span>Walmart</span><strong>Nearly a decade in retail operations</strong><p>Frontline execution where labor, inventory, customer promise, safety, and operating cadence converge every day.</p></article><article><span>Luna Sol Group</span><strong>Founder-led advisory</strong><p>Embedded operating transformation for consequential decisions, with evidence boundaries and operator ownership built into the work.</p><Link href="/work" prefetch={false}>See the advisory work →</Link></article></div></div></section>
        <section className="section about-principles-section"><div className="shell case-two-column"><div className="sticky-intro"><span className="section-label light">Working principles</span><h2>How Ryan shows up.</h2></div><ol className="about-principles"><li><b>01</b><div><strong>Tell the operating truth.</strong><p>Reconcile the dashboard with workflow evidence and frontline reality before prescribing action.</p></div></li><li><b>02</b><div><strong>Carry the decision into execution.</strong><p>The recommendation is incomplete until owners, controls, and cadence exist.</p></div></li><li><b>03</b><div><strong>Leave capability behind.</strong><p>The operating team should be able to run the mechanism without dependence on the consultant.</p></div></li></ol></div></section>
        <section className="section paper about-close-section"><div className="shell narrow-shell"><span className="section-label">Founder-led by design</span><h2>The person you meet is the person accountable for the work.</h2><p>Luna Sol stays deliberately focused: select engagements, direct principal involvement, and enough proximity to the operation to make the recommendation executable.</p><Link className="button" href="/#contact" prefetch={false}>Start a confidential conversation →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
