import Link from "next/link";
import { InquiryForm } from "./components/InquiryForm";
import { LiveBacklog } from "./components/LiveBacklog";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

const enterpriseProof = [
  { value: "$2.5B+", label: "annual savings generated through global delivery transformation" },
  { value: "$550M+", label: "delivery losses eliminated through operating redesign and prediction" },
  { value: "$300M", label: "capital program directed across North America, Europe, and Japan" },
  { value: "35%", label: "operational defect reduction across a global last-mile network" },
];

const capabilities = [
  {
    n: "01",
    title: "Establish operating truth",
    description: "Reconcile dashboards, workflow evidence, frontline reality, and financial consequences into one decision-grade fact base.",
    deliverables: ["Signal audit", "Constraint tree", "Value-at-stake bridge"],
  },
  {
    n: "02",
    title: "Redesign the operating system",
    description: "Translate the root constraint into workflows, decision rights, technology, incentives, and an executable transformation portfolio.",
    deliverables: ["Target operating model", "Decision architecture", "Sequenced roadmap"],
  },
  {
    n: "03",
    title: "Deploy until the result holds",
    description: "Install the management cadence, field mechanisms, adoption engine, and controls that move performance after the recommendation is delivered.",
    deliverables: ["Control tower", "Field enablement", "Benefits verification"],
  },
];

const otherWork = [
  {
    label: "Global delivery economics",
    title: "A quality failure reframed as a network-value problem.",
    metric: "$25M",
    metricLabel: "validated annual cost avoidance",
    detail: "Connected defect mechanics to cost, built the value bridge, and aligned more than 1,000 stations around a common control model.",
  },
  {
    label: "Measurement integrity",
    title: "A 44% reporting gap exposed and corrected.",
    metric: "1,200 bps",
    metricLabel: "hidden degradation quantified",
    detail: "Audited exemption and classification logic, rebuilt accountability signals, and redesigned cross-functional governance.",
  },
  {
    label: "Peak surge readiness",
    title: "Record volume absorbed without incremental headcount.",
    metric: "92%+",
    metricLabel: "service compliance",
    detail: "Used AI-assisted defect attribution, targeted coaching, and a durable field cadence to control execution through peak.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="shell hero-grid">
            <div className="hero-copy">
              <span className="kicker">Operator-led transformation · Built for consequential decisions</span>
              <h1>Operating problems worth millions need more than <em>recommendations.</em></h1>
              <p className="hero-deck">Luna Sol turns contested signals, cross-functional friction, and stalled transformation into a fact base, an operating system, and measurable control.</p>
              <div className="hero-actions">
                <Link className="button" href="/work/psa">Explore featured work <span aria-hidden="true">→</span></Link>
                <Link className="button button-ghost" href="/diagnostic">Run the executive diagnostic</Link>
              </div>
              <div className="hero-note"><span>Best fit</span> Logistics · Retail · Mobility · Investor-backed operations</div>
            </div>
            <div className="operating-board" aria-label="Luna operating system overview">
              <div className="board-top">
                <span>Luna operating system</span>
                <b>Decision control</b>
              </div>
              <div className="board-signal">
                <span>Signal integrity</span>
                <strong>Operating truth</strong>
                <i>01</i>
              </div>
              <div className="board-path" aria-hidden="true"><span /><span /><span /><span /></div>
              <div className="board-grid">
                <div><b>02</b><span>Constraint</span><strong>Economics</strong></div>
                <div><b>03</b><span>Operating</span><strong>Architecture</strong></div>
                <div><b>04</b><span>Adoption</span><strong>Mechanisms</strong></div>
                <div><b>05</b><span>Durable</span><strong>Control</strong></div>
              </div>
              <div className="board-status"><i /> From ambiguity to controlled execution</div>
            </div>
          </div>
          <div className="shell proof-strip">
            {enterpriseProof.map((proof) => (
              <div key={proof.value}><strong>{proof.value}</strong><span>{proof.label}</span></div>
            ))}
          </div>
          <p className="shell proof-disclaimer">Select outcomes led by Ryan Miller across executive operator and advisory roles. Figures are anonymized and should not be read as solely attributable to Luna Sol.</p>
        </section>

        <section className="section paper" id="capabilities">
          <div className="shell">
            <div className="section-heading">
              <div><span className="section-label">How Luna Sol creates value</span><h2>Advice is the starting point.<br />Control is the deliverable.</h2></div>
              <p>Engagements begin with a consequential decision and end with a system an operator can run under pressure.</p>
            </div>
            <div className="capability-grid">
              {capabilities.map((capability) => (
                <article className="capability" key={capability.n}>
                  <span className="capability-number">{capability.n}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                  <ul>{capability.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section feature-section">
          <div className="shell feature-grid">
            <div className="feature-copy">
              <span className="section-label light">Featured transformation engagement</span>
              <h2>Stabilizing a record demand surge while designing the system beyond the crisis.</h2>
              <p>Engaged during PSA’s 2026 grading-backlog surge to identify the active operating constraint, deploy short-term countermeasures, and establish the initiatives, governance, and capacity mechanisms required to continue reducing the queue.</p>
              <div className="feature-actions">
                <Link className="button button-light" href="/work/psa">Read the evidence-backed case <span aria-hidden="true">→</span></Link>
                <a className="text-link light" href="/psa-timeline.png" download>Download the operating timeline</a>
              </div>
            </div>
            <div className="feature-dashboard">
              <div className="dashboard-label"><span>Operating arc</span><b>May–July 2026</b></div>
              <div className="arc-value"><span>Peak</span><strong>~14m</strong><i aria-hidden="true">→</i><span>Latest official</span><strong>11m</strong></div>
              <div className="arc-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="result-grid">
                <div><strong>&gt;10%</strong><span>June output vs. prior record</span></div>
                <div><strong>99.4%</strong><span>reported operational success</span></div>
              </div>
              <LiveBacklog compact />
              <p className="dashboard-note">Public performance reflects the combined work of PSA leadership and operating teams; it is not presented as solely attributable to Luna Sol.</p>
            </div>
          </div>
        </section>

        <section className="section paper work-section" id="work">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div><span className="section-label">Selected operating outcomes</span><h2>What changed. How it changed. Why it held.</h2></div>
              <p>Sanitized examples from complex operating environments. Each begins with the mechanism—not the headline metric.</p>
            </div>
            <div className="work-grid">
              {otherWork.map((work, index) => (
                <article className="work-card" key={work.title}>
                  <div className="work-index">0{index + 1}</div>
                  <span className="section-label">{work.label}</span>
                  <h3>{work.title}</h3>
                  <p>{work.detail}</p>
                  <div className="work-metric"><strong>{work.metric}</strong><span>{work.metricLabel}</span></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section method-section" id="method">
          <div className="shell method-grid">
            <div className="method-copy">
              <span className="section-label light">Luna OS™</span>
              <h2>One operating thread from signal to sustained value.</h2>
              <p>Every phase produces an executive decision and an operator-owned mechanism. No orphaned analysis. No transformation theater.</p>
              <Link className="text-link light" href="/diagnostic">Test your operating conditions →</Link>
            </div>
            <ol className="method-list">
              <li><b>01</b><div><strong>Truth</strong><span>Reconcile the signal with physical reality.</span></div></li>
              <li><b>02</b><div><strong>Constraint</strong><span>Identify the economically material mechanism.</span></div></li>
              <li><b>03</b><div><strong>Architecture</strong><span>Redesign work, decisions, technology, and incentives.</span></div></li>
              <li><b>04</b><div><strong>Adoption</strong><span>Make the new behavior executable under pressure.</span></div></li>
              <li><b>05</b><div><strong>Control</strong><span>Install cadence, thresholds, owners, and verification.</span></div></li>
            </ol>
          </div>
        </section>

        <section className="section paper principal-section" id="principal">
          <div className="shell principal-grid">
            <div className="principal-card">
              <div className="principal-monogram">RM</div>
              <div className="principal-status"><i /> Available for select 2026 engagements</div>
              <dl>
                <div><dt>Operating regions</dt><dd>North America · Europe · Japan</dd></div>
                <div><dt>Core environments</dt><dd>Last mile · Retail · Mobility · AI-enabled operations</dd></div>
                <div><dt>Engagement posture</dt><dd>Founder-led · Confidential · Embedded when required</dd></div>
              </dl>
            </div>
            <div className="principal-copy">
              <span className="section-label">Founder and principal</span>
              <h2>Ryan Miller, EMBA</h2>
              <p className="principal-lead">An operator who has built, redesigned, and carried the number inside two of the world’s most demanding operating systems.</p>
              <p>Ryan’s work spans global last-mile transformation, network optimization, AI-driven route prediction, delivery-partner architecture, capacity planning, customer experience, and large-scale frontline execution.</p>
              <div className="credential-grid">
                <div><strong>Amazon</strong><span>Global last-mile leadership across NA, EU, and JP</span></div>
                <div><strong>Walmart</strong><span>Nearly a decade in complex retail operations</span></div>
                <div><strong>DSP 2.0</strong><span>Co-developed foundational partner-model redesign</span></div>
                <div><strong>103.8 TPH</strong><span>North American manual-sortation benchmark</span></div>
              </div>
              <a className="text-link dark" href="https://www.linkedin.com/in/rmmba" target="_blank" rel="noreferrer">View Ryan’s LinkedIn profile ↗</a>
            </div>
          </div>
        </section>

        <section className="section diagnostic-callout">
          <div className="shell diagnostic-callout-grid">
            <div>
              <span className="section-label">Interactive executive tool</span>
              <h2>Is this a local defect—or an operating-system problem?</h2>
              <p>Score six operating conditions and receive a decision-ready brief with the likely intervention level, the highest-friction signals, and the first executive move.</p>
            </div>
            <div className="diagnostic-preview">
              <div><span>Signal uncertainty</span><i><b style={{ width: "71%" }} /></i><strong>71</strong></div>
              <div><span>Cross-functional complexity</span><i><b style={{ width: "82%" }} /></i><strong>82</strong></div>
              <div><span>Adoption drag</span><i><b style={{ width: "64%" }} /></i><strong>64</strong></div>
              <Link className="button" href="/diagnostic">Run the 4-minute diagnostic <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="section contact-section" id="contact">
          <div className="shell contact-grid">
            <div className="contact-copy">
              <span className="section-label light">Start with the real problem</span>
              <h2>Bring the operating problem your dashboards cannot explain.</h2>
              <p>Confidential conversations for executives, operators, investors, and founders navigating complex operating systems.</p>
              <div className="contact-points">
                <span><i>01</i> Define the decision</span>
                <span><i>02</i> Size what is at stake</span>
                <span><i>03</i> Determine the right intervention</span>
              </div>
            </div>
            <InquiryForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
