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

const operatingPillars = [
  {
    number: "01",
    title: "Diagnose and stabilize",
    detail: "Identify the binding constraint, protect throughput, and prevent short-term countermeasures from creating the next bottleneck.",
    outputs: ["Constraint diagnosis", "Queue controls", "Near-term countermeasures"],
  },
  {
    number: "02",
    title: "Build the capacity system",
    detail: "Connect facilities, staffing, technology, service levels, and quality in one decision-grade capacity model.",
    outputs: ["Capacity scenarios", "Service-level economics", "Quality guardrails"],
  },
  {
    number: "03",
    title: "Install control and reopen responsibly",
    detail: "Define owners, thresholds, governance, and latent-demand triggers so recovery decisions remain tied to operating evidence.",
    outputs: ["Executive cadence", "Trigger framework", "Reopening roadmap"],
  },
];

const results = [
  ["~14m → ~11–12m", "Reported backlog arc", "June peak to the June 30 and July 14 public checkpoints."],
  [">10%", "Record throughput", "June output above the prior monthly high, with July projected higher."],
  ["99.4%", "Operational success rate", "Quality and safety performance reported during accelerated output."],
  ["5m", "Management threshold", "Target tied to responsible Value-tier reopening."],
];

export default function PsaCasePage() {
  const featuredSources = psaSources.slice(0, 3);

  return (
    <>
      <SiteHeader />
      <main id="main" className="editorial-case editorial-psa">
        <section className="editorial-hero">
          <div className="shell editorial-breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/#featured-work">Featured work</Link><span>/</span><b>PSA</b></div>
          <div className="shell editorial-hero-grid">
            <div className="editorial-hero-copy">
              <div className="editorial-case-meta"><span>6-minute case study</span><span>Advisory engagement · 2026</span></div>
              <a className="editorial-company" href="https://www.psacard.com/" target="_blank" rel="noreferrer" aria-label="Visit PSA">
                <span><img src="/psa-logo.png" width="449" height="169" alt="PSA logo" /></span>
                <strong>PSA</strong>
              </a>
              <h1>From record backlog to a <em>controlled recovery path.</em></h1>
              <p>Stabilizing a demand shock while protecting quality—and designing the operating system beyond the immediate crisis.</p>
              <div className="editorial-source-check"><i aria-hidden="true">✓</i><span><strong>Evidence checked</strong><small>Official PSA updates plus dated external reporting</small></span></div>
            </div>
            <div className="editorial-hero-feature editorial-live-feature">
              <LiveBacklog />
              <p>Live integration · PSA’s public backlog tracker</p>
            </div>
          </div>
          <div className="shell editorial-proof-strip" aria-label="Case-study proof points">
            <div><strong>May 2026</strong><span>Engagement began</span></div>
            <div><strong>≈14m peak</strong><span>Reported operating high</span></div>
            <div><strong>~11–12m</strong><span>Public recovery checkpoints</span></div>
          </div>
        </section>

        <nav className="editorial-chapter-nav" aria-label="Case-study chapters">
          <div className="shell">
            <span>On this page</span>
            <a href="#brief">Brief</a><a href="#challenge">Challenge</a><a href="#approach">Approach</a><a href="#system">Operating arc</a><a href="#impact">Impact</a><a href="#evidence">Evidence</a>
          </div>
        </nav>

        <section className="editorial-section editorial-brief" id="brief">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Executive brief</span><small>01</small></div>
            <div className="editorial-reading-column">
              <h2>The visible queue was the symptom. The system around it was the problem.</h2>
              <p className="editorial-lead">A 20% submission spike added 1.6 million cards in two weeks. The active backlog approached 10 million, four Value tiers paused, and a final pre-pause influx pushed the queue near 14 million.</p>
              <div className="editorial-brief-grid">
                <div><span>Role</span><strong>Senior operations advisor</strong></div>
                <div><span>Mandate</span><strong>Stabilize · Design · Govern</strong></div>
                <div><span>Operating lens</span><strong>Capacity · Quality · Service levels</strong></div>
                <div><span>Evidence standard</span><strong>Primary + dated external sources</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-section" id="challenge">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>The challenge</span><small>02</small></div>
            <div className="editorial-reading-column">
              <h2>Recovery required more than pushing additional volume through the line.</h2>
              <p>Leadership had to reconcile intake controls, service-level economics, facilities, staffing, technology, quality, and customer trust—while preparing for latent demand that could return when Value reopened.</p>
              <blockquote>The mandate was to identify the active constraint, deploy near-term countermeasures, and create the governance and capacity mechanisms needed to keep reducing the queue without trading away quality.</blockquote>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-approach" id="approach">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>What I designed</span><small>03</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Three operating pillars connected immediate recovery to durable control.</h2>
              <div className="editorial-pillar-list">
                {operatingPillars.map((pillar) => (
                  <article key={pillar.number}>
                    <b>{pillar.number}</b>
                    <div><h3>{pillar.title}</h3><p>{pillar.detail}</p></div>
                    <ul>{pillar.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="editorial-signature" id="system">
          <div className="shell">
            <div className="editorial-signature-heading">
              <div><span>Signature operating view</span><h2>Six checkpoints from shock to controlled recovery.</h2></div>
              <p>Each point is tied to a dated public source, separating official operating facts from external interpretation.</p>
            </div>
            <ol className="editorial-timeline">
              {psaTimeline.map((event, index) => (
                <li key={event.date}><b>0{index + 1}</b><time>{event.date}</time><h3>{event.title}</h3><p>{event.detail}</p></li>
              ))}
            </ol>
            <details className="editorial-supporting">
              <summary><span>View the portfolio timeline artifact</span><b>Open +</b></summary>
              <div className="editorial-artifact">
                <img src="/psa-timeline.png" width="1080" height="1350" alt="Six-stop PSA operating timeline from May 14 through the July 14 backlog update" />
                <div><span>Downloadable artifact</span><h3>The complete operating timeline.</h3><p>A 1080-pixel editorial timeline for executive review and portfolio use.</p><a className="button button-light" href="/psa-timeline.png" download>Download PNG</a></div>
              </div>
            </details>
          </div>
        </section>

        <section className="editorial-section editorial-impact" id="impact">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Supported impact</span><small>04</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>The public record shows movement from crisis toward control.</h2>
              <div className="editorial-result-grid">
                {results.map(([value, label, detail]) => <article key={label}><strong>{value}</strong><span>{label}</span><p>{detail}</p></article>)}
              </div>
              <p className="editorial-attribution"><strong>Attribution:</strong> These figures represent publicly reported PSA performance during the engagement period and reflect the broader work of PSA leadership and operating teams. They are not presented as solely attributable to Luna Sol.</p>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-evidence" id="evidence">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Evidence</span><small>05</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>Primary evidence first. Full source room on demand.</h2>
              <div className="editorial-source-list">
                {featuredSources.map((source, index) => (
                  <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><b>0{index + 1}</b><div><span>{source.type} · {source.date}</span><strong>{source.title}</strong></div><i aria-hidden="true">↗</i></a>
                ))}
              </div>
              <details className="editorial-evidence-drawer">
                <summary><span>View all {psaSources.length} checked sources</span><b>Open +</b></summary>
                <div>
                  {psaSources.map((source, index) => (
                    <a href={source.href} target="_blank" rel="noreferrer" key={source.href}><b>{String(index + 1).padStart(2, "0")}</b><span>{source.title}<small>{source.type} · {source.date}</small></span><i aria-hidden="true">↗</i></a>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </section>

        <section className="editorial-next-case">
          <div className="shell editorial-next-grid">
            <div><span>Next case study</span><h2>HopSkipDrive</h2><p>Designing the operating system behind safe, scalable growth.</p><Link href="/work/hopskipdrive">Read the case <span aria-hidden="true">→</span></Link></div>
            <div><span>Have a comparable operating problem?</span><h2>Start with the constraint.</h2><p>Bring the signal, the stakes, and what the organization has already tried.</p><Link className="button button-light" href="/#contact">Start a confidential conversation</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
