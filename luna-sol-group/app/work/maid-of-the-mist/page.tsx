import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { GuestFlowExplorer } from "./MaidExperience";

export const metadata: Metadata = {
  title: "Maid of the Mist Operational Assessment",
  description: "A consulting case on guest-flow bottlenecks, queue visibility, throughput, capacity, and digital planning at Maid of the Mist’s U.S. operation.",
  alternates: { canonical: "/work/maid-of-the-mist" },
  openGraph: {
    title: "Guest Flow, Made Visible",
    description: "Maid of the Mist · 2026 operational assessment by Luna Sol Group.",
    images: [{ url: "/maid-of-the-mist-og.png", width: 1731, height: 909, alt: "Luna Sol Group Maid of the Mist guest-flow operational assessment" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Guest Flow, Made Visible",
    description: "Maid of the Mist · 2026 operational assessment by Luna Sol Group.",
    images: ["/maid-of-the-mist-og.png"],
  },
};

const operatingPillars = [
  {
    number: "01",
    title: "Diagnose the system",
    detail: "Separated visible queue symptoms from the constraints shaping demand, capacity, labor, vessel cadence, and the operating day.",
    outputs: ["Field observation", "Guest journey map", "Bottleneck analysis"],
  },
  {
    number: "02",
    title: "Move planning upstream",
    detail: "Connected historical demand patterns and guest information to decisions made before visitors entered the physical operation.",
    outputs: ["Demand-planning logic", "Queue visibility", "Digital concepts"],
  },
  {
    number: "03",
    title: "Enable executive action",
    detail: "Structured priorities across guest flow, capacity, operating transparency, digital experience, and implementation sequencing.",
    outputs: ["Executive recommendations", "Value logic", "Implementation path"],
  },
];

const evidence = [
  {
    type: "Featured public evidence · WGRZ",
    title: "Maid of the Mist announces launch date for the 2026 season.",
    detail: "WGRZ documented the Wait Time Trends & Insights feature and its guest-planning purpose.",
    href: "https://www.wgrz.com/article/news/local/maid-of-the-mist-announces-launch-date-for-2026/71-302e72a9-f363-43db-ad1d-69884d595407",
  },
  {
    type: "Official company announcement · April 22, 2026",
    title: "Ready to Launch: Maid of the Mist sets sail on its 2026 season.",
    detail: "The company explained how guests can use historical wait-time patterns before their visit.",
    href: "https://www.maidofthemist.com/ready-to-launch-maid-of-the-mist-to-set-sail-on-2026-season/",
  },
  {
    type: "Live customer capability",
    title: "Wait Time Trends & Insights is available on the company website.",
    detail: "The live planning page presents estimated demand patterns with operating caveats.",
    href: "https://www.maidofthemist.com/wait-times/",
  },
];

export default function MaidOfTheMistCasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="editorial-case editorial-motm">
        <section className="editorial-hero">
          <div className="shell editorial-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/#featured-work">Featured work</Link><span>/</span><b>Maid of the Mist</b></div>
          <div className="shell editorial-hero-grid">
            <div className="editorial-hero-copy">
              <div className="editorial-case-meta"><span>5-minute case study</span><span>Senior operations consulting · 2026</span></div>
              <a className="editorial-company editorial-company-motm" href="https://www.maidofthemist.com/" target="_blank" rel="noreferrer" aria-label="Visit Maid of the Mist">
                <span><img src="/maid-of-the-mist-logo.svg" width="229" height="154" alt="Maid of the Mist logo" /></span>
                <strong>Maid of the Mist</strong>
              </a>
              <h1>Moving the decision upstream—<em>before the guest reaches the queue.</em></h1>
              <p>An end-to-end operational assessment connecting demand, guest flow, capacity, visibility, and digital planning.</p>
              <div className="editorial-source-check motm-source-status"><i aria-hidden="true">✓</i><span><strong>Sources checked</strong><small>WGRZ coverage, official announcement, and live customer capability</small></span></div>
            </div>
            <figure className="editorial-hero-feature editorial-image-feature">
              <img src="/maid-of-the-mist-2026.jpg" width="1500" height="1000" alt="Maid of the Mist electric vessel James V. Glynn at Niagara Falls" />
              <figcaption><span>Operational environment</span><strong>High-volume guest flow inside a safety-critical, capacity-constrained system.</strong></figcaption>
            </figure>
          </div>
          <div className="shell editorial-proof-strip" aria-label="Assessment scope">
            <div><strong>8</strong><span>Guest-flow stages</span></div>
            <div><strong>6</strong><span>Supported contributions</span></div>
            <div><strong>3</strong><span>Public evidence sources</span></div>
          </div>
        </section>

        <nav className="editorial-chapter-nav" aria-label="Case-study chapters">
          <div className="shell"><span>On this page</span><a href="#brief">Brief</a><a href="#challenge">Challenge</a><a href="#approach">Approach</a><a href="#system">Guest flow</a><a href="#impact">Value</a><a href="#evidence">Evidence</a></div>
        </nav>

        <section className="editorial-section editorial-brief" id="brief">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Executive brief</span><small>01</small></div>
            <div className="editorial-reading-column">
              <h2>The visible queue was only one part of the operating story.</h2>
              <p className="editorial-lead">One of North America’s highest-volume tourist attractions needed clearer visibility into guest demand patterns and bottlenecks while protecting safety, throughput, capacity, and guest satisfaction.</p>
              <div className="editorial-brief-grid">
                <div><span>Role</span><strong>Senior Operations Consultant</strong></div>
                <div><span>Mandate</span><strong>Find and explain active constraints</strong></div>
                <div><span>Operating lens</span><strong>Flow · Queue · Throughput · Capacity</strong></div>
                <div><span>Public alignment</span><strong>Wait Time Trends &amp; Insights</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-section" id="challenge">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>The challenge</span><small>02</small></div>
            <div className="editorial-reading-column">
              <h2>The operation absorbed demand variability after guests had already arrived.</h2>
              <p>The assessment followed the physical and digital guest journey from arrival through exit. It connected queue behavior, vessel cadence, capacity, labor, operating information, and visitor planning into one fact base for executive action.</p>
              <div className="editorial-before-after" aria-label="Operating shift">
                <div><span>Reactive state</span><strong>Demand converges before the operation can respond.</strong><p>Limited pre-visit visibility concentrates guest arrivals and shifts the burden into the physical queue.</p></div>
                <div><span>Designed state</span><strong>A planning signal moves the decision upstream.</strong><p>Historical patterns give guests a useful input before they enter the operating system.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-approach" id="approach">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>What I designed</span><small>03</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Three moves connected field observation to an implementation path.</h2>
              <div className="editorial-pillar-list">
                {operatingPillars.map((pillar) => (
                  <article key={pillar.number}><b>{pillar.number}</b><div><h3>{pillar.title}</h3><p>{pillar.detail}</p></div><ul>{pillar.outputs.map((output) => <li key={output}>{output}</li>)}</ul></article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-signature editorial-motm-signature" id="system">
          <div className="shell">
            <div className="editorial-signature-heading">
              <div><span>Signature interactive</span><h2>Eight stages. One throughput system.</h2></div>
              <p>Select a stage to see how demand, information, safety, physical flow, and operating analytics connect across the guest journey.</p>
            </div>
            <GuestFlowExplorer />
          </div>
        </section>

        <section className="editorial-section editorial-impact" id="impact">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Supported value</span><small>04</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Contributions stated at the level the evidence supports.</h2>
              <div className="editorial-result-grid editorial-qualitative-results">
                <article><strong>Made visible</strong><span>Operating bottlenecks</span><p>Separated queue symptoms from the constraints shaping the operating day.</p></article>
                <article><strong>Connected</strong><span>End-to-end guest flow</span><p>Mapped handoffs, delays, capacity dependencies, and information friction.</p></article>
                <article><strong>Moved upstream</strong><span>Demand planning</span><p>Linked operational insight to pre-arrival customer planning.</p></article>
                <article><strong>Sequenced</strong><span>Implementation path</span><p>Connected immediate operating moves with longer-term digital improvements.</p></article>
              </div>
              <p className="editorial-attribution"><strong>Attribution:</strong> The public record documents the implemented feature and its guest-planning purpose. Broader implementation and operating success reflect Maid of the Mist leadership, operating teams, digital partners, and project stakeholders. Luna Sol is not presented as the sole owner or cause.</p>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-evidence" id="evidence">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Evidence</span><small>05</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>The planning capability is visible in the public record.</h2>
              <p className="editorial-evidence-intro">Public sources document the launch and purpose of Wait Time Trends &amp; Insights. They do not assign sole ownership of the feature or the broader operation.</p>
              <div className="editorial-source-list">
                {evidence.map((source, index) => (
                  <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><b>0{index + 1}</b><div><span>{source.type}</span><strong>{source.title}</strong><small>{source.detail}</small></div><i aria-hidden="true">↗</i></a>
                ))}
              </div>
              <details className="editorial-evidence-drawer">
                <summary><span>Read the evidence and attribution boundary</span><b>Open +</b></summary>
                <div className="editorial-boundary-copy"><p>Recommendations from the assessment informed customer-experience enhancements, including the publicly announced planning capability introduced for the 2026 operating season.</p><p>The announcements substantiate the customer-facing capability and its purpose. They are not presented as proof that Luna Sol solely designed, built, or implemented it.</p></div>
              </details>
            </div>
          </div>
        </section>

        <section className="editorial-next-case editorial-next-motm">
          <div className="shell editorial-next-grid">
            <div><span>Next case study</span><h2>PSA</h2><p>From a record grading backlog to a controlled recovery path.</p><Link href="/work/psa">Read the case <span aria-hidden="true">→</span></Link></div>
            <div><span>Operating with visible congestion?</span><h2>Understand the system first.</h2><p>Bring the guest-flow, capacity, labor, or planning problem current dashboards cannot explain.</p><Link className="button button-light" href="/#contact">Start a confidential conversation</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
