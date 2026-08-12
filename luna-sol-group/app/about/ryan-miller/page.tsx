import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Ryan Miller | Founder and Principal",
  description: "Meet Ryan Miller, founder of Luna Sol Group and former Amazon and Walmart operator working across logistics, retail, mobility, and transformation.",
  alternates: { canonical: "/about/ryan-miller" },
};

export default function RyanMillerPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="principal-profile-hero"><div className="shell principal-profile-grid"><figure><Image src="/ryan-miller-stage.png" width={800} height={800} priority unoptimized sizes="(max-width: 760px) 100vw, 45vw" alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage." /><figcaption>Ryan Miller · Founder and Principal</figcaption></figure><div><span className="depth-eyebrow">Operator first · Advisor second</span><h1>Built inside the work.</h1><p className="depth-lead">Ryan has operated inside two of the world&apos;s most demanding physical networks, then translated that experience into a founder-led advisory model for companies whose growth has outrun their operating system.</p><a className="button button-light" href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">View LinkedIn profile ↗</a></div></div></section>

        <section className="principal-record"><div className="shell"><header className="depth-section-head"><div><span>Operating record</span><h2>The through-line is operating control.</h2></div><p>Prior employment and Luna Sol client work are presented as separate evidence categories.</p></header><div className="principal-record-grid"><article><span>Prior employment</span><h3>Amazon</h3><strong>Global last-mile operating leadership</strong><p>Operating-system, delivery-partner, capacity, network-economics, and transformation work across North America, Europe, and Japan.</p><Link href="/experience/amazon" prefetch={false}>Read the operating retrospective ↗</Link></article><article><span>Prior employment</span><h3>Walmart</h3><strong>Nearly a decade in retail operations</strong><p>Frontline execution where labor, inventory, customer promise, safety, and operating cadence converge.</p><small>No separate Walmart case study is currently published.</small></article><article><span>Advisory practice</span><h3>Luna Sol Group</h3><strong>Founder-led operating transformation</strong><p>Completed advisory work presented through bounded case studies for PSA, HopSkipDrive, and Maid of the Mist.</p><Link href="/work" prefetch={false}>See the advisory work ↗</Link></article></div></div></section>

        <section className="principal-posture"><div className="shell depth-two-column"><header><span>Engagement posture</span><h2>The person you meet remains accountable for the work.</h2></header><ol><li><b>01</b><span>Direct principal involvement in the operating decision.</span></li><li><b>02</b><span>Evidence and attribution boundaries made visible.</span></li><li><b>03</b><span>Implementation mechanisms designed with the operating team.</span></li><li><b>04</b><span>Specialist depth added when the decision requires it.</span></li></ol></div></section>

        <section className="depth-close"><div className="shell"><span>Start with the decision</span><h2>Bring the operating problem the current system cannot resolve.</h2><Link className="button button-light" href="/contact" prefetch={false}>Start a confidential conversation →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
