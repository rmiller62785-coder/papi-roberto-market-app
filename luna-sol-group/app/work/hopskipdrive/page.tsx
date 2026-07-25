import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { MarketMap, OperatingModelExplorer } from "./HopSkipDriveExperience";

export const metadata: Metadata = {
  title: "HopSkipDrive Operating Model Case",
  description: "A consulting case on designing the operating architecture, compliance controls, dispatch workflows, governance, and technical roadmap for a scaling student transportation platform.",
  alternates: { canonical: "/work/hopskipdrive" },
  openGraph: {
    title: "Operating Systems for Safe, Scalable Growth",
    description: "HopSkipDrive · 2026 consulting case by Luna Sol Group.",
    images: [{ url: "/hopskipdrive-og.png", width: 1731, height: 909, alt: "Luna Sol Group HopSkipDrive operating model case" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Operating Systems for Safe, Scalable Growth",
    description: "HopSkipDrive · 2026 consulting case by Luna Sol Group.",
    images: ["/hopskipdrive-og.png"],
  },
};

const operatingPillars = [
  {
    number: "01",
    title: "Operating architecture",
    detail: "Established the current-state fact base, then designed how dispatch, frontline execution, SOPs, and decision rights should work as one multi-market system.",
    outputs: ["Current-state assessment", "Enterprise operating model", "Dispatch workflows", "SOP library"],
  },
  {
    number: "02",
    title: "Control and governance",
    detail: "Embedded compliance, incident response, vendor accountability, executive KPIs, and named ownership into the operating cadence.",
    outputs: ["Compliance controls", "Incident pathways", "Vendor standards", "Executive governance"],
  },
  {
    number: "03",
    title: "Implementation enablement",
    detail: "Translated operating needs into technical requirements, sequenced delivery, and equipped internal teams to carry the system forward.",
    outputs: ["KPI framework", "Technical requirements", "Implementation roadmap", "Knowledge transfer"],
  },
];

const industryNews = [
  {
    type: "Official product announcement",
    title: "A 2026–2027 product suite built around consistency and safety.",
    detail: "HopSkipDrive announced ride recording, live rider tracking, structured rider notes, Rider Assistants, and expanded support.",
    href: "https://www.hopskipdrive.com/blog/new-2026-2027-product-suite/",
  },
  {
    type: "Official expansion announcement",
    title: "Six-state expansion increased the national operating footprint.",
    detail: "The company described new and planned launches across multiple Southern, Central, and Mid-Atlantic markets.",
    href: "https://www.hopskipdrive.com/blog/hopskipdrive-plans-expansion-across-six-new-states-for-the-2025-2026-school/",
  },
  {
    type: "Official newsroom",
    title: "Company announcements and external coverage in one source.",
    detail: "The newsroom provides current product, safety, expansion, and company coverage.",
    href: "https://www.hopskipdrive.com/newsroom/",
  },
  {
    type: "Distributed company release · May 14, 2026",
    title: "Ride recording and the Consistent CareDriver Program announced.",
    detail: "Business Wire carried HopSkipDrive’s release on nationwide ride recording and its consistency-focused product suite.",
    href: "https://www.businesswire.com/news/home/20260514110338/en/HopSkipDrive-Brings-Free-Ride-Recording-and-Consistent-CareDriver-Program-to-2026-2027-School-Year",
  },
];

export default function HopSkipDriveCasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="editorial-case editorial-hsd">
        <section className="editorial-hero">
          <div className="shell editorial-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/#featured-work">Featured work</Link><span>/</span><b>HopSkipDrive</b></div>
          <div className="shell editorial-hero-grid">
            <div className="editorial-hero-copy">
              <div className="editorial-case-meta"><span>6-minute case study</span><span>Consulting engagement · 2026</span></div>
              <a className="editorial-company editorial-company-hsd" href="https://www.hopskipdrive.com/" target="_blank" rel="noreferrer" aria-label="Visit HopSkipDrive">
                <span><Image src="/hopskipdrive-logo.svg" width={256} height={256} alt="HopSkipDrive logo" /></span>
                <strong>HopSkipDrive</strong>
              </a>
              <h1>The operating system behind <em>safe, scalable growth.</em></h1>
              <p>Connecting dispatch, compliance, risk, technology, and executive control for a rapidly scaling student transportation platform.</p>
              <div className="editorial-source-check hsd-source-status"><i aria-hidden="true">✓</i><span><strong>Sources checked</strong><small>Official product, expansion, newsroom, and distributed company materials</small></span></div>
            </div>
            <figure className="editorial-hero-feature editorial-image-feature">
              <Image src="/hopskipdrive-expansion.jpg" width={1200} height={630} alt="A HopSkipDrive CareDriver seated in a vehicle" priority />
              <figcaption><span>Operating context</span><strong>People, technology, regulation, and live service—moving at once.</strong></figcaption>
            </figure>
          </div>
          <div className="shell editorial-proof-strip" aria-label="Engagement scope">
            <div><strong>30+</strong><span>Metropolitan markets</span></div>
            <div><strong>17</strong><span>Coverage geographies</span></div>
            <div><strong>10</strong><span>Integrated workstreams</span></div>
          </div>
        </section>

        <nav className="editorial-chapter-nav" aria-label="Case-study chapters">
          <div className="shell"><span>On this page</span><a href="#brief">Brief</a><a href="#challenge">Challenge</a><a href="#approach">Approach</a><a href="#system">Operating model</a><a href="#impact">Value</a><a href="#evidence">Evidence</a></div>
        </nav>

        <div className="editorial-dossier">
        <section className="editorial-section editorial-brief" id="brief">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Executive brief</span><small>01</small></div>
            <div className="editorial-reading-column">
              <h2>Scale could not come at the expense of control.</h2>
              <p className="editorial-lead">Rapid national growth required an operating model capable of supporting regulated transportation of minors across multiple U.S. markets—without losing the evidence and escalation discipline needed in live operations.</p>
              <div className="editorial-brief-grid">
                <div><span>Role</span><strong>Senior Operations &amp; Technical Project Manager</strong></div>
                <div><span>Mandate</span><strong>Design the scalable operating foundation</strong></div>
                <div><span>Operating posture</span><strong>Safety-critical and compliance-led</strong></div>
                <div><span>Primary deliverable</span><strong>A deployable operating system</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-section" id="challenge">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>The challenge</span><small>02</small></div>
            <div className="editorial-reading-column">
              <h2>A national footprint multiplies every handoff, exception, and control.</h2>
              <p>Dispatch, compliance, risk, vendors, incidents, product requirements, and executive governance could not operate as separate workstreams. In a live service involving minors, the operating model had to preserve rider-specific needs and escalation logic across markets.</p>
              <blockquote>The engagement treated frontline execution, policy, technology, and executive control as one connected system—not a collection of independent process documents.</blockquote>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-approach" id="approach">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>What I designed</span><small>03</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Ten workstreams, edited into three operating pillars.</h2>
              <div className="editorial-pillar-list">
                {operatingPillars.map((pillar) => (
                  <article key={pillar.number}><b>{pillar.number}</b><div><h3>{pillar.title}</h3><p>{pillar.detail}</p></div><ul>{pillar.outputs.map((output) => <li key={output}>{output}</li>)}</ul></article>
                ))}
              </div>
              <details className="editorial-supporting editorial-coverage">
                <summary><span>Explore the 17-geography engagement footprint</span><b>Open map +</b></summary>
                <div><MarketMap /><p className="editorial-support-note">Coverage reflects the engagement scope provided by Luna Sol. Base map: CC0 public-domain U.S. map via Wikimedia Commons.</p></div>
              </details>
            </div>
          </div>
        </section>

        <section className="editorial-signature editorial-hsd-signature" id="system">
          <div className="shell">
            <div className="editorial-signature-heading">
              <div><span>Signature interactive</span><h2>One control thread across every handoff.</h2></div>
              <p>Select a stage to see how customer demand connects to dispatch, CareDrivers, compliance evidence, rider protection, verified completion, and executive visibility.</p>
            </div>
            <OperatingModelExplorer />
          </div>
        </section>

        <section className="editorial-section editorial-impact" id="impact">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Supported value</span><small>04</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>The output was an implementation-ready control system.</h2>
              <div className="editorial-result-grid editorial-qualitative-results">
                <article><strong>One architecture</strong><span>End-to-end operating model</span><p>Connected daily execution to enterprise decision-making.</p></article>
                <article><strong>Built in</strong><span>Compliance by design</span><p>Placed policy, evidence, and thresholds inside the workflow.</p></article>
                <article><strong>Named control</strong><span>Governance and KPIs</span><p>Clarified owners, cadence, thresholds, and corrective action.</p></article>
                <article><strong>Ready to sequence</strong><span>Technical roadmap</span><p>Translated operating needs into implementation requirements.</p></article>
              </div>
              <p className="editorial-attribution"><strong>Evidence boundary:</strong> This case describes Ryan Miller’s consulting scope. Company scale, products, expansion, and safety claims are attributed to HopSkipDrive’s public materials; public articles are not presented as validating personal contribution.</p>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-evidence" id="evidence">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Evidence</span><small>05</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Company context, clearly separated from personal-work attribution.</h2>
              <div className="editorial-source-list">
                {industryNews.slice(0, 3).map((source, index) => (
                  <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><b>0{index + 1}</b><div><span>{source.type}</span><strong>{source.title}</strong></div><i aria-hidden="true">↗</i></a>
                ))}
              </div>
              <details className="editorial-evidence-drawer">
                <summary><span>View all {industryNews.length} checked sources and notes</span><b>Open +</b></summary>
                <div>{industryNews.map((source, index) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><b>{String(index + 1).padStart(2, "0")}</b><span>{source.title}<small>{source.type} · {source.detail}</small></span><i aria-hidden="true">↗</i></a>)}</div>
              </details>
            </div>
          </div>
        </section>
        </div>

        <section className="editorial-next-case editorial-next-hsd">
          <div className="shell editorial-next-grid">
            <div><span>Next case study</span><h2>Maid of the Mist</h2><p>Moving the guest-planning decision upstream—before the queue.</p><Link href="/work/maid-of-the-mist">Read the case <span aria-hidden="true">→</span></Link></div>
            <div><span>Scaling a safety-critical operation?</span><h2>Build the control system first.</h2><p>Bring the operating model, risk, workflow, or technology problem beginning to break under growth.</p><Link className="button button-light" href="/#contact">Start a confidential conversation</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
