import Image from "next/image";
import Link from "next/link";
import { InquiryForm } from "./components/InquiryForm";
import { RebuildHomeCaseGrid } from "./components/RebuildHomeCaseGrid";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import "./styles/rebuild-home.css";

const operatingRecord = [
  { value: "$2.5B+", label: "Annual savings generated", context: "Prior executive operating role" },
  { value: "$550M+", label: "Delivery losses eliminated", context: "Prior executive operating role" },
  { value: "$300M", label: "Capital program directed", context: "Prior executive operating role" },
  { value: "35%", label: "Operational defect reduction", context: "Prior executive operating role" },
];

const capabilities = [
  {
    number: "01",
    title: "Performance transformation",
    question: "What is preventing the operation from converting capacity into reliable performance?",
    outputs: "Constraint diagnosis · recovery architecture · performance control",
    href: "/capabilities/performance-transformation",
  },
  {
    number: "02",
    title: "Operating model and scale",
    question: "Which workflows, decisions, and controls must change before growth becomes operational risk?",
    outputs: "Target operating model · governance · compliance-by-design",
    href: "/capabilities/operating-model-and-scale",
  },
  {
    number: "03",
    title: "Transformation execution",
    question: "How does the approved strategy become sequenced work with accountable value?",
    outputs: "Transformation office · launch gates · benefits control",
    href: "/capabilities/transformation-execution",
  },
  {
    number: "04",
    title: "Digital operations",
    question: "Where can technology improve the operating mechanism instead of digitizing the failure?",
    outputs: "Technical requirements · workflow design · decision products",
    href: "/capabilities/digital-operations",
  },
];

const industrySignals = [
  { title: "Logistics and last mile", signal: "Network capacity · service promise · delivery economics" },
  { title: "Mobility and transportation", signal: "Dispatch · safety controls · regulated scale" },
  { title: "Consumer and retail", signal: "Labor · inventory · flow · customer experience" },
  { title: "Investor-backed operations", signal: "Value creation · cadence · transformation risk" },
];

const insightLinks = [
  {
    number: "02",
    type: "Operating brief",
    title: "Cost of delay for operating queues",
    copy: "Expose economic pressure without presenting modeled exposure as booked savings.",
    href: "/insights/cost-of-delay-operating-queues",
  },
  {
    number: "03",
    type: "Operating brief",
    title: "Validate the constraint before staffing",
    copy: "An evidence sequence for testing the mechanism before adding labor or automation.",
    href: "/insights/validate-constraints-before-staffing",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="rebuild-home">
        <section className="rh-hero" aria-labelledby="rh-hero-title">
          <div className="rh-solar-grid" aria-hidden="true"><i /><i /><i /></div>
          <div className="shell rh-hero-grid">
            <div className="rh-hero-copy">
              <span className="rh-eyebrow">Luna Sol Group · Management consulting</span>
              <h1 id="rh-hero-title">Make the operating decision. <span>Build the system that makes it hold.</span></h1>
              <p>Luna Sol helps executives resolve consequential operating problems—then installs the mechanisms, governance, and implementation path required to sustain the result.</p>
              <div className="rh-actions">
                <Link className="rh-button rh-button-light" href="/capabilities" prefetch={false}>Explore capabilities <span aria-hidden="true">→</span></Link>
                <Link className="rh-text-link rh-text-link-inverse" href="/work" prefetch={false}>Review selected work <span aria-hidden="true">↗</span></Link>
              </div>
            </div>

            <article className="rh-hero-feature">
              <Link className="rh-hero-feature-image" href="/work/hopskipdrive" prefetch={false} aria-label="Read the HopSkipDrive case study">
                <Image
                  src="/hopskipdrive-expansion.jpg"
                  alt="HopSkipDrive CareDriver seated in a vehicle."
                  fill
                  unoptimized
                  priority
                  sizes="(max-width: 820px) 100vw, 42vw"
                />
                <span>Featured engagement · 2026</span>
              </Link>
              <div className="rh-hero-feature-copy">
                <div><span>Mobility and transportation</span><strong>30+ metro markets</strong></div>
                <h2>Operating architecture for regulated national scale.</h2>
                <p>Dispatch, compliance, SOPs, risk, governance, and technical requirements designed as one operating system.</p>
                <Link href="/work/hopskipdrive" prefetch={false}>Read the case study <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          </div>

          <nav className="shell rh-content-rail" aria-label="Explore Luna Sol">
            <Link href="/work" prefetch={false}><span>01</span><strong>Case studies</strong><small>Evidence-aware engagement dossiers</small></Link>
            <Link href="/capabilities" prefetch={false}><span>02</span><strong>Capabilities</strong><small>Four intervention points</small></Link>
            <Link href="/tools" prefetch={false}><span>03</span><strong>Operations Lab</strong><small>Working decision products</small></Link>
            <Link href="/insights" prefetch={false}><span>04</span><strong>Insights</strong><small>Methods built to be challenged</small></Link>
          </nav>
        </section>

        <section className="rh-record" aria-labelledby="rh-record-title">
          <div className="shell">
            <header className="rh-compact-heading">
              <span id="rh-record-title">Selected operating record</span>
              <p>Outcomes from Ryan Miller&apos;s executive operating career, shown separately from Luna Sol client work.</p>
            </header>
            <div className="rh-record-grid">
              {operatingRecord.map((item) => (
                <article key={item.value}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                  <small>{item.context}</small>
                </article>
              ))}
            </div>
            <p className="rh-boundary">Prior-role outcomes are not presented as Luna Sol client results or solely attributable individual outcomes.</p>
          </div>
        </section>

        <section className="rh-section rh-work" id="featured-work" aria-labelledby="rh-work-title">
          <div className="shell">
            <header className="rh-section-heading">
              <div><span>Selected work</span><h2 id="rh-work-title">The operating context, the intervention, and the evidence boundary.</h2></div>
              <div><p>Each case opens into a focused, single-page dossier. Personal scope and public company evidence remain explicitly separated.</p><Link className="rh-text-link" href="/work" prefetch={false}>View all case studies <span aria-hidden="true">→</span></Link></div>
            </header>
            <RebuildHomeCaseGrid />
            <div className="rh-claim-boundary"><strong>Claim boundary</strong><p>Company and public outcomes reflect collaborative operating teams. Luna Sol&apos;s contribution and public evidence are labeled separately inside every case study.</p></div>
          </div>
        </section>

        <section className="rh-section rh-capabilities" aria-labelledby="rh-capabilities-title">
          <div className="shell">
            <header className="rh-section-heading rh-section-heading-inverse">
              <div><span>Capabilities</span><h2 id="rh-capabilities-title">Four ways into the same operating system.</h2></div>
              <div><p>Start with the executive decision—not a prepackaged workstream. Every intervention connects operating truth to controlled execution.</p><Link className="rh-text-link rh-text-link-inverse" href="/capabilities" prefetch={false}>Explore the capability system <span aria-hidden="true">→</span></Link></div>
            </header>
            <div className="rh-capability-ledger">
              {capabilities.map((item) => (
                <article key={item.number}>
                  <span>{item.number}</span>
                  <h3>{item.title}</h3>
                  <p>{item.question}</p>
                  <small>{item.outputs}</small>
                  <Link href={item.href} prefetch={false} aria-label={`Explore ${item.title}`}><span aria-hidden="true">↗</span></Link>
                </article>
              ))}
            </div>
            <div className="rh-industry-rail">
              <div><span>Industry depth</span><strong>Where physical operations become the customer promise.</strong></div>
              <ul>{industrySignals.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.signal}</span></li>)}</ul>
              <Link href="/industries" prefetch={false}>Explore industries <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="rh-section rh-product" aria-labelledby="rh-product-title">
          <div className="shell rh-product-grid">
            <div className="rh-product-copy">
              <span>Operations products</span>
              <h2 id="rh-product-title">Consulting judgment made inspectable.</h2>
              <p>The Operations Lab turns Luna Sol methods into transparent browser-based instruments. Assumptions stay visible, calculations remain auditable, and operating validation still matters.</p>
              <dl>
                <div><dt>Executive Operations Studio</dt><dd>Control tower · portfolio · weekly business review</dd></div>
                <div><dt>Implementation Workbench</dt><dd>Launch gates · SOP and RACI · risk closure</dd></div>
                <div><dt>Decision tools</dt><dd>Constraint hypothesis · recovery model · case twin</dd></div>
              </dl>
              <div className="rh-actions"><Link className="rh-button rh-button-dark" href="/tools/executive-operations-studio" prefetch={false}>Open Executive Studio <span aria-hidden="true">→</span></Link><Link className="rh-text-link" href="/tools" prefetch={false}>View product suite <span aria-hidden="true">↗</span></Link></div>
            </div>
            <figure className="rh-product-visual">
              <Link href="/tools/executive-operations-studio" prefetch={false} aria-label="Open the Executive Operations Studio">
                <Image src="/og-operations-studio.png" width={1729} height={910} unoptimized alt="Illustrative Executive Operations Studio interface with capacity, portfolio, and weekly business review modules." sizes="(max-width: 900px) 100vw, 58vw" />
              </Link>
              <figcaption><span>Illustrative product interface</span><small>Use sample data or work locally in your browser.</small></figcaption>
            </figure>
          </div>
        </section>

        <section className="rh-section rh-insights" aria-labelledby="rh-insights-title">
          <div className="shell">
            <header className="rh-section-heading">
              <div><span>Latest thinking</span><h2 id="rh-insights-title">Read the mechanism. Then test the decision.</h2></div>
              <div><p>Operating briefs connect the equation, the evidence sequence, and the decision product that makes the thinking useful.</p><Link className="rh-text-link" href="/insights" prefetch={false}>View all insights <span aria-hidden="true">→</span></Link></div>
            </header>
            <div className="rh-insight-layout">
              <article className="rh-insight-feature">
                <Link className="rh-insight-image" href="/insights/backlog-recovery-planning" prefetch={false} aria-label="Read backlog recovery planning">
                  <Image src="/og-luna-sol-rebuild.png" width={1730} height={909} unoptimized alt="Luna Sol Group operating decision system rendered as a structured signal grid." sizes="(max-width: 760px) 100vw, 60vw" />
                </Link>
                <div><span>Operating brief · 01</span><h3>Backlog recovery planning: capacity is not throughput.</h3><p>Why effective output, variability, and target-miss risk matter more than the average recovery date.</p><Link href="/insights/backlog-recovery-planning" prefetch={false}>Read the operating brief <span aria-hidden="true">→</span></Link></div>
              </article>
              <div className="rh-insight-list">
                {insightLinks.map((item) => (
                  <article key={item.href}>
                    <span>{item.type} · {item.number}</span>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                    <Link href={item.href} prefetch={false} aria-label={`Read ${item.title}`}><span aria-hidden="true">↗</span></Link>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rh-principal" aria-labelledby="rh-principal-title">
          <div className="shell rh-principal-grid">
            <figure>
              <Image
                src="/ryan-miller-stage.png"
                width={800}
                height={800}
                unoptimized
                sizes="(max-width: 760px) 100vw, 36vw"
                alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage."
              />
              <figcaption>Ryan Miller · Founder and Principal</figcaption>
            </figure>
            <div>
              <span>Principal-led by design</span>
              <h2 id="rh-principal-title">Senior judgment stays in the room.</h2>
              <p>Ryan founded Luna Sol after leading transformation inside two of the world&apos;s most demanding physical operating systems. Every engagement is structured around the client&apos;s decision, the evidence required, and the mechanisms operators need after the recommendation is delivered.</p>
              <dl>
                <div><dt>Operating record</dt><dd>Amazon · Walmart</dd></div>
                <div><dt>Advisory work</dt><dd>PSA · HopSkipDrive · Maid of the Mist</dd></div>
                <div><dt>Operating reach</dt><dd>North America · Europe · Japan</dd></div>
              </dl>
              <Link className="rh-text-link rh-text-link-inverse" href="/about/ryan-miller" prefetch={false}>Meet Ryan Miller <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <section className="rh-section rh-contact" id="contact" aria-labelledby="rh-contact-title">
          <div className="shell rh-contact-grid">
            <div>
              <span>Bring one consequential decision</span>
              <h2 id="rh-contact-title">What can the current operating system not resolve?</h2>
              <p>Ryan reviews every inquiry directly. The first conversation defines the decision, the evidence required, and the smallest useful intervention.</p>
              <ol><li><b>01</b> Define the decision</li><li><b>02</b> Size what is at stake</li><li><b>03</b> Select the first useful intervention</li></ol>
            </div>
            <InquiryForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
