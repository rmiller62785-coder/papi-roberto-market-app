import Image from "next/image";
import Link from "next/link";
import { HomeCaseIndex } from "./components/HomeCaseIndex";
import { InquiryForm } from "./components/InquiryForm";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";

const capabilities = [
  { n: "01", title: "Performance transformation", copy: "Stabilize service, throughput, cost, and quality when the visible symptom is not the binding constraint.", items: ["Constraint diagnostics", "Backlog recovery", "Capacity and labor architecture"], href: "/capabilities#performance" },
  { n: "02", title: "Operating model and scale", copy: "Build the workflows, decision rights, controls, and technical requirements required to carry growth safely.", items: ["Target operating model", "Governance and SOP systems", "Compliance-by-design"], href: "/capabilities#operating-model" },
  { n: "03", title: "Transformation execution", copy: "Turn an approved strategy into sequenced work, accountable decisions, and verified operating value.", items: ["Transformation control office", "Portfolio and launch gates", "WBR and benefits control"], href: "/capabilities#execution" },
  { n: "04", title: "Digital operations", copy: "Translate operating mechanisms into practical requirements, decision products, and adoption paths.", items: ["Technical requirements", "AI-enabled workflow design", "Control-tower products"], href: "/capabilities#digital" },
];

const sectors = [
  { title: "Logistics and last mile", copy: "Network capacity, service promise, delivery economics, frontline execution, and recovery systems.", evidence: "Amazon operating record · PSA engagement" },
  { title: "Mobility and transportation", copy: "Dispatch, regulated operations, safety controls, incident response, and multi-market scale.", evidence: "HopSkipDrive engagement" },
  { title: "Consumer and retail", copy: "Complex physical operations where labor, inventory, flow, and customer experience converge.", evidence: "Walmart operating record · Maid of the Mist engagement" },
  { title: "Investor-backed businesses", copy: "Value-creation architecture, management cadence, transformation risk, and executable scale plans.", evidence: "Principal-led operating transformation" },
];

const insights = [
  { type: "Operating brief", title: "Backlog recovery planning", copy: "Why rated capacity is not effective throughput—and why an average recovery date is not a commitment.", href: "/insights/backlog-recovery-planning" },
  { type: "Decision product", title: "Recovery-plan reality check", copy: "Run 1,000 reproducible paths and see P50, P80, P95, target-miss risk, and fragility.", href: "/tools/backlog-recovery-calculator" },
  { type: "Operating brief", title: "Validate the constraint before staffing", copy: "An evidence sequence for testing the mechanism before adding labor or automation.", href: "/insights/validate-constraints-before-staffing" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="consulting-home">
        <section className="consulting-hero">
          <div className="shell consulting-hero-grid">
            <div className="consulting-hero-copy">
              <span className="kicker">Luna Sol Group · Operating transformation</span>
              <h1>Turn operating pressure into <em>durable performance.</em></h1>
              <p>We help executives resolve consequential operating decisions—then build the mechanisms, governance, and implementation path required to make the result hold.</p>
              <div className="consulting-hero-actions"><Link className="button" href="/capabilities" prefetch={false}>Explore capabilities →</Link><Link className="consulting-arrow-link" href="/work" prefetch={false}>See selected work <span>↗</span></Link></div>
            </div>
            <figure className="consulting-hero-portrait">
              <Image src="/ryan-miller-stage.png" width={800} height={800} priority sizes="(max-width: 760px) 100vw, 44vw" alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage." />
              <figcaption><span>Founder-led advisory</span><strong>Ryan Miller, EMBA</strong><small>Former Amazon and Walmart operator · North America, Europe, and Japan</small></figcaption>
            </figure>
          </div>
          <div className="shell consulting-proof-rail">
            <div><strong>$2.5B+</strong><span>annual savings generated</span><small>Prior executive operating role</small></div>
            <div><strong>$550M+</strong><span>delivery losses eliminated</span><small>Prior executive operating role</small></div>
            <div><strong>$300M</strong><span>capital program directed</span><small>Prior executive operating role</small></div>
            <div><strong>35%</strong><span>operational defect reduction</span><small>Prior executive operating role</small></div>
          </div>
          <p className="shell consulting-proof-boundary">Prior-role outcomes are not presented as Luna Sol client results or solely attributable individual outcomes.</p>
        </section>

        <section className="consulting-thesis">
          <div className="shell consulting-thesis-grid"><span>Our point of view</span><h2>The recommendation is not the deliverable. <em>The operating system is.</em></h2><div><p>At the moments that matter, leaders do not need more activity. They need a fact base they can trust, the constraint that explains performance, and a system their operators can run when pressure returns.</p><Link className="consulting-arrow-link" href="/approach" prefetch={false}>How Luna Sol works <span>↗</span></Link></div></div>
        </section>

        <section className="section consulting-capabilities" id="capabilities">
          <div className="shell"><header className="consulting-section-head"><div><span>Capabilities</span><h2>Where we create value.</h2></div><p>Focused operating expertise for companies navigating recovery, scale, complexity, or transformation.</p><Link href="/capabilities" prefetch={false}>View all capabilities →</Link></header><div className="consulting-capability-grid">{capabilities.map((item) => <article id={item.href.split("#")[1]} key={item.n}><span>{item.n}</span><h3>{item.title}</h3><p>{item.copy}</p><ul>{item.items.map((entry) => <li key={entry}>{entry}</li>)}</ul><Link href={item.href} prefetch={false} aria-label={`Explore ${item.title}`}>Explore <b>↗</b></Link></article>)}</div></div>
        </section>

        <section className="section consulting-sectors">
          <div className="shell consulting-sectors-grid"><div className="consulting-sectors-intro"><span>Industry depth</span><h2>Built where physical operations meet customer promise.</h2><p>Luna Sol brings an operator’s view to environments where network, labor, technology, regulation, and service economics must work as one system.</p><Link className="button button-light" href="/industries" prefetch={false}>Explore industries →</Link></div><div className="consulting-sector-list">{sectors.map((sector, index) => <article key={sector.title}><b>{String(index + 1).padStart(2, "0")}</b><div><h3>{sector.title}</h3><p>{sector.copy}</p><small>{sector.evidence}</small></div></article>)}</div></div>
        </section>

        <HomeCaseIndex />

        <section className="section consulting-product-feature">
          <div className="shell consulting-product-grid"><div><span>Decision products</span><h2>Consulting judgment you can use before the first call.</h2><p>The Operations Lab turns Luna Sol methods into transparent, browser-based instruments—no black box, no signup, and no claim that a model replaces operating evidence.</p><div className="consulting-product-actions"><Link className="button" href="/tools" prefetch={false}>Enter the Operations Lab →</Link><Link className="consulting-arrow-link" href="/tools/backlog-recovery-calculator" prefetch={false}>Test a recovery plan <span>↗</span></Link></div></div><div className="consulting-product-console" aria-label="Sample recovery-risk output"><header><span>Recovery-plan reality check</span><b>LUNA-BRM-3.0</b></header><div className="consulting-product-status"><span>Decision</span><strong>Will the plan survive operating variability?</strong><i>Thin margin</i></div><dl><div><dt>Median · P50</dt><dd>8 wk</dd></div><div><dt>Four-in-five · P80</dt><dd>10 wk</dd></div><div><dt>Conservative · P95</dt><dd>12 wk</dd></div><div><dt>Miss target</dt><dd>35.1%</dd></div></dl><div className="consulting-product-fan"><span /><span /><span /><span /><span /><span /><span /><span /></div><footer>1,000 reproducible trials · assumptions exposed · data stays local</footer></div></div>
        </section>

        <section className="section consulting-insights">
          <div className="shell"><header className="consulting-section-head"><div><span>Latest thinking</span><h2>Ideas built to be challenged.</h2></div><p>Technical briefs and working models that expose the equation, the evidence sequence, and the point where executive judgment begins.</p><Link href="/insights" prefetch={false}>View all insights →</Link></header><div className="consulting-insight-grid">{insights.map((item, index) => <article key={item.href}><span>{item.type} · 0{index + 1}</span><h3>{item.title}</h3><p>{item.copy}</p><Link href={item.href} prefetch={false}>Read and apply <b>↗</b></Link></article>)}</div></div>
        </section>

        <section className="consulting-principal">
          <div className="shell consulting-principal-grid"><figure><Image src="/ryan-miller-stage.png" width={800} height={800} sizes="(max-width: 760px) 100vw, 45vw" alt="Ryan Miller speaking to an audience." /></figure><div><span>Speak with the principal</span><h2>Senior judgment stays in the room.</h2><p>Ryan Miller founded Luna Sol after leading transformation inside two of the world’s most demanding physical networks. Every engagement is principal-led, evidence-aware, and designed around the client’s operating decision—not a junior delivery pyramid.</p><dl><div><dt>Operating record</dt><dd>Amazon · Walmart</dd></div><div><dt>Advisory work</dt><dd>PSA · HopSkipDrive · Maid of the Mist</dd></div><div><dt>Engagement posture</dt><dd>Confidential · Embedded when required</dd></div></dl><Link className="button button-light" href="/about" prefetch={false}>Meet Ryan Miller →</Link></div></div>
        </section>

        <section className="section consulting-contact" id="contact"><div className="shell contact-grid"><div className="contact-copy"><span className="section-label light">Bring one consequential decision</span><h2>What can the current operating system not resolve?</h2><p>Ryan reviews every inquiry directly. The first conversation defines the decision, the evidence required, and the smallest useful intervention.</p><div className="contact-points"><span><i>01</i> Define the decision</span><span><i>02</i> Size what is at stake</span><span><i>03</i> Select the first useful intervention</span></div></div><InquiryForm /></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
