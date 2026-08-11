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
      "The transparent range applies plus or minus 12 percent variation to effective throughput before inbound is subtracted. The separate recovery-risk view runs 1,000 reproducible weekly scenarios at low, moderate, or high operating volatility and reports P50, P80, and P95 timing plus target-miss risk. Neither is a fitted forecast or confidence interval.",
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
      "P50, P80, and P95 recovery-risk simulation",
      "Fragility and margin-of-safety diagnostic",
      "Required-throughput calculation",
      "Capacity-gap analysis",
      "Recovery-risk fan chart",
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
    "Test whether a backlog recovery plan survives operating variability. Model P50, P80, and P95 timing, fragility, margin of safety, and target-miss risk.",
  alternates: { canonical: toolPath },
  openGraph: {
    title: "Backlog Recovery Calculator",
    description: "Find out whether the recovery plan survives contact with operating reality.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Luna Sol Group backlog recovery calculator" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Backlog Recovery Calculator",
    description: "Find out whether the recovery plan survives contact with operating reality.",
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
            <span className="kicker">Operations Lab · Recovery-risk instrument</span>
            <h1>Will the recovery plan survive <em>contact with reality?</em></h1>
            <p>
              Average arithmetic can make a fragile plan look certain. Model the queue, add real operating variability,
              and see median timing, four-in-five timing, conservative timing, target-miss risk, and the throughput
              shortfall that stalls recovery entirely.
            </p>
            <div className="diagnostic-facts">
              <span><strong>1,000</strong> Reproducible weekly trials</span>
              <span><strong>P50–P95</strong> Recovery timing</span>
              <span><strong>0</strong> Data stored unless submitted</span>
            </div>
          </div>
        </section>

        <section className="section paper diagnostic-page-section calculator-model-section" aria-labelledby="calculator-model-heading">
          <div className="shell">
            <header className="calculator-section-intro">
              <span className="section-label">Build the operating case</span>
              <h2 id="calculator-model-heading">Test the promise—not just the arithmetic.</h2>
              <p>Replace the example with observed operating data, select how volatile the operation really is, and compare leadership&rsquo;s target with the distribution of plausible recovery paths.</p>
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
              <p>The sensitivity range varies effective throughput by ±12% before inbound demand is subtracted. The recovery-risk view then runs 1,000 reproducible weekly trials with independent variation around demand and output, reporting P50, P80, P95, and target-miss risk.</p>
              <h3>5. Read the fragility—not only the date</h3>
              <p>Margin of safety equals net burn divided by effective output. The inverse operating problem is the amplification factor: effective output divided by net burn. When the margin is thin, a routine percentage change in output creates a much larger percentage change in backlog burn.</p>
              <h3>6. Treat high utilization as a warning, not a free multiplier</h3>
              <p>The input model uses utilization as a transparent throughput multiplier, but real queues become nonlinear near saturation: variability and waiting time rise sharply as utilization approaches 100%. The model does not implement Kingman&rsquo;s approximation or a service-time distribution, so high-utilization scenarios require direct queueing analysis before commitment.</p>
              <div className="mandate-box calculator-boundary-box">
                <span>Trust boundary</span>
                <p><strong>This is a transparent scenario distribution, not a fitted forecast or optimization engine.</strong> It does not learn from historical data or model correlation, seasonality, service times, congestion, or structural breaks. Validate those mechanisms before acting.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section diagnostic-after calculator-output-section" aria-labelledby="calculator-output-heading">
          <div className="shell narrow-shell">
            <span className="section-label light">What the product produces</span>
            <h2 id="calculator-output-heading" className="calculator-section-title">The date, the odds, and the point where the plan breaks.</h2>
            <div className="after-grid calculator-output-grid">
              <div><b>01</b><h3>Risk-adjusted timing</h3><p>P50, P80, and P95 recovery timing plus the share of simulated paths that miss leadership&rsquo;s target window.</p></div>
              <div><b>02</b><h3>Fragility</h3><p>Margin of safety, net-burn amplification, and the throughput shortfall that stalls recovery completely.</p></div>
              <div><b>03</b><h3>Decision gap</h3><p>The effective and rated capacity required to turn the target from a hope into a controlled operating path.</p></div>
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

        <section className="section paper calculator-offer-section" aria-labelledby="calculator-offer-heading">
          <div className="shell narrow-shell calculator-offer-grid">
            <div className="calculator-offer-intro">
              <span className="section-label">Fixed-scope entry engagement</span>
              <h2 id="calculator-offer-heading">Two-week Backlog Reality Check.</h2>
              <p>
                Move from a browser scenario to an evidence-backed operating decision. Ryan validates the queue definition,
                tests the recovery assumptions against operating evidence, and converts the result into an accountable action path.
              </p>
            </div>
            <div>
              <div className="calculator-offer-deliverables">
                <article><b>01</b><div><h3>Validate the operating baseline</h3><p>Reconcile intake, demonstrated output, yield loss, aging, and the control threshold with the people and data closest to the work.</p></div></article>
                <article><b>02</b><div><h3>Identify the three binding constraints</h3><p>Separate symptoms from mechanisms and define the evidence, falsifier, owner, and decision attached to each leading constraint.</p></div></article>
                <article><b>03</b><div><h3>Sequence the recovery decision</h3><p>Deliver a practical action plan with scenario ranges, leading indicators, governance cadence, and the first implementation gates.</p></div></article>
              </div>
              <div className="calculator-offer-terms" aria-label="Engagement characteristics">
                <div><span>Working window</span><strong>Two focused weeks</strong></div>
                <div><span>Delivery model</span><strong>Principal-led</strong></div>
                <div><span>Commercial boundary</span><strong>Fixed fee agreed before kickoff</strong></div>
              </div>
              <div className="calculator-offer-action">
                <Link className="button" href="/#contact" prefetch={false}>Request current scope and fee →</Link>
                <Link className="text-link" href="/approach" prefetch={false}>See how evidence becomes a decision</Link>
                <p>The exact fee, acceptance criteria, access requirements, and exclusions are confirmed in writing. No performance outcome is implied by this page.</p>
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
