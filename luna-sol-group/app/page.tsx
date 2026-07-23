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

type FeaturedCompany = {
  key: string;
  name: string;
  logo: string;
  width: number;
  height: number;
  website: string;
  relationship: string;
  title: string;
  description: string;
  caseStudy?: string;
  summary: {
    role: string;
    mandate: string;
    work: string[];
    value: string;
  };
  evidenceStatus: string;
  evidenceNote: string;
  evidence?: Array<{ label: string; href: string }>;
};

const featuredCompanies: FeaturedCompany[] = [
  {
    key: "psa",
    name: "PSA",
    logo: "/psa-logo.png",
    width: 449,
    height: 169,
    website: "https://www.psacard.com/",
    relationship: "Luna Sol advisory engagement · 2026",
    title: "Backlog stabilization and operating roadmap.",
    description: "Engaged during a record grading-backlog surge to identify the active constraint, structure near-term countermeasures, and establish the governance and capacity mechanisms behind recovery.",
    summary: {
      role: "Senior operating advisor",
      mandate: "Diagnose the active constraint during a record grading backlog and translate the fact base into an executable recovery roadmap.",
      work: ["Backlog and flow diagnosis", "Constraint and capacity analysis", "Near-term countermeasures", "Executive governance and operating cadence"],
      value: "The public backlog moved from a mid-June peak near 14M into an approximately 11–12M range by July. Public sources establish the timing and scale; the result reflects PSA leadership and operating teams alongside advisory support.",
    },
    evidenceStatus: "Live evidence checked",
    evidenceNote: "Public operating evidence · not sole-attribution proof",
    evidence: [
      { label: "PSA live backlog tracker", href: "https://www.psacard.com/info/backlog-tracker" },
      { label: "Sports Illustrated backlog update", href: "https://www.si.com/collectibles/psa-bi-weekly-update-shows-11-million-cards-still-backlogged" },
    ],
  },
  {
    key: "hopskipdrive",
    name: "HopSkipDrive",
    logo: "/hopskipdrive-logo.svg",
    width: 256,
    height: 256,
    website: "https://www.hopskipdrive.com/",
    caseStudy: "/work/hopskipdrive",
    relationship: "Luna Sol consulting engagement · 2026",
    title: "Operational foundation for regulated national scale.",
    description: "Designed the operating architecture connecting dispatch, compliance, SOPs, risk, executive governance, technical requirements, and implementation across a 30+ metro footprint.",
    summary: {
      role: "Senior Operations & Technical Project Manager · Consulting",
      mandate: "Create a scalable operating foundation for technology-enabled student transportation across a safety-critical, regulated, multi-market environment.",
      work: ["Current-state assessment and operating architecture", "Dispatch, compliance, incident, and risk workflows", "SOP library, vendor governance, and executive KPIs", "Technical requirements, roadmap, and knowledge transfer"],
      value: "Delivered a connected operating model spanning ten workstreams and a 30+ metro footprint. Public sources provide company context; they are not represented as independent proof of personal contribution.",
    },
    evidenceStatus: "Company sources checked",
    evidenceNote: "Official company context · personal scope labeled separately",
    evidence: [
      { label: "2026–2027 product suite", href: "https://www.hopskipdrive.com/blog/new-2026-2027-product-suite/" },
      { label: "Six-state expansion announcement", href: "https://www.hopskipdrive.com/blog/hopskipdrive-plans-expansion-across-six-new-states-for-the-2025-2026-school/" },
    ],
  },
  {
    key: "maid-of-the-mist",
    name: "Maid of the Mist",
    logo: "/maid-of-the-mist-logo.svg",
    width: 229,
    height: 154,
    website: "https://www.maidofthemist.com/",
    caseStudy: "/work/maid-of-the-mist",
    relationship: "Luna Sol senior operations engagement · 2026",
    title: "Guest-flow bottlenecks translated into a public planning tool.",
    description: "Assessed the U.S. operation end to end; recommendations informed guest-planning enhancements, including the Wait Time Trends & Insights capability launched for the 2026 season.",
    summary: {
      role: "Senior Operations Consultant",
      mandate: "Assess guest flow, queues, throughput, capacity, labor, and the digital journey across the U.S. operation.",
      work: ["End-to-end field observation and process mapping", "Queue, throughput, and capacity analysis", "Bottleneck and demand-pattern diagnosis", "Executive recommendations and implementation sequencing"],
      value: "The assessment informed guest-planning enhancements, including the publicly launched Wait Time Trends & Insights capability. Public reporting confirms the feature and purpose—not sole ownership of the result.",
    },
    evidenceStatus: "News + official source checked",
    evidenceNote: "Feature launch corroborated · contribution attribution bounded",
    evidence: [
      { label: "WGRZ 2026 launch coverage", href: "https://www.wgrz.com/article/news/local/maid-of-the-mist-announces-launch-date-for-2026/71-302e72a9-f363-43db-ad1d-69884d595407" },
      { label: "Official Maid announcement", href: "https://www.maidofthemist.com/ready-to-launch-maid-of-the-mist-to-set-sail-on-2026-season/" },
    ],
  },
  {
    key: "amazon",
    name: "Amazon",
    logo: "/amazon-logo.svg",
    width: 603,
    height: 182,
    website: "https://www.amazon.com/",
    relationship: "Former executive operator · Career experience",
    title: "Global last-mile transformation at enterprise scale.",
    description: "Led operating-system, delivery-partner, capacity, and network-economics work across North America, Europe, and Japan before founding Luna Sol.",
    summary: {
      role: "Executive product and operations leader",
      mandate: "Improve the economics, quality, capacity, and controllability of complex last-mile networks operating across regions.",
      work: ["Global operating-system design", "Delivery-partner and capacity mechanisms", "Network economics and capital allocation", "AI-assisted defect attribution and field adoption"],
      value: "Selected anonymized career outcomes are presented in the site’s executive proof points. They reflect operator leadership inside Amazon and the work of broad cross-functional teams—not a Luna Sol client engagement.",
    },
    evidenceStatus: "Experience basis labeled",
    evidenceNote: "Prior employment · not a Luna Sol client",
  },
  {
    key: "walmart",
    name: "Walmart",
    logo: "/walmart-logo.svg",
    width: 1000,
    height: 190,
    website: "https://www.walmart.com/",
    relationship: "Former operator · Career experience",
    title: "Nearly a decade inside complex retail operations.",
    description: "Built frontline judgment and execution discipline in a high-volume retail environment where customer promise, labor, inventory, and operating cadence converge.",
    summary: {
      role: "Retail operations leader",
      mandate: "Run high-volume frontline operations where customer promise, labor, inventory, safety, and daily execution intersect.",
      work: ["Frontline operating leadership", "Labor and execution cadence", "Inventory and customer-promise management", "Field problem solving under live demand"],
      value: "This experience established the frontline operating foundation later applied to enterprise transformation roles. It is explicitly presented as prior employment—not consulting work or a Luna Sol client relationship.",
    },
    evidenceStatus: "Experience basis labeled",
    evidenceNote: "Prior employment · not a Luna Sol client",
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
                <Link className="button" href="/#featured-work">Explore featured work <span aria-hidden="true">→</span></Link>
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

        <section className="section featured-work-section" id="featured-work">
          <div className="shell">
            <div className="section-heading compact-heading dark-heading">
              <div><span className="section-label light">Featured work and operating experience</span><h2>One page. Five operating chapters.</h2></div>
              <p>Open any project summary for the mandate, role, work delivered, value, and evidence boundary. Company marks still link directly to each organization.</p>
            </div>
            <div className="company-grid project-index">
              {featuredCompanies.map((company, index) => (
                <article className="company-card" key={company.name}>
                  <div className="company-card-overview">
                    <div className="company-card-top">
                      <span>{company.relationship}</span>
                      <b>0{index + 1}</b>
                    </div>
                    <a className="company-logo-link" href={company.website} target="_blank" rel="noreferrer" aria-label={`Visit ${company.name} website`}>
                      <span className={company.key === "hopskipdrive" ? "company-logo-stage company-logo-lockup" : "company-logo-stage"}>
                        <img src={company.logo} width={company.width} height={company.height} alt={`${company.name} logo`} />
                        {company.key === "hopskipdrive" ? <b>HopSkipDrive</b> : null}
                      </span>
                    </a>
                    <div className="company-card-copy">
                      <h3>{company.title}</h3>
                      <p>{company.description}</p>
                    </div>
                    <div className="company-evidence-status"><i aria-hidden="true">✓</i><span><strong>{company.evidenceStatus}</strong><small>{company.evidenceNote}</small></span></div>
                  </div>
                  <details className="project-summary-card">
                    <summary><span>Project summary</span><strong><i aria-hidden="true">+</i> Expand details</strong></summary>
                    <div className="project-summary-body">
                      <div className="project-summary-facts">
                        <section><span>Role</span><strong>{company.summary.role}</strong></section>
                        <section><span>Mandate</span><p>{company.summary.mandate}</p></section>
                        <section className="project-work"><span>Work delivered</span><ul>{company.summary.work.map((item) => <li key={item}>{item}</li>)}</ul></section>
                        <section><span>Value and boundary</span><p>{company.summary.value}</p></section>
                      </div>
                      {company.key === "psa" ? <LiveBacklog compact /> : null}
                      {company.evidence?.length ? (
                        <div className="project-evidence-links"><span>Evidence and context sources</span><div>{company.evidence.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.label} <i aria-hidden="true">↗</i></a>)}</div></div>
                      ) : null}
                      <div className="company-card-links">
                        {company.caseStudy ? <Link href={company.caseStudy}>Explore full engagement <span aria-hidden="true">→</span></Link> : null}
                        <a href={company.website} target="_blank" rel="noreferrer">Visit {company.name} <span aria-hidden="true">↗</span></a>
                      </div>
                    </div>
                  </details>
                </article>
              ))}
            </div>
            <div className="portfolio-outcomes" aria-label="Selected operating outcomes">
              {otherWork.map((work) => (
                <article key={work.title}>
                  <span>{work.label}</span>
                  <strong>{work.metric}</strong>
                  <p>{work.metricLabel}</p>
                </article>
              ))}
            </div>
            <p className="portfolio-disclaimer">Company marks identify the organizations connected to the experience shown. PSA, HopSkipDrive, and Maid of the Mist are consulting or advisory engagements as labeled; public outcomes reflect the collaborative work of each company’s leadership, operating teams, and stakeholders. Amazon and Walmart represent Ryan Miller’s prior employment and operator experience, not Luna Sol client engagements. All marks belong to their respective owners.</p>
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
