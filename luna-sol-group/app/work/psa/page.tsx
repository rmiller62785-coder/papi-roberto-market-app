import type { Metadata } from "next";
import Link from "next/link";
import { LiveBacklog } from "../../components/LiveBacklog";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { psaSources, psaTimeline } from "../../content";

export const metadata: Metadata = {
  title: "PSA Backlog Stabilization Case Study",
  description: "An evidence-backed operating case on stabilizing PSA's 2026 grading backlog and designing the roadmap beyond the surge.",
  alternates: { canonical: "/work/psa" },
  openGraph: {
    title: "From Record Backlog to Controlled Recovery",
    description: "PSA · 2026 advisory case by Luna Sol Group.",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Luna Sol Group PSA backlog stabilization case study" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "From Record Backlog to Controlled Recovery",
    description: "PSA · 2026 advisory case by Luna Sol Group.",
    images: ["/og.png"],
  },
};

const interventions = [
  { title: "Stabilize the active queue", detail: "Identify the binding constraint, protect throughput, and prevent short-term countermeasures from creating the next bottleneck." },
  { title: "Make capacity decision-grade", detail: "Translate facilities, staffing, technology, service levels, and quality into one integrated capacity model." },
  { title: "Install executive control", detail: "Define owners, thresholds, governance, and a cadence that keeps the roadmap tied to operating evidence." },
  { title: "Design for the reopening", detail: "Model latent demand and trigger-based scenarios so reopening decisions account for the queue that is not yet visible." },
];

export default function PsaCasePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="case-page-hero">
          <div className="shell case-hero-grid">
            <div className="case-title">
              <div className="case-route"><Link className="breadcrumb" href="/">Home</Link><span aria-hidden="true">/</span><Link href="/#featured-work">Featured work</Link><span aria-hidden="true">/</span><b>PSA</b></div>
              <a className="case-company-lockup" href="https://www.psacard.com/" target="_blank" rel="noreferrer" aria-label="Visit PSA">
                <span><img src="/psa-logo.png" width="449" height="169" alt="PSA logo" /></span>
                <div><strong>PSA</strong><small>Luna Sol advisory engagement · 2026</small></div>
              </a>
              <span className="kicker">Collectibles authentication &amp; grading · 2026</span>
              <h1>PSA grading-backlog stabilization and <em>operating roadmap.</em></h1>
              <p>From a record demand surge to a controlled recovery path—while protecting quality and designing the capacity system beyond the immediate crisis.</p>
              <div className="case-source-status"><i aria-hidden="true">✓</i><span><strong>Evidence checked</strong><small>Official PSA updates + dated external reporting</small></span></div>
            </div>
            <LiveBacklog />
          </div>
          <div className="shell case-meta">
            <div><span>Engagement began</span><strong>May 2026</strong></div>
            <div><span>Operating arc</span><strong>≈14m peak → ~11–12m</strong></div>
            <div><span>Primary mandate</span><strong>Stabilize · Design · Govern</strong></div>
            <div><span>Evidence standard</span><strong>Primary + dated external sources</strong></div>
          </div>
        </section>

        <section className="section paper case-overview">
          <div className="shell case-two-column">
            <div className="sticky-intro">
              <span className="section-label">The operating situation</span>
              <h2>The visible queue was the symptom. The system around it was the problem.</h2>
            </div>
            <div className="case-prose">
              <p className="case-lead">A 20% submission spike added 1.6 million cards in two weeks. The active backlog approached 10 million, four Value tiers paused, and a final pre-pause influx pushed the queue near 14 million.</p>
              <p>That created more than a throughput problem. Leadership had to reconcile intake controls, service-level economics, facilities, staffing, technology, quality, and customer trust—while preparing for the latent demand that could return when Value reopened.</p>
              <div className="mandate-box">
                <span>The mandate</span>
                <p>Identify the active operating constraint, deploy near-term countermeasures, and establish the initiatives, governance, and capacity mechanisms required to continue reducing the queue without trading away quality.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section case-interventions">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Intervention architecture</span><h2>Four decisions, one operating system.</h2></div>
              <p>The work connected immediate recovery to the long-term capacity model rather than treating the surge as an isolated fire drill.</p>
            </div>
            <div className="intervention-grid">
              {interventions.map((item, index) => (
                <article key={item.title}><b>0{index + 1}</b><h3>{item.title}</h3><p>{item.detail}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="section paper timeline-section">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">The operating arc</span><h2>Six checkpoints from shock to controlled recovery.</h2></div>
              <p>Each checkpoint is tied to a dated public source. The sequence distinguishes official operating facts from external interpretation.</p>
            </div>
            <ol className="case-timeline">
              {psaTimeline.map((event, index) => (
                <li key={event.date}>
                  <div className="timeline-index">0{index + 1}</div>
                  <time>{event.date}</time>
                  <h3>{event.title}</h3>
                  <p>{event.detail}</p>
                </li>
              ))}
            </ol>
            <div className="timeline-download">
              <img src="/psa-timeline.png" width="1080" height="1350" alt="Six-stop PSA operating timeline from May 14 through the July 14 backlog update" />
              <div>
                <span className="section-label light">Portfolio artifact</span>
                <h3>Download the full operating timeline.</h3>
                <p>A 1080-pixel editorial timeline designed for executive review, portfolio use, and LinkedIn.</p>
                <a className="button button-light" href="/psa-timeline.png" download>Download PNG</a>
              </div>
            </div>
          </div>
        </section>

        <section className="section results-section">
          <div className="shell">
            <div className="results-heading">
              <span className="section-label light">Publicly reported operating results</span>
              <h2>The queue moved from crisis toward control.</h2>
            </div>
            <div className="results-grid">
              <article><span>Backlog recovery</span><strong>~14m <i>→</i> ~11–12m</strong><p>June’s reported peak to the June 30 and July 14 public checkpoints.</p></article>
              <article><span>Throughput</span><strong>&gt;10%</strong><p>June’s record pace above the prior monthly high, with July projected higher.</p></article>
              <article><span>Quality and safety</span><strong>99.4%</strong><p>Operational success rate reported by PSA during the accelerated output period.</p></article>
              <article><span>Control target</span><strong>5m</strong><p>Management threshold tied to responsible Value-tier reopening.</p></article>
            </div>
            <p className="attribution-box"><strong>Attribution:</strong> These figures represent publicly reported PSA performance during the engagement period. They reflect the broader work of PSA leadership and operating teams—including staffing, facilities, technology, service-level controls, and other initiatives—and are not presented as solely attributable to Luna Sol.</p>
          </div>
        </section>

        <section className="section paper evidence-section">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Evidence room</span><h2>Trace the arc to the source.</h2></div>
              <p>Primary evidence leads each stage. External sources add contemporaneous market context; they do not replace the official record.</p>
            </div>
            <div className="source-grid">
              {psaSources.map((source, index) => (
                <a className="source-card" key={source.href} href={source.href} target="_blank" rel="noreferrer">
                  <div><span>{source.type}</span><b>0{index + 1}</b></div>
                  <time>{source.date}</time>
                  <h3>{source.title}</h3>
                  <p>{source.description}</p>
                  <strong>Open source ↗</strong>
                </a>
              ))}
            </div>
            <p className="source-note">PSA names, marks, and performance data belong to their respective owners. Luna Sol is not presented as the sole cause of reported PSA outcomes. External articles may update, move, or change after publication.</p>
          </div>
        </section>

        <section className="section case-cta">
          <div className="shell case-cta-grid">
            <div><span className="section-label light">Have a comparable operating problem?</span><h2>Start with the constraint—not the solution.</h2></div>
            <div><p>Bring the signal, the stakes, and what the organization has already tried. The first conversation is designed to determine whether there is a real operating problem Luna Sol can help solve.</p><Link className="button button-light" href="/#contact">Start a confidential conversation →</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
