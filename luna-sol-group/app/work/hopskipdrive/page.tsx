import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { EngagementMetrics, MarketMap, OperatingModelExplorer, TransformationStory } from "./HopSkipDriveExperience";

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

const scope = [
  ["01", "Current-state assessment", "Reconciled workflow reality, risk, ownership, technology, and executive signals."],
  ["02", "Operational architecture", "Defined the enterprise model connecting frontline execution to executive control."],
  ["03", "Dispatch workflows", "Structured work allocation, monitoring, exception handling, and escalation."],
  ["04", "Compliance controls", "Embedded policy, evidence, thresholds, and approvals into the operating flow."],
  ["05", "SOP library", "Converted critical judgment into repeatable standards for a multi-market environment."],
  ["06", "Vendor management", "Clarified expectations, evidence, performance review, and accountability mechanisms."],
  ["07", "Executive governance", "Established decision forums, named owners, and a durable operating cadence."],
  ["08", "KPI framework", "Built a control surface across service, safety, risk, capacity, and execution."],
  ["09", "Technical requirements", "Translated operating needs into implementation-ready product and data requirements."],
  ["10", "Roadmap and transfer", "Sequenced deployment and equipped internal teams to carry the system forward."],
];

const industryNews = [
  {
    type: "Official product announcement",
    title: "A 2026–2027 product suite built around consistency and safety.",
    detail: "HopSkipDrive announced in-app ride recording, live rider tracking, a Consistent CareDriver Program, structured rider notes, Rider Assistants, and expanded support.",
    href: "https://www.hopskipdrive.com/blog/new-2026-2027-product-suite/",
  },
  {
    type: "Official expansion announcement",
    title: "Six-state expansion increased the national operating footprint.",
    detail: "The company described new and planned launches across Texas, North Carolina, Oklahoma, Florida, Maryland, Louisiana, Kansas, and Virginia markets.",
    href: "https://www.hopskipdrive.com/blog/hopskipdrive-plans-expansion-across-six-new-states-for-the-2025-2026-school/",
  },
  {
    type: "Official newsroom",
    title: "Company announcements and external coverage in one source.",
    detail: "HopSkipDrive’s newsroom provides the company’s current media kit, product news, safety updates, expansion announcements, and recent press coverage.",
    href: "https://www.hopskipdrive.com/newsroom/",
  },
  {
    type: "Distributed company release · May 14, 2026",
    title: "Free ride recording and consistent CareDriver program announced.",
    detail: "Business Wire carried HopSkipDrive’s release on nationwide ride recording and its consistency-focused 2026–2027 product suite.",
    href: "https://www.businesswire.com/news/home/20260514110338/en/HopSkipDrive-Brings-Free-Ride-Recording-and-Consistent-CareDriver-Program-to-2026-2027-School-Year",
  },
];

export default function HopSkipDriveCasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hsd-case-hero">
          <div className="shell hsd-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/#featured-work">Featured work</Link><span>/</span><b>HopSkipDrive</b></div>
          <div className="shell hsd-hero-grid">
            <div className="hsd-hero-copy">
              <a className="hsd-company-lockup" href="https://www.hopskipdrive.com/" target="_blank" rel="noreferrer" aria-label="Visit HopSkipDrive">
                <img src="/hopskipdrive-logo.svg" width="256" height="256" alt="HopSkipDrive logo" />
                <span><strong>HopSkipDrive</strong><small>Consulting engagement · 2026</small></span>
              </a>
              <span className="kicker">Regulated mobility · Student transportation · National scale</span>
              <h1>Designing the operating system behind <em>safe, scalable growth.</em></h1>
              <p>Built the operational foundation connecting dispatch, compliance, risk, technology, and executive control for a rapidly scaling, technology-enabled student transportation platform.</p>
              <div className="case-source-status hsd-source-status"><i aria-hidden="true">✓</i><span><strong>Sources checked</strong><small>Official product, expansion, newsroom, and distributed company materials</small></span></div>
              <div className="hero-actions">
                <a className="button" href="#operating-model">Explore the operating model <span aria-hidden="true">→</span></a>
                <Link className="button button-ghost" href="/#contact">Discuss a comparable problem</Link>
              </div>
            </div>
            <figure className="hsd-hero-visual">
              <img src="/hopskipdrive-expansion.jpg" width="1200" height="630" alt="A HopSkipDrive CareDriver seated in a vehicle" />
              <figcaption><span>Operating context</span><strong>People, technology, regulation, and live service—moving at once.</strong><small>Official HopSkipDrive imagery from the company’s <a href="https://www.hopskipdrive.com/blog/hopskipdrive-plans-expansion-across-six-new-states-for-the-2025-2026-school/" target="_blank" rel="noreferrer">expansion announcement</a>.</small></figcaption>
              <div className="hsd-visual-chip"><i /> Compliance by design</div>
            </figure>
          </div>
          <div className="shell"><EngagementMetrics /></div>
        </section>

        <section className="section paper hsd-summary-section">
          <div className="shell hsd-summary-grid">
            <div className="sticky-intro">
              <span className="section-label">Executive summary</span>
              <h2>Scale could not come at the expense of control.</h2>
            </div>
            <div className="hsd-summary-copy">
              <p className="case-lead">Rapid national growth required an operating model capable of supporting regulated transportation of minors across multiple U.S. markets—without losing the clarity, evidence, and escalation discipline needed in live operations.</p>
              <p>The engagement treated dispatch, compliance, risk, governance, SOPs, technology, and executive KPIs as one connected system. The work moved from current-state evidence to an implementable architecture and then to the mechanisms internal teams could run.</p>
              <div className="hsd-brief-grid">
                <div><span>Role</span><strong>Senior Operations &amp; Technical Project Manager</strong><small>Consulting</small></div>
                <div><span>Mandate</span><strong>Design the scalable operating foundation</strong><small>Architecture through handoff</small></div>
                <div><span>Operating posture</span><strong>Safety-critical and compliance-led</strong><small>Minors · live service · multi-market</small></div>
                <div><span>Primary deliverable</span><strong>A deployable operating system</strong><small>Not a strategy presentation</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section hsd-story-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Transformation sequence</span><h2>From fragmented signals to an executable system.</h2></div>
              <p>Scroll through the six decisions that connected operating diagnosis, compliance, standard work, executive control, and deployment.</p>
            </div>
            <TransformationStory />
          </div>
        </section>

        <section className="section paper hsd-operating-section" id="operating-model">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Interactive operating model</span><h2>One control thread across every handoff.</h2></div>
              <p>Select a stage to see the operating intent. The architecture links customer demand to frontline execution, compliance evidence, rider protection, and executive visibility.</p>
            </div>
            <OperatingModelExplorer />
          </div>
        </section>

        <section className="section hsd-scope-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Engagement scope</span><h2>Ten workstreams. One operating architecture.</h2></div>
              <p>Each workstream was designed as part of the same system so policy, process, technology, and governance would reinforce one another.</p>
            </div>
            <div className="hsd-scope-grid">
              {scope.map(([number, title, detail]) => (
                <article key={number}><b>{number}</b><h3>{title}</h3><p>{detail}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="section paper hsd-map-section">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Geographic coverage</span><h2>Designed for a 30+ metro operating footprint.</h2></div>
              <p>Select a location to explore the engagement coverage. The operating model had to remain coherent across distinct markets, regulatory contexts, and service conditions.</p>
            </div>
            <MarketMap />
            <p className="hsd-map-source">Coverage reflects the engagement scope provided by Luna Sol. Base map: CC0 public-domain U.S. map via <a href="https://commons.wikimedia.org/wiki/File:Blank_US_Map_(states_only).svg" target="_blank" rel="noreferrer">Wikimedia Commons</a>.</p>
          </div>
        </section>

        <section className="section hsd-news-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Company and industry news</span><h2>Business context—not personal-work attribution.</h2></div>
              <p>These public sources describe HopSkipDrive’s growth, product direction, safety model, and market context. They are not presented as proof of Luna Sol’s personal scope or impact.</p>
            </div>
            <div className="hsd-news-grid">
              {industryNews.map((item, index) => (
                <a href={item.href} target="_blank" rel="noreferrer" key={item.href}>
                  <div><span>{item.type}</span><b>0{index + 1}</b></div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <strong>Open public source <i aria-hidden="true">↗</i></strong>
                </a>
              ))}
            </div>
            <div className="hsd-context-boundary"><b>Evidence boundary</b><p>Engagement descriptions summarize Ryan Miller’s consulting scope. Company scale, products, market expansion, and safety claims are attributed to HopSkipDrive’s public materials or its distributed company release. No public article is represented as validating personal contribution.</p></div>
          </div>
        </section>

        <section className="section hsd-case-cta">
          <div className="shell hsd-case-cta-grid">
            <div><span className="section-label light">Scaling a safety-critical operation?</span><h2>Build the control system before complexity builds it for you.</h2></div>
            <div><p>Bring the operating model, risk, workflow, or technology problem that is beginning to break under growth. Luna Sol will help determine the constraint and the right level of intervention.</p><Link className="button button-light" href="/#contact">Start a confidential conversation <span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
