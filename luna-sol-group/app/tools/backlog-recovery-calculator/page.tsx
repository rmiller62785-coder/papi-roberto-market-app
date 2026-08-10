import type { Metadata } from "next";
import Link from "next/link";
import { BacklogCalculator } from "../../components/BacklogCalculator";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

const siteUrl = "https://luna-sol-group.rmiller62785.chatgpt.site";
const toolPath = "/tools/backlog-recovery-calculator";

const frequentlyAskedQuestions = [
  {
    question: "How does the backlog recovery model calculate effective throughput?",
    answer:
      "Rated capacity is adjusted for realized utilization, planned productivity gain, rework loss, and a disclosed aging-work drag, then surge capacity is added. Weekly inbound demand is subtracted from that effective throughput to calculate net backlog burn.",
  },
  {
    question: "Why does the calculator show a sensitivity range?",
    answer:
      "The range applies plus or minus 12 percent variation to modeled effective throughput before weekly inbound is subtracted. It is a transparent stress test for execution variance, not a statistical confidence interval or forecast.",
  },
  {
    question: "What does 'No recovery' mean?",
    answer:
      "It means the assumptions provided do not create positive net backlog burn: effective weekly throughput does not exceed weekly inbound demand. The operating question then shifts from timing to constraint removal, capacity design, or demand control.",
  },
  {
    question: "When should this model not be used on its own?",
    answer:
      "Do not use it as a substitute for direct observation, validated operating data, workforce planning, demand forecasting, financial approval, or safety and compliance review. Use it to make assumptions explicit and identify the next decision to validate.",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Backlog Recovery Calculator",
    description:
      "A free deterministic queue-flow scenario model for testing demand, effective capacity, quality loss, surge options, and time to a controlled backlog.",
    url: `${siteUrl}${toolPath}`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any modern web browser",
    browserRequirements: "JavaScript enabled",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Person",
      name: "Ryan Miller",
      jobTitle: "Founder and Principal",
      worksFor: { "@type": "Organization", name: "Luna Sol Group" },
    },
    featureList: [
      "Net backlog burn calculation",
      "Weeks-to-threshold estimate",
      "Required-throughput calculation",
      "Capacity-gap analysis",
      "Throughput sensitivity range",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Operations Lab", item: `${siteUrl}/tools` },
      { "@type": "ListItem", position: 3, name: "Backlog Recovery Calculator", item: `${siteUrl}${toolPath}` },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: frequentlyAskedQuestions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  },
];

export const metadata: Metadata = {
  title: "Backlog Recovery Calculator | Queue Capacity & Time-to-Target Model",
  description:
    "Model backlog burn, required throughput, capacity gaps, and time to a controlled queue. A free, transparent scenario calculator for operations leaders.",
  alternates: { canonical: toolPath },
  openGraph: {
    title: "Backlog Recovery Calculator",
    description: "Turn demand, capacity, quality loss, and recovery timing into a testable operating decision.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Luna Sol Group backlog recovery calculator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Backlog Recovery Calculator",
    description: "Turn demand, capacity, quality loss, and recovery timing into a testable operating decision.",
    images: ["/og.png"],
  },
};

export default function BacklogRecoveryCalculatorPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {structuredData.map((entry, index) => (
          <script
            key={index}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
          />
        ))}

        <section className="subpage-hero diagnostic-hero calculator-product-hero">
          <div className="shell narrow-shell">
            <nav className="case-route calculator-breadcrumb" aria-label="Breadcrumb">
              <Link href="/" prefetch={false}>Home</Link><span aria-hidden="true">/</span>
              <Link href="/tools" prefetch={false}>Operations Lab</Link><span aria-hidden="true">/</span>
              <b>Backlog Recovery Calculator</b>
            </nav>
            <span className="kicker">Operations Lab · Deterministic queue-flow model</span>
            <h1>Turn a visible backlog into a <em>testable recovery decision.</em></h1>
            <p>
              Model demand, effective capacity, quality loss, aging work, surge options, and target timing. The
              calculator shows whether the queue can recover, what throughput the commitment requires, and where
              the operating plan still has a capacity gap.
            </p>
            <div className="diagnostic-facts">
              <span><strong>10</strong> Adjustable operating inputs</span>
              <span><strong>4</strong> Decision-ready outputs</span>
              <span><strong>0</strong> Data stored unless submitted</span>
            </div>
          </div>
        </section>

        <section className="section paper diagnostic-page-section calculator-model-section" aria-labelledby="calculator-model-heading">
          <div className="shell">
            <header className="calculator-section-intro">
              <span className="section-label">Build the operating case</span>
              <h2 id="calculator-model-heading">Describe the queue. Test the path to control.</h2>
              <p>Start with the example, replace each assumption with observed operating data, then use the result to frame the next decision—not to bypass validation.</p>
            </header>
            <BacklogCalculator />
          </div>
        </section>

        <section className="section diagnostic-after calculator-proof-section" aria-labelledby="calculator-proof-heading">
          <div className="shell narrow-shell">
            <span className="section-label light">Evidence-aware, not evidence-substituting</span>
            <h2 id="calculator-proof-heading" className="calculator-section-title">Built from an operating engagement. Bounded by what public evidence can prove.</h2>
            <p className="calculator-section-lead">
              The model generalizes recovery mechanics used during Ryan Miller&rsquo;s 2026 PSA advisory engagement.
              Public reporting documented a queue near 14 million units in mid-June and PSA&rsquo;s official July 14
              update reported 11 million. Those checkpoints demonstrate the operating context; they do not prove
              that Luna Sol alone produced PSA&rsquo;s recovery.
            </p>
            <div className="after-grid calculator-proof-grid">
              <div>
                <b>01 · Source</b>
                <h3>Official operating checkpoint</h3>
                <p>PSA&rsquo;s management-reviewed tracker is the primary source for its published backlog, throughput, quality, and capacity updates.</p>
                <a className="text-link" href="https://www.psacard.com/info/backlog-tracker" target="_blank" rel="noreferrer">Open the PSA tracker ↗</a>
              </div>
              <div>
                <b>02 · Corroboration</b>
                <h3>Dated external reporting</h3>
                <p>Sports Illustrated reported the July 14 checkpoint of 11 million units and June output exceeding May by 10%.</p>
                <a className="text-link" href="https://www.si.com/collectibles/psa-bi-weekly-update-shows-11-million-cards-still-backlogged" target="_blank" rel="noreferrer">Read the reporting ↗</a>
              </div>
              <div>
                <b>03 · Attribution</b>
                <h3>Operating results are collaborative</h3>
                <p>Published outcomes reflect PSA leadership and operating teams. This tool contains no confidential PSA data and makes no sole-attribution claim.</p>
                <Link className="text-link" href="/work/psa" prefetch={false}>Review the evidence room →</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section paper calculator-method-section" aria-labelledby="calculator-method-heading">
          <div className="shell case-two-column">
            <div className="sticky-intro">
              <span className="section-label">Methodology</span>
              <h2 id="calculator-method-heading">Transparent math before executive judgment.</h2>
            </div>
            <div className="case-prose calculator-method-copy">
              <p className="case-lead">The calculator is designed to expose the few assumptions that determine whether a queue shrinks, stalls, or grows.</p>
              <h3>1. Establish effective weekly throughput</h3>
              <p>Rated capacity is adjusted by realized utilization and the planned productivity gain, then reduced for rework. The aging factor applies an 8% maximum drag in proportion to the aged-work mix: a 50% aged mix produces a 4% throughput drag. Any temporary surge capacity is added last. This creates an effective-throughput estimate rather than treating theoretical capacity as available output.</p>
              <h3>2. Compare output with incoming demand</h3>
              <p>Weekly inbound is subtracted from effective throughput. A positive difference is net backlog burn. A zero or negative result means there is no modeled recovery at the current assumptions, regardless of the target date.</p>
              <h3>3. Test the commitment</h3>
              <p>The model calculates the throughput required to move from the current queue to the control threshold within the selected window. Any difference between required and effective throughput becomes the capacity gap leadership must fund, remove, or renegotiate.</p>
              <h3>4. Stress the execution case</h3>
              <p>The sensitivity range varies modeled effective throughput by ±12% before inbound demand is subtracted. It is a planning tolerance—not a confidence interval—used to show how ordinary execution variance can change the target date.</p>
              <div className="mandate-box calculator-boundary-box">
                <span>Trust boundary</span>
                <p><strong>This is a deterministic scenario model, not a forecast or optimization engine.</strong> Validate demand patterns, process constraints, staffing feasibility, quality controls, financial assumptions, and safety or compliance implications before acting.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section diagnostic-after calculator-output-section" aria-labelledby="calculator-output-heading">
          <div className="shell narrow-shell">
            <span className="section-label light">What the product produces</span>
            <h2 id="calculator-output-heading" className="calculator-section-title">Four outputs that move a recovery discussion forward.</h2>
            <div className="after-grid calculator-output-grid">
              <div><b>01</b><h3>Recovery viability</h3><p>Whether the modeled queue is controlled, recovering, stalled, or growing at the assumptions provided.</p></div>
              <div><b>02</b><h3>Target commitment</h3><p>Weeks to the control threshold and the effective throughput required to hit leadership&rsquo;s selected window.</p></div>
              <div><b>03</b><h3>Escalation case</h3><p>The remaining weekly capacity gap and a sensitivity range that make tradeoffs explicit before a promise is made.</p></div>
            </div>
            <div className="calculator-decision-cta">
              <div>
                <span>When the answer is “no recovery”</span>
                <h3>Do not negotiate the date before identifying the constraint.</h3>
                <p>Use the hypothesis map to determine which operating mechanism deserves evidence first. If the recovery path crosses functions, governance, or material financial risk, Ryan can translate the scenario into an implementation plan.</p>
              </div>
              <div className="calculator-decision-actions">
                <Link className="button" href="/tools/constraint-diagnostic" prefetch={false}>Diagnose the constraint →</Link>
                <Link className="text-link" href="/#contact" prefetch={false}>Discuss the operating decision</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="section paper calculator-faq-section" aria-labelledby="calculator-faq-heading">
          <div className="shell narrow-shell">
            <div className="calculator-faq-heading">
              <span className="section-label">Model questions</span>
              <h2 id="calculator-faq-heading">How to interpret the result.</h2>
            </div>
            <div className="calculator-faq-list">
              {frequentlyAskedQuestions.map((item, index) => (
                <details key={item.question} open={index === 0}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="section diagnostic-after calculator-principal-section" aria-labelledby="calculator-principal-heading">
          <div className="shell narrow-shell calculator-principal-card">
            <div>
              <span className="section-label light">The operator behind the model</span>
              <h2 id="calculator-principal-heading">Ryan Miller, EMBA</h2>
              <p>Founder and Principal of Luna Sol Group. Ryan&rsquo;s work spans last-mile transformation, capacity planning, network operations, customer experience, and large-scale frontline execution. This calculator makes that operating lens inspectable before a conversation begins.</p>
            </div>
            <div className="calculator-principal-action">
              <strong>A specific exchange, not a generic lead form.</strong>
              <p>Send the scenario above and Ryan will reply with 2–3 operating observations within one business day—no deck and no pitch.</p>
              <a className="text-link" href="https://www.linkedin.com/in/ryan-miller-90b1181aa/" target="_blank" rel="noreferrer">View Ryan&rsquo;s LinkedIn profile ↗</a>
            </div>
          </div>
        </section>

        <section className="section diagnostic-after calculator-route-section">
          <div className="shell narrow-shell calculator-route-links" aria-label="Related resources">
            <Link href="/work/psa" prefetch={false}>See the case-specific PSA application <span aria-hidden="true">→</span></Link>
            <Link href="/tools" prefetch={false}>Return to the Operations Lab <span aria-hidden="true">→</span></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
