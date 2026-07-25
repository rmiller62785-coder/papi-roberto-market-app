import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Amazon: Prior Operating Experience",
  description: "Ryan Miller's prior operating experience leading global last-mile transformation at Amazon—not a Luna Sol Group client engagement.",
  alternates: { canonical: "/experience/amazon" },
  robots: { index: true, follow: true },
};

const chapters = [
  {
    label: "Global delivery economics",
    title: "A quality failure reframed as a network-value problem.",
    metric: "$25M",
    metricLabel: "validated annual cost avoidance",
    body: "A legacy labor model under-allocated pre-route and post-route work. Dispatch slipped, rescue activity increased, and driver retention suffered—yet the issue continued to be treated as field execution rather than a planning defect.",
    outputs: [
      "Time-motion studies across 15+ station archetypes",
      "A financial bridge linking planning error to dispatch, defects, rescue cost, and retention",
      "The business case rebuilt through three ownership transitions",
      "VP-level approval and embedding into the standing planning cycle",
    ],
    stats: [
      { value: "$25M", label: "annual cost avoidance" },
      { value: "1,000+", label: "stations affected" },
      { value: "5%", label: "YoY defect reduction" },
    ],
  },
  {
    label: "Measurement integrity",
    title: "A 44% reporting gap exposed and corrected.",
    metric: "1,200 bps",
    metricLabel: "hidden degradation quantified",
    body: "A removed accountability metric and blanket exemptions had created a 44% gap between reported and actual execution. Leadership was making network allocation decisions on distorted signals without knowing it.",
    outputs: [
      "Audited completion, quality, compliance, exemption, and classification logic",
      "Quantified a 1,200 bps hidden degradation between reported and actual performance",
      "Designed tiered weather governance and corrected measurement logic",
      "Rebuilt trust directly with delivery partners after the correction",
    ],
    stats: [
      { value: "817 bps", label: "performance recovered" },
      { value: "$1M+", label: "annual cost protected" },
      { value: "18M+", label: "packages reclassified" },
    ],
  },
  {
    label: "Peak surge readiness",
    title: "Record volume absorbed without incremental headcount.",
    metric: "92%+",
    metricLabel: "service compliance",
    body: "A historic fleet transition, weather volatility, record volume, and a headcount freeze created a peak-season problem that could not be solved by adding analysts or managers.",
    outputs: [
      "Built AI-assisted defect attribution and executive reporting",
      "Separated structural root causes from behavioral execution gaps",
      "Targeted coaching across 290 delivery partners",
      "Hardened routing, fleet, and weather governance for the following peak",
    ],
    stats: [
      { value: "92%+", label: "service compliance" },
      { value: "1,923 bps", label: "routing improvement" },
      { value: "33→ 95%+", label: "field engagement" },
    ],
  },
];

export default function AmazonExperiencePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">Prior operating experience &middot; Not a Luna Sol client engagement</span>
            <h1>Global last-mile transformation at <em>Amazon scale.</em></h1>
            <p>
              Before founding Luna Sol, Ryan led operating-system, delivery-partner, capacity, and network-economics
              work across North America, Europe, and Japan. The three retrospectives below describe that prior
              executive operating experience&mdash;they are not Luna Sol Group client work, and the figures are not
              attributable to Luna Sol&rsquo;s advisory practice.
            </p>
            <div className="diagnostic-facts">
              <span className="diagnostic-facts-logo"><Image src="/amazon-logo.svg" width={90} height={27} alt="Amazon logo" /></span>
              <span><strong>NA &middot; EU &middot; JP</strong> Operating regions</span>
              <span><strong>DSP 2.0</strong> Co-developed partner-model redesign</span>
            </div>
          </div>
        </section>

        <section className="section paper">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-label">Prior executive retrospectives</span>
                <h2>Three operating problems.<br />Three durable corrections.</h2>
              </div>
              <p>Each retrospective follows the same structure Luna Sol uses today: the operating reality, what was actually done, and the measurable result.</p>
            </div>
            <div className="capability-grid">
              {chapters.map((chapter) => (
                <article className="capability" key={chapter.label}>
                  <span className="capability-number">{chapter.metric}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.body}</p>
                  <ul>{chapter.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
                </article>
              ))}
            </div>
            <div className="portfolio-outcomes" aria-label="Retrospective metrics">
              {chapters.flatMap((chapter) => chapter.stats).map((stat) => (
                <article key={`${stat.value}-${stat.label}`}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>
            <p className="portfolio-disclaimer">
              These retrospectives describe Ryan Miller&rsquo;s prior employment at Amazon, not a Luna Sol Group
              engagement. Figures are anonymized where appropriate and reflect the collaborative work of Amazon
              operating teams and leadership, not solely Ryan&rsquo;s individual contribution. Amazon is referenced
              for prior-experience context only; all marks belong to their respective owners.
            </p>
          </div>
        </section>

        <section className="section principal-section">
          <div className="shell principal-grid">
            <div className="principal-card">
              <div className="principal-monogram">RM</div>
              <dl>
                <div><dt>Role</dt><dd>Global last-mile executive operator</dd></div>
                <div><dt>Benchmark</dt><dd>103.8 TPH manual-sortation benchmark</dd></div>
                <div><dt>Program</dt><dd>DSP 2.0 partner-model redesign, co-developed</dd></div>
              </dl>
            </div>
            <div className="principal-copy">
              <span className="section-label">Why this page exists</span>
              <h2>Operator credibility, kept separate from client claims.</h2>
              <p className="principal-lead">The three flagship engagements on the homepage are Luna Sol client work. This page is background&mdash;the operating pedigree behind the method, not a fourth case study.</p>
              <p>Luna Sol keeps these deliberately distinct: a prospective client should never have to guess whether a number on this site came from a paid engagement or from Ryan&rsquo;s own career history.</p>
              <Link className="text-link dark" href="/#featured-work">See the three Luna Sol client engagements &rarr;</Link>
            </div>
          </div>
        </section>

        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">Continue exploring</span>
            <div className="after-grid">
              <div><b>01</b><h3>Featured work</h3><p>Three complete, evidence-backed Luna Sol client case studies.</p><Link href="/#featured-work">Back to featured work &rarr;</Link></div>
              <div><b>02</b><h3>Executive Operations Studio</h3><p>Use the control-tower, portfolio, and WBR mechanisms built from this operating experience.</p><Link href="/tools/executive-operations-studio">Open the working studio &rarr;</Link></div>
              <div><b>03</b><h3>Start a conversation</h3><p>Bring the operating problem your dashboards cannot explain.</p><Link href="/#contact">Contact Luna Sol &rarr;</Link></div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
