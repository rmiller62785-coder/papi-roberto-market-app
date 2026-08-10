import Image from "next/image";
import Link from "next/link";
import { HomeCaseIndex } from "./components/HomeCaseIndex";
import { InquiryForm } from "./components/InquiryForm";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

const offers = [
  {
    n: "01",
    title: "Constraint Diagnostic Sprint",
    use: "Dashboards disagree, performance is moving, and leadership needs the real mechanism—not another opinion.",
    produces: ["Decision-grade fact base", "Constraint hypothesis", "Value-at-stake view", "30-day action path"],
    decision: "What is actually limiting performance, and what evidence will disprove it?",
  },
  {
    n: "02",
    title: "Operating System Build",
    use: "Growth has outrun the workflows, decision rights, controls, or technology required to carry it safely.",
    produces: ["Target operating model", "Decision architecture", "SOP + RACI system", "Implementation roadmap"],
    decision: "What must change across work, governance, technology, and accountability?",
  },
  {
    n: "03",
    title: "Transformation Control Office",
    use: "The strategy is approved, but the portfolio is not moving fast enough or value is not holding in execution.",
    produces: ["Portfolio governance", "Launch gates", "WBR cadence", "Benefits verification"],
    decision: "Which intervention, owner, and control will move the result now?",
  },
];

const outcomes = [
  { value: "$2.5B+", label: "annual savings generated", context: "Global delivery transformation · prior executive role" },
  { value: "$550M+", label: "delivery losses eliminated", context: "Operating redesign and prediction · prior executive role" },
  { value: "$300M", label: "capital program directed", context: "North America, Europe, and Japan · prior executive role" },
  { value: "35%", label: "operational defect reduction", context: "Global last-mile network · prior executive role" },
];

const insights = [
  { n: "01", title: "Backlog recovery planning", detail: "Why rated capacity is not the same as effective throughput.", href: "/insights/backlog-recovery-planning" },
  { n: "02", title: "Cost of delay for operating queues", detail: "How to frame exposure without pretending it is booked savings.", href: "/insights/cost-of-delay-operating-queues" },
  { n: "03", title: "Validate the constraint before staffing", detail: "An evidence sequence for testing the mechanism before adding labor.", href: "/insights/validate-constraints-before-staffing" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="home-v2">
        <section className="home-hero">
          <div className="shell home-hero-grid">
            <div className="home-hero-copy" data-reveal>
              <span className="kicker">Luna Sol Group · Operator-led transformation</span>
              <h1>Find the constraint.<br /><em>Build the system</em><br />that clears it.</h1>
              <p>Ryan Miller helps logistics, retail, mobility, and investor-backed teams stabilize performance, redesign decision flow, and leave with controls their operators can run.</p>
              <div className="home-hero-actions">
                <Link className="button" href="/work" prefetch={false}>See the work <span aria-hidden="true">→</span></Link>
                <Link className="button button-ghost" href="/tools" prefetch={false}>Test your operation</Link>
              </div>
              <dl className="home-hero-register">
                <div><dt>Best fit</dt><dd>Consequential operating decisions</dd></div>
                <div><dt>Built for</dt><dd>Executives · Operators · Investors</dd></div>
                <div><dt>Posture</dt><dd>Founder-led · Embedded when required</dd></div>
              </dl>
            </div>
            <figure className="home-portrait" data-reveal>
              <div className="home-portrait-frame">
                <Image src="/ryan-miller-stage.png" width={800} height={800} priority sizes="(max-width: 760px) 100vw, 42vw" alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage." />
                <span aria-hidden="true">01 / Principal</span>
              </div>
              <figcaption>
                <div><strong>Ryan Miller, EMBA</strong><span>Founder and Principal</span></div>
                <p>Former Amazon and Walmart operator · North America, Europe, and Japan</p>
              </figcaption>
            </figure>
          </div>
          <div className="shell relationship-rail" aria-label="Advisory and operating experience">
            <div><span>Advisory engagements</span><a href="https://www.psacard.com/" target="_blank" rel="noreferrer"><Image src="/psa-logo.png" width={830} height={338} alt="PSA" /></a><a href="https://www.hopskipdrive.com/" target="_blank" rel="noreferrer" className="rail-hsd"><Image src="/hopskipdrive-logo.svg" width={256} height={256} alt="HopSkipDrive" /><b>HopSkipDrive</b></a><a href="https://www.maidofthemist.com/" target="_blank" rel="noreferrer"><Image src="/maid-of-the-mist-logo.svg" width={229} height={154} alt="Maid of the Mist" /></a></div>
            <div><span>Prior operating experience</span><a href="https://www.amazon.com/" target="_blank" rel="noreferrer"><Image src="/amazon-logo.svg" width={603} height={182} alt="Amazon" /></a><a href="https://www.walmart.com/" target="_blank" rel="noreferrer"><Image src="/walmart-logo.svg" width={1000} height={190} alt="Walmart" /></a></div>
          </div>
        </section>

        <HomeCaseIndex />

        <section className="section offer-section" id="capabilities">
          <div className="shell">
            <header className="editorial-heading inverse" data-reveal>
              <div><span className="section-label light">How to engage</span><h2>Start with the decision—not a generic scope.</h2></div>
              <p>Three bounded entry points create enough clarity to act without forcing the operation into a prepackaged answer.</p>
            </header>
            <div className="offer-ledger">
              {offers.map((offer) => (
                <article key={offer.n} data-reveal>
                  <header><span>{offer.n}</span><h3>{offer.title}</h3></header>
                  <div className="offer-use"><strong>Use when</strong><p>{offer.use}</p></div>
                  <div className="offer-output"><strong>Produces</strong><ul>{offer.produces.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div className="offer-decision"><strong>Starting decision</strong><p>{offer.decision}</p></div>
                </article>
              ))}
            </div>
            <div className="offer-close"><p>Unsure which intervention fits? Start with the operating decision and the evidence currently available.</p><Link className="button button-light" href="/#contact" prefetch={false}>Discuss the decision →</Link></div>
          </div>
        </section>

        <section className="section product-desk-section">
          <div className="shell product-desk-grid">
            <div className="product-desk-copy" data-reveal>
              <span className="section-label">Flagship decision product</span>
              <h2>Run the operation and the transformation from one decision surface.</h2>
              <p>The Executive Operations Studio turns capacity, service, value, portfolio, and risk signals into a controlled weekly operating cadence.</p>
              <ul><li>Control tower and capacity signal</li><li>Portfolio value and sequencing</li><li>Weekly business review</li><li>Decision and risk register</li></ul>
              <div><Link className="button" href="/tools/executive-operations-studio" prefetch={false}>Open with sample data →</Link><Link className="text-link dark" href="/tools" prefetch={false}>See all decision products</Link></div>
            </div>
            <div className="product-desk-surface" data-reveal aria-label="Executive Operations Studio sample state">
              <header><div><i /><span>Executive Operations Studio</span></div><b>Sample operating state</b></header>
              <div className="product-desk-tabs"><span className="is-active">Control tower</span><span>Portfolio</span><span>WBR</span></div>
              <div className="product-desk-kpis"><article><span>Capacity coverage</span><strong>100.7%</strong><small>Watch · &lt;5% buffer</small></article><article><span>Target timing</span><strong>32 wks</strong><small>Outside plan</small></article><article><span>Portfolio value</span><strong>$29.1M</strong><small>Modeled gross value</small></article></div>
              <div className="product-desk-decision"><span>Decision surfaced</span><strong>Secure the effective-capacity gap or move the recovery target before committing the operating plan.</strong><dl><div><dt>Owner</dt><dd>Network operations</dd></div><div><dt>Control</dt><dd>Weekly capacity gate</dd></div></dl></div>
              <footer><span>CSV import</span><span>Transparent formulas</span><span>Exportable brief</span></footer>
            </div>
          </div>
        </section>

        <section className="section method-v2-section">
          <div className="shell method-v2-grid">
            <div className="method-v2-intro" data-reveal><span className="section-label light">Luna OS™</span><h2>One operating thread from contested signal to durable control.</h2><p>Every gate produces an executive decision and an operator-owned mechanism.</p><Link className="text-link light" href="/approach" prefetch={false}>Inspect the complete decision system →</Link></div>
            <ol className="method-spine">
              <li data-reveal><b>01</b><div><strong>Truth</strong><span>Reconcile signal with physical reality.</span></div><small>Fact base</small></li>
              <li data-reveal><b>02</b><div><strong>Constraint</strong><span>Identify the economically material mechanism.</span></div><small>Hypothesis</small></li>
              <li data-reveal><b>03</b><div><strong>Architecture</strong><span>Redesign work, decisions, technology, and incentives.</span></div><small>Operating model</small></li>
              <li data-reveal><b>04</b><div><strong>Adoption</strong><span>Make the new behavior executable under pressure.</span></div><small>Mechanisms</small></li>
              <li data-reveal><b>05</b><div><strong>Control</strong><span>Install cadence, thresholds, owners, and verification.</span></div><small>Management system</small></li>
            </ol>
          </div>
        </section>

        <section className="section outcome-section paper">
          <div className="shell">
            <header className="editorial-heading" data-reveal><div><span className="section-label">Selected operating outcomes</span><h2>Scale carried before Luna Sol was founded.</h2></div><p>The advisory method is grounded in executive operating work inside high-velocity physical networks—not abstract frameworks.</p></header>
            <div className="outcome-register">
              {outcomes.map((outcome) => <article key={outcome.value} data-reveal><strong>{outcome.value}</strong><h3>{outcome.label}</h3><p>{outcome.context}</p></article>)}
            </div>
            <div className="experience-register">
              <div><a href="https://www.amazon.com/" target="_blank" rel="noreferrer"><Image src="/amazon-logo.svg" width={603} height={182} alt="Amazon" /></a><span>Prior executive operator</span><p>Global last-mile transformation across North America, Europe, and Japan.</p><Link href="/experience/amazon" prefetch={false}>Read the operating retrospective →</Link></div>
              <div><a href="https://www.walmart.com/" target="_blank" rel="noreferrer"><Image src="/walmart-logo.svg" width={1000} height={190} alt="Walmart" /></a><span>Prior operator</span><p>Nearly a decade inside complex retail operations where labor, inventory, and customer promise converge.</p><Link href="/about" prefetch={false}>Meet the principal →</Link></div>
            </div>
            <p className="outcome-boundary">These outcomes span Ryan Miller’s prior executive operating roles and are not presented as Luna Sol client results or solely attributable individual outcomes.</p>
          </div>
        </section>

        <section className="section principal-v2-section" id="principal">
          <div className="shell principal-v2-grid">
            <div className="principal-v2-statement" data-reveal><span className="section-label light">The operator behind the system</span><blockquote>“The recommendation is not the deliverable. The deliverable is a system the operating team can run when the pressure returns.”</blockquote><Link className="button button-light" href="/about" prefetch={false}>About Ryan Miller →</Link></div>
            <div className="principal-v2-record" data-reveal><span>Operator record</span><h2>Built inside the work.</h2><p>Ryan has operated inside two of the world’s most demanding physical networks, then translated that experience into a founder-led advisory model for companies whose growth has outrun their operating system.</p><dl><div><dt>Operating regions</dt><dd>North America · Europe · Japan</dd></div><div><dt>Core environments</dt><dd>Last mile · Retail · Mobility · AI-enabled operations</dd></div><div><dt>Engagement posture</dt><dd>Founder-led · Confidential · Embedded when required</dd></div></dl><a className="text-link light" href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">View LinkedIn profile ↗</a></div>
          </div>
        </section>

        <section className="section insight-preview-section paper">
          <div className="shell">
            <header className="editorial-heading" data-reveal><div><span className="section-label">Latest operating briefs</span><h2>Judgment you can inspect.</h2></div><p>Short technical briefs expose the equation, the evidence sequence, and the point where the model stops.</p></header>
            <div className="insight-preview-list">{insights.map((insight) => <article key={insight.href} data-reveal><span>{insight.n}</span><div><h3>{insight.title}</h3><p>{insight.detail}</p></div><Link href={insight.href} prefetch={false} aria-label={`Read ${insight.title}`}>Read brief →</Link></article>)}</div>
            <Link className="text-link dark" href="/insights" prefetch={false}>Open all operations insights →</Link>
          </div>
        </section>

        <section className="section contact-section contact-v2" id="contact">
          <div className="shell contact-grid">
            <div className="contact-copy" data-reveal><span className="section-label light">Bring one operating decision</span><h2>Start with what the current system cannot resolve.</h2><p>Ryan reviews every inquiry directly. If there is a fit, the first conversation will define the decision, the evidence needed, and the smallest useful starting point.</p><div className="contact-points"><span><i>01</i> Define the decision</span><span><i>02</i> Size what is at stake</span><span><i>03</i> Select the smallest useful intervention</span></div></div>
            <InquiryForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
