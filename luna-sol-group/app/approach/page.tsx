import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "Sourced, Not Generative",
  description: "Why Luna Sol builds transparent, deterministic tools and cites public sources instead of shipping AI-generated chat, case studies, or reviews.",
  alternates: { canonical: "/approach" },
};

const pillars = [
  {
    n: "01",
    title: "Live evidence, not static claims.",
    description: "The PSA case study doesn't just cite sources once and move on—the backlog figure on that page is checked against PSA's own tracker on every visit, with a labeled fallback chain if the live check fails.",
    outputs: ["Checked against PSA's official tracker", "Falls back to a corroborating source, then a dated checkpoint", "Every state is labeled: live, corroborated, or published"],
    link: { href: "/work/psa#evidence", label: "See the live evidence room" },
  },
  {
    n: "02",
    title: "Transparent math, not a black box.",
    description: "The Recovery Calculator and the Constraint Diagnostic are both fixed, published formulas applied to the numbers you enter. No language model sits between your input and the output—so the reasoning is auditable, not just plausible-sounding.",
    outputs: ["Every output traces to a visible input", "Same inputs always produce the same output", "The formula is described on the page, not hidden"],
    link: { href: "/tools/constraint-diagnostic", label: "Try the constraint diagnostic" },
  },
  {
    n: "03",
    title: "Sourced attribution, never an invented quote.",
    description: "No client testimonial appears on this site without that client's explicit sign-off. Where one hasn't been given, the site says so plainly instead of leaving a gap or, worse, filling it with something that sounds real.",
    outputs: ["Explicit pending-approval state, not a fabricated quote", "Every public figure links to its original source", "Engagement scope kept separate from publicly reported outcomes"],
    link: { href: "/#validation", label: "See the client validation policy" },
  },
  {
    n: "04",
    title: "Tools a client keeps, not a transcript.",
    description: "The deliverable at the end of an engagement is a working operating mechanism—a control cadence, a capacity model, a governance structure—not a chat log. The free tools on this site are built the same way: something you can use again, not a conversation that ends.",
    outputs: ["A generalized calculator usable for any queue, not just PSA's", "A constraint diagnostic that names its own next step", "Both free, with no signup wall"],
    link: { href: "/tools/backlog-recovery-calculator", label: "Try the recovery calculator" },
  },
];

const contrasts = [
  { b: "01", h3: "Not a chatbot wrapper", p: "Nothing on this site is a thin interface in front of a general-purpose language model. Every tool computes a result you can trace, not a response you have to take on faith." },
  { b: "02", h3: "Not AI-generated case studies", p: "PSA, HopSkipDrive, and Maid of the Mist are each backed by dated, linked public sources plus explicitly labeled Luna Sol reconstructions—never a generated narrative standing in for evidence." },
  { b: "03", h3: "Not synthetic reviews", p: "A testimonial you can't verify is worse than no testimonial. This site would rather show a labeled gap than a quote that sounds convincing and isn't real." },
];

export default function ApproachPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className="subpage-hero diagnostic-hero">
          <div className="shell narrow-shell">
            <span className="kicker">How Luna Sol builds its tools</span>
            <h1>Sourced, not <em>generative.</em></h1>
            <p>
              Everyone offers &ldquo;AI tooling&rdquo; now. What differentiates the tools on this site isn&rsquo;t a
              better model&mdash;it&rsquo;s that none of them are a black box. Every number traces to a source you
              can check or a formula you can see. That&rsquo;s a deliberate constraint, not a limitation.
            </p>
            <div className="diagnostic-facts">
              <span><strong>2</strong> Transparent tools, 0 language models</span>
              <span><strong>16</strong> Cited public sources across the case studies</span>
              <span><strong>1</strong> Policy: no testimonial without sign-off</span>
            </div>
          </div>
        </section>

        <section className="section paper">
          <div className="shell">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-label">The four commitments</span>
                <h2>Verifiable beats impressive.</h2>
              </div>
              <p>Each of these is already live on the site&mdash;this page just names the pattern and points to the proof.</p>
            </div>
            <div className="capability-grid">
              {pillars.map((pillar) => (
                <article className="capability" key={pillar.n}>
                  <span className="capability-number">{pillar.n}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.description}</p>
                  <ul>{pillar.outputs.map((output) => <li key={output}>{output}</li>)}</ul>
                  <Link className="text-link" href={pillar.link.href}>{pillar.link.label} &rarr;</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section diagnostic-after">
          <div className="shell narrow-shell">
            <span className="section-label light">What this deliberately isn&rsquo;t</span>
            <div className="after-grid">
              {contrasts.map((item) => (
                <div key={item.b}><b>{item.b}</b><h3>{item.h3}</h3><p>{item.p}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section paper2 principal-section">
          <div className="shell principal-grid">
            <div className="principal-card">
              <div className="principal-monogram">LS</div>
              <dl>
                <div><dt>Standard</dt><dd>Every claim sourced or labeled as reconstruction</dd></div>
                <div><dt>Tools</dt><dd>Deterministic, published formulas only</dd></div>
                <div><dt>Testimonials</dt><dd>None without explicit client sign-off</dd></div>
              </dl>
            </div>
            <div className="principal-copy">
              <span className="section-label">Why it matters</span>
              <h2>The constraint is the credibility.</h2>
              <p className="principal-lead">A tool that can&rsquo;t explain its own answer isn&rsquo;t more capable for being harder to audit&mdash;it&rsquo;s just harder to trust with a decision that matters.</p>
              <p>Building this way is slower than generating a plausible-sounding case study or letting a chatbot answer for the brand. It&rsquo;s also the only version of &ldquo;AI tooling&rdquo; that holds up to the question every serious buyer eventually asks: how do you know that&rsquo;s true?</p>
              <Link className="text-link dark" href="/#contact">Bring us a problem worth verifying &rarr;</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
