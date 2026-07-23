import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { AssessmentMetrics, AssessmentStory, BeforeAfterFlow, GuestFlowExplorer } from "./MaidExperience";

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

const contributions = [
  ["01", "Identified operational bottlenecks", "Separated visible queue symptoms from the constraints shaping guest flow, capacity, and the operating day."],
  ["02", "Improved guest-flow visibility", "Mapped the end-to-end journey and made handoffs, delays, and operating dependencies easier to see."],
  ["03", "Enhanced demand planning", "Recommended moving planning insight upstream so guests and operators could make better-informed decisions."],
  ["04", "Supported digital experience improvements", "Connected operational findings to customer-facing concepts that reduce information friction before arrival."],
  ["05", "Increased operational transparency", "Structured executive recommendations around demand, queues, capacity, labor, and visitor experience."],
  ["06", "Recommended scalable enhancements", "Created an implementation path spanning immediate operating moves and longer-term digital improvements."],
];

const evidence = [
  {
    type: "Featured public evidence · WGRZ",
    title: "Maid of the Mist announces launch date for the 2026 season.",
    quote: "“Wait Time Trends & Insights” feature has been added … “to allow guests to better plan the day and time they intend to visit.”",
    detail: "WGRZ documented the customer-facing planning feature as part of the attraction’s 2026 season launch.",
    href: "https://www.wgrz.com/article/news/local/maid-of-the-mist-announces-launch-date-for-2026/71-302e72a9-f363-43db-ad1d-69884d595407",
  },
  {
    type: "Official company announcement · April 22, 2026",
    title: "Ready to Launch: Maid of the Mist sets sail on its 2026 season.",
    quote: "“Wait Times Trends & Insights” provides guests with “a helpful look at how wait times tend to change throughout each day of the season.”",
    detail: "Maid of the Mist’s announcement explains how guests can use the new website capability before their visit.",
    href: "https://www.maidofthemist.com/ready-to-launch-maid-of-the-mist-to-set-sail-on-2026-season/",
  },
  {
    type: "Live customer capability",
    title: "Wait Time Trends & Insights is available on the company website.",
    quote: "Historical demand patterns help guests understand when the attraction is typically busier or quieter.",
    detail: "The live planning page presents estimated demand patterns with clear caveats for weather, holidays, and operating conditions.",
    href: "https://www.maidofthemist.com/wait-times/",
  },
];

export default function MaidOfTheMistCasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="motm-case-hero">
          <div className="shell motm-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/#featured-work">Featured work</Link><span>/</span><b>Maid of the Mist</b></div>
          <div className="shell motm-hero-grid">
            <div className="motm-hero-copy">
              <a className="motm-company-lockup" href="https://www.maidofthemist.com/" target="_blank" rel="noreferrer" aria-label="Visit Maid of the Mist">
                <span><img src="/maid-of-the-mist-logo.svg" width="229" height="154" alt="Maid of the Mist logo" /></span>
                <div><strong>Maid of the Mist</strong><small>Senior operations consulting engagement · 2026</small></div>
              </a>
              <span className="kicker">Guest operations · Bottleneck analysis · Digital planning</span>
              <h1>Moving the decision upstream—<em>before the guest reaches the queue.</em></h1>
              <p>Assessed the U.S. guest operation end to end, identified constraints affecting flow and visibility, and developed operational and digital recommendations for a safer, clearer, more manageable guest experience.</p>
              <div className="case-source-status motm-source-status"><i aria-hidden="true">✓</i><span><strong>Sources checked</strong><small>WGRZ coverage + official announcement + live customer capability</small></span></div>
              <div className="hero-actions">
                <a className="button" href="#guest-flow">Explore the guest-flow system <span aria-hidden="true">→</span></a>
                <Link className="button button-ghost" href="/#contact">Discuss a comparable operation</Link>
              </div>
            </div>
            <figure className="motm-hero-visual">
              <img src="/maid-of-the-mist-2026.jpg" width="1500" height="1000" alt="Maid of the Mist electric vessel James V. Glynn at Niagara Falls" />
              <figcaption><span>Operational environment</span><strong>High-volume guest flow inside a safety-critical, capacity-constrained system.</strong><small>Official Maid of the Mist imagery from the company’s <a href="https://www.maidofthemist.com/ready-to-launch-maid-of-the-mist-to-set-sail-on-2026-season/" target="_blank" rel="noreferrer">2026 season announcement</a>.</small></figcaption>
              <div className="motm-visual-chip"><i /> Public feature launched in 2026</div>
            </figure>
          </div>
          <div className="shell"><AssessmentMetrics /></div>
        </section>

        <section className="section paper motm-summary-section">
          <div className="shell motm-summary-grid">
            <div className="sticky-intro">
              <span className="section-label">Executive summary</span>
              <h2>The visible queue was only one part of the operating story.</h2>
            </div>
            <div className="motm-summary-copy">
              <p className="case-lead">One of North America’s highest-volume tourist attractions needed clearer visibility into guest demand patterns and operating bottlenecks while protecting safety, throughput, capacity, and guest satisfaction.</p>
              <p>The assessment followed the physical and digital guest journey from arrival through exit. It connected queue behavior, capacity, labor, operating cadence, information, and visitor planning into one fact base for executive action.</p>
              <div className="motm-brief-grid">
                <div><span>Role</span><strong>Senior Operations Consultant</strong><small>Operational assessment</small></div>
                <div><span>Primary mandate</span><strong>Find and explain the active constraints</strong><small>Observation through implementation planning</small></div>
                <div><span>Operating lens</span><strong>Guest flow · Queue · Throughput · Capacity</strong><small>Physical and digital experience</small></div>
                <div><span>Public alignment</span><strong>Wait Time Trends &amp; Insights</strong><small>Introduced for the 2026 season</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section motm-story-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Assessment sequence</span><h2>Observe the system. Isolate the constraint. Move the decision.</h2></div>
              <p>Scroll through the six moves that connected field observation to executive recommendations and implementation planning.</p>
            </div>
            <AssessmentStory />
          </div>
        </section>

        <section className="section paper motm-flow-section" id="guest-flow">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Interactive guest operating model</span><h2>Eight stages. One throughput system.</h2></div>
              <p>Select any stage to see how demand, information, safety, physical flow, and operating analytics connect across the guest journey.</p>
            </div>
            <GuestFlowExplorer />
          </div>
        </section>

        <section className="section motm-comparison-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Before and after the planning signal</span><h2>The strongest queue intervention can happen before arrival.</h2></div>
              <p>Compare a reactive flow with a system that gives guests a demand-planning signal before they enter the physical operation.</p>
            </div>
            <BeforeAfterFlow />
          </div>
        </section>

        <section className="section paper motm-evidence-section">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Public evidence</span><h2>The recommendation became visible to guests.</h2></div>
              <p>The public record documents the launch and purpose of the Wait Time Trends &amp; Insights capability. It does not assign sole ownership of the feature or the broader operation.</p>
            </div>
            <div className="motm-evidence-lead">
              <div><span>Recommendation-to-reality alignment</span><strong>Operational insight → customer planning capability</strong></div>
              <p>Recommendations from the assessment informed customer-experience enhancements, including the publicly announced planning capability introduced for the 2026 operating season.</p>
            </div>
            <div className="motm-evidence-grid">
              {evidence.map((item, index) => (
                <a href={item.href} target="_blank" rel="noreferrer" key={item.href}>
                  <div><span>{item.type}</span><b>0{index + 1}</b></div>
                  <h3>{item.title}</h3>
                  <blockquote>{item.quote}</blockquote>
                  <p>{item.detail}</p>
                  <strong>Open source <i aria-hidden="true">↗</i></strong>
                </a>
              ))}
            </div>
            <div className="motm-attribution"><b>Attribution</b><p>The public announcements document the implemented feature and its guest-planning purpose. The broader operating success and implementation reflect the collaborative work of Maid of the Mist leadership, operating teams, digital partners, and project stakeholders. Luna Sol is not presented as the sole owner or cause of the result.</p></div>
          </div>
        </section>

        <section className="section motm-value-section">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Supported value delivered</span><h2>Contributions stated at the level the evidence supports.</h2></div>
              <p>No invented revenue, throughput, labor, or wait-time impact. The case shows what the assessment identified, clarified, recommended, and enabled.</p>
            </div>
            <div className="motm-value-grid">
              {contributions.map(([number, title, detail]) => <article key={number}><b>{number}</b><h3>{title}</h3><p>{detail}</p></article>)}
            </div>
          </div>
        </section>

        <section className="section motm-case-cta">
          <div className="shell motm-case-cta-grid">
            <div><span className="section-label light">Operating with visible congestion?</span><h2>Do not optimize the queue before understanding the system creating it.</h2></div>
            <div><p>Bring the guest-flow, capacity, labor, or planning problem that frontline teams feel but current dashboards cannot explain.</p><Link className="button button-light" href="/#contact">Start a confidential conversation <span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
