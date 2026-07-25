import type { Metadata } from "next";
import Image from "next/image";
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

const lunaDeliverables = [
  "Current-state operating assessment",
  "Constraint and causal analysis",
  "Capacity and flow model",
  "Immediate stabilization countermeasures",
  "KPI and governance architecture",
  "Long-term operating roadmap",
];

const publicOutcomes = [
  { value: "≈14m → 11m", label: "Backlog arc", source: "Publicly reported · official + independent" },
  { value: "2.50m", label: "June grading volume", source: "Independent market report · GemRate" },
  { value: ">10%", label: "Output above prior monthly high", source: "Publicly reported · official" },
  { value: "492.9k", label: "Cards graded July 1–6", source: "Independent market report · GemRate / SI" },
  { value: "99.4%", label: "Operational success rate", source: "Publicly reported · official" },
];

const artifactPreviews = [
  { title: "Constraint tree", decision: "Where to intervene first", inputs: "Queue, intake, cycle-time, quality, staffing", analysis: "Causal decomposition", output: "Binding-constraint hypothesis", use: "Align the stabilization sequence" },
  { title: "Capacity + recovery model", decision: "What recovery path is feasible", inputs: "Demand, rated capacity, utilization, rework", analysis: "Flow and sensitivity modeling", output: "Burn rate, capacity gap, threshold date", use: "Compare countermeasures and risk" },
  { title: "13-week stabilization roadmap", decision: "How to govern execution", inputs: "Workstreams, owners, triggers, dependencies", analysis: "Critical-path and control design", output: "Milestones, KPIs, escalation cadence", use: "Run weekly executive governance" },
];

export default function PsaCasePage() {
  const featuredSources = [psaSources[0], psaSources[3], psaSources[8], psaSources[1]];

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
                <span><Image src="/psa-logo.png" width={830} height={338} alt="PSA logo" priority /></span>
                <strong>PSA</strong>
              </a>
              <h1>From a record grading backlog to a <em>controlled recovery system.</em></h1>
              <p>Luna Sol assessed the operating constraint, designed immediate stabilization mechanisms, and developed the capacity, governance, and continuous-improvement roadmap behind recovery.</p>
              <div className="psa-hero-actions">
                <a className="button" href="#brief">Explore the engagement <span aria-hidden="true">↓</span></a>
                <a className="button button-ghost" href="#evidence">View verified evidence</a>
              </div>
              <div className="editorial-source-check"><i aria-hidden="true">✓</i><span><strong>Evidence checked</strong><small>Official PSA updates plus dated external reporting</small></span></div>
            </div>
            <div className="editorial-hero-feature editorial-live-feature">
              <LiveBacklog />
              <p>Live integration · PSA’s public backlog tracker</p>
            </div>
          </div>
          <div className="shell editorial-proof-strip psa-proof-strip" aria-label="Case-study proof points">
            <div><strong>≈14m</strong><span>Public peak · independent reporting</span></div>
            <div><strong>11m</strong><span>July 14 position · official PSA</span></div>
            <div><strong>2.50m</strong><span>June output · independent GemRate</span></div>
            <div><strong>99.4%</strong><span>Success rate · official PSA</span></div>
          </div>
          <p className="shell psa-hero-attribution">Public performance during the engagement period; not presented as solely attributable to Luna Sol.</p>
        </section>

        <nav className="editorial-chapter-nav" aria-label="Case-study chapters">
          <div className="shell">
            <span>On this page</span>
            <a href="#brief">Brief</a><a href="#challenge">Challenge</a><a href="#approach">Approach</a><a href="#system">Operating arc</a><a href="#impact">Impact</a><a href="#evidence">Evidence</a>
          </div>
        </nav>

        <div className="editorial-dossier">
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
              <ol className="psa-method-strip" aria-label="Luna operating system">
                <li><b>01</b><span>Signal integrity</span></li><li><b>02</b><span>Constraint economics</span></li><li><b>03</b><span>Operating architecture</span></li><li><b>04</b><span>Adoption</span></li><li><b>05</b><span>Control</span></li>
              </ol>
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
            <div className="psa-model-callout">
              <div><span>Working decision tool</span><h3>PSA Recovery Digital Twin</h3><p>Adjust demand, capacity, utilization, quality loss, aging work, surge capacity, and productivity assumptions to test the recovery mechanics.</p></div>
              <Link className="button button-light" href="/diagnostic">Launch the model <span aria-hidden="true">→</span></Link>
            </div>
            <details className="editorial-supporting">
              <summary><span>View the portfolio timeline artifact</span><b>Open +</b></summary>
              <div className="editorial-artifact">
                <Image src="/psa-timeline.png" width={1080} height={1350} alt="Six-stop PSA operating timeline from May 14 through the July 14 backlog update" />
                <div><span>Downloadable artifact</span><h3>The complete operating timeline.</h3><p>A 1080-pixel editorial timeline for executive review and portfolio use.</p><a className="button button-light" href="/psa-timeline.png" download>Download PNG</a></div>
              </div>
            </details>
            <details className="editorial-supporting psa-artifact-drawer">
              <summary><span>Inspect the sanitized decision artifacts</span><b>Open +</b></summary>
              <div className="psa-artifact-grid">
                {artifactPreviews.map((artifact, index) => (
                  <article key={artifact.title}>
                    <div><b>0{index + 1}</b><span>Sanitized portfolio reconstruction</span></div>
                    <h3>{artifact.title}</h3>
                    <dl>
                      <div><dt>Decision supported</dt><dd>{artifact.decision}</dd></div>
                      <div><dt>Inputs</dt><dd>{artifact.inputs}</dd></div>
                      <div><dt>Analysis</dt><dd>{artifact.analysis}</dd></div>
                      <div><dt>Output</dt><dd>{artifact.output}</dd></div>
                      <div><dt>Leadership use</dt><dd>{artifact.use}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
              <p className="psa-artifact-boundary">Portfolio reconstructions communicate the work structure without exposing client-confidential inputs, analysis, or internal documents.</p>
            </details>
          </div>
        </section>

        <section className="editorial-section editorial-impact" id="impact">
          <div className="shell editorial-section-grid">
            <div className="editorial-section-label"><span>Supported impact</span><small>04</small></div>
            <div className="editorial-reading-column editorial-wide-column">
              <h2>One engagement. Two distinct evidence layers.</h2>
              <div className="psa-impact-ledger">
                <section>
                  <header><span>Engagement scope</span><h3>What Luna Sol delivered</h3></header>
                  <ul>{lunaDeliverables.map((deliverable) => <li key={deliverable}><i aria-hidden="true">✓</i><span><strong>{deliverable}</strong><small>Luna Sol deliverable</small></span></li>)}</ul>
                </section>
                <section>
                  <header><span>Outcome context</span><h3>What PSA publicly reported</h3></header>
                  <ul>{publicOutcomes.map((outcome) => <li key={outcome.label}><strong>{outcome.value}</strong><span><b>{outcome.label}</b><small>{outcome.source}</small></span></li>)}</ul>
                </section>
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
              <div className="psa-evidence-meta"><span>Last evidence verification</span><strong>July 23, 2026</strong></div>
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
              <p className="editorial-attribution psa-validation-boundary"><strong>Validation boundary:</strong> No client testimonial is published without explicit approval. Engagement scope and public operating evidence are therefore presented as separate, labeled claims.</p>
            </div>
          </div>
        </section>
        </div>

        <section className="editorial-next-case">
          <div className="shell editorial-next-grid psa-focused-cta">
            <div><span>Have a comparable operating constraint?</span><h2>Bring the signal. Leave with the decision path.</h2><p>Start a confidential conversation about the queue, capacity problem, or transformation decision your current dashboards cannot resolve.</p><Link className="button button-light" href="/#contact">Discuss the operating constraint</Link></div>
            <div><span>Continue the portfolio</span><h2>HopSkipDrive</h2><p>Designing the operating system behind safe, scalable growth.</p><Link href="/work/hopskipdrive">Read the next case <span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
