import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import "./styles/rebuild-v2.css";

const storyCards = [
  {
    label: "Grading and collectibles",
    title: "Stabilizing a record operating backlog",
    href: "/work/psa",
    image: "/psa-timeline.png",
    alt: "PSA public backlog timeline showing the 2026 demand shock and recovery arc.",
    position: "50% 8%",
  },
  {
    label: "Tourism and guest operations",
    title: "Turning guest-flow evidence into a planning capability",
    href: "/work/maid-of-the-mist",
    image: "/maid-of-the-mist-2026.jpg",
    alt: "Maid of the Mist electric vessels operating near Niagara Falls.",
    position: "50% 48%",
  },
  {
    label: "Operations product",
    title: "A control system for decisions, risk, and implementation",
    href: "/tools/executive-operations-studio",
    image: "/og-operations-studio.png",
    alt: "Executive Operations Studio interface showing capacity, risk, and portfolio controls.",
    position: "50% 50%",
  },
  {
    label: "Operating brief",
    title: "Why capacity is not the same as throughput",
    href: "/insights/backlog-recovery-planning",
    image: "/og-evidence-room.jpg",
    alt: "A structured operating evidence room for testing a recovery decision.",
    position: "50% 50%",
  },
];

const capabilities = [
  {
    number: "01",
    title: "Performance transformation",
    copy: "Resolve the mechanism behind unstable service, cost, quality, capacity, or throughput.",
    href: "/capabilities/performance-transformation",
  },
  {
    number: "02",
    title: "Operating model and scale",
    copy: "Align workflows, decision rights, governance, and control before growth compounds risk.",
    href: "/capabilities/operating-model-and-scale",
  },
  {
    number: "03",
    title: "Transformation execution",
    copy: "Move strategy through accountable gates to operating adoption and realized value.",
    href: "/capabilities/transformation-execution",
  },
  {
    number: "04",
    title: "Digital operations",
    copy: "Turn operating requirements into practical workflows, controls, and decision products.",
    href: "/capabilities/digital-operations",
  },
];

const operatingRecord = [
  { value: "$2.5B+", label: "Annual savings generated" },
  { value: "$550M+", label: "Delivery losses eliminated" },
  { value: "$300M", label: "Capital program directed" },
  { value: "35%", label: "Operational defect reduction" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="ls2-home">
        <section className="ls2-hero" aria-labelledby="ls2-hero-title">
          <div className="ls2-hero-pattern" aria-hidden="true"><i /><i /><i /></div>
          <div className="shell ls2-hero-lead">
            <div className="ls2-hero-copy">
              <span>Operator-led transformation</span>
              <h1 id="ls2-hero-title">Operations that hold <em>under pressure.</em></h1>
              <p>Luna Sol helps leaders make consequential operating decisions—and build the systems that sustain them.</p>
              <div className="ls2-actions">
                <Link className="ls2-button ls2-button-light" href="/capabilities" prefetch={false}>How we help <b aria-hidden="true">→</b></Link>
                <Link className="ls2-inline-link ls2-inline-light" href="/work" prefetch={false}>Selected work <span aria-hidden="true">↗</span></Link>
              </div>
            </div>

            <article className="ls2-feature">
              <Link className="ls2-feature-image" href="/work/hopskipdrive" prefetch={false} aria-label="Read the HopSkipDrive case study">
                <Image src="/hopskipdrive-expansion.jpg" alt="HopSkipDrive CareDriver seated in a vehicle." fill priority unoptimized sizes="(max-width: 860px) 100vw, 42vw" />
              </Link>
              <div className="ls2-feature-body">
                <span>Mobility and transportation · Case study</span>
                <h2><Link href="/work/hopskipdrive" prefetch={false}>Operating architecture for regulated national scale</Link></h2>
                <p>Dispatch, compliance, SOPs, risk, governance, and technical requirements designed as one system across a 30+ metro footprint.</p>
                <div><small>Luna Sol engagement · 2026</small><Link href="/work/hopskipdrive" prefetch={false} aria-label="Open HopSkipDrive case study">→</Link></div>
              </div>
            </article>
          </div>

          <div className="shell ls2-story-rail" aria-label="Featured perspectives and work">
            {storyCards.map((card) => (
              <article key={card.href}>
                <Link className="ls2-story-image" href={card.href} prefetch={false} aria-label={`Open ${card.title}`}>
                  <Image src={card.image} alt={card.alt} fill unoptimized sizes="(max-width: 680px) 82vw, 24vw" style={{ objectPosition: card.position }} />
                </Link>
                <div><span>{card.label}</span><h3><Link href={card.href} prefetch={false}>{card.title}</Link></h3></div>
              </article>
            ))}
          </div>
        </section>

        <section className="ls2-moment" aria-labelledby="ls2-moment-title">
          <div className="shell ls2-moment-grid">
            <figure>
              <Link href="/tools/executive-operations-studio" prefetch={false} aria-label="Open the Executive Operations Studio">
                <Image src="/og-operations-studio.png" width={1729} height={910} unoptimized alt="Executive Operations Studio interface showing capacity, portfolio, and weekly operating review." />
                <span aria-hidden="true">Open the operating system →</span>
              </Link>
              <figcaption>Executive Operations Studio · Working product</figcaption>
            </figure>
            <div>
              <span>From recommendation to operating control</span>
              <h2 id="ls2-moment-title">The work should still work after the advisor leaves.</h2>
              <p>Luna Sol combines senior operating judgment, evidence-led diagnosis, and practical decision products. The result is not a deck at the edge of the business—it is a mechanism the business can run.</p>
              <Link className="ls2-button ls2-button-green" href="/approach" prefetch={false}>See how Luna Sol works <b aria-hidden="true">→</b></Link>
            </div>
          </div>
        </section>

        <section className="ls2-help" aria-labelledby="ls2-help-title">
          <div className="shell">
            <header className="ls2-section-head">
              <div><span>Capabilities</span><h2 id="ls2-help-title">Create operating value where the system is breaking.</h2></div>
              <div><p>Start with the executive decision, the constraint, and what is at stake—not a prepackaged workstream.</p><Link className="ls2-inline-link" href="/capabilities" prefetch={false}>Explore all capabilities <span aria-hidden="true">→</span></Link></div>
            </header>
            <div className="ls2-capability-list">
              {capabilities.map((item) => (
                <Link href={item.href} key={item.number} prefetch={false}>
                  <small>{item.number}</small><h3>{item.title}</h3><p>{item.copy}</p><span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
            <div className="ls2-industry-line">
              <strong>Industry depth</strong>
              <span>Logistics &amp; last mile</span><span>Mobility &amp; transportation</span><span>Consumer &amp; retail</span><span>Investor-backed operations</span>
              <Link href="/industries" prefetch={false}>Explore industries →</Link>
            </div>
          </div>
        </section>

        <section className="ls2-numbers" aria-labelledby="ls2-numbers-title">
          <div className="shell">
            <div className="ls2-numbers-intro"><span>Operating experience</span><h2 id="ls2-numbers-title">Built inside the work.</h2><p>Selected outcomes from Ryan Miller&apos;s prior executive operating roles, shown separately from Luna Sol client engagements.</p></div>
            <div className="ls2-number-grid">
              {operatingRecord.map((item) => <article key={item.value}><strong>{item.value}</strong><span>{item.label}</span><small>Prior executive operating role</small></article>)}
            </div>
            <p className="ls2-claim-note">Prior-role outcomes reflect the work of operating teams and are not presented as Luna Sol client results or solely attributable individual outcomes.</p>
          </div>
        </section>

        <section className="ls2-principal" aria-labelledby="ls2-principal-title">
          <div className="shell ls2-principal-grid">
            <div>
              <span>Founder and principal</span>
              <h2 id="ls2-principal-title">Senior judgment stays close to the decision.</h2>
              <p>Ryan Miller founded Luna Sol after leading transformation inside Amazon and Walmart operating systems across North America, Europe, and Japan. He remains directly involved from diagnosis through implementation.</p>
              <Link className="ls2-button ls2-button-green" href="/about/ryan-miller" prefetch={false}>Meet Ryan Miller <b aria-hidden="true">→</b></Link>
            </div>
            <figure><Image src="/ryan-miller-stage.png" width={800} height={800} unoptimized alt="Ryan Miller, founder and principal of Luna Sol Group, speaking on stage." /><figcaption>Ryan Miller · Founder and Principal</figcaption></figure>
          </div>
        </section>

        <section className="ls2-contact" aria-labelledby="ls2-contact-title">
          <div className="shell">
            <span>Start with the operating decision</span>
            <h2 id="ls2-contact-title">What needs to hold that does not hold today?</h2>
            <p>Bring the commitment, the evidence you trust, and the consequence of getting it wrong.</p>
            <Link className="ls2-button ls2-button-light" href="/contact" prefetch={false}>Get in touch <b aria-hidden="true">→</b></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
