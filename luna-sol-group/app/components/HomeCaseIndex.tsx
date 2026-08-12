import Image from "next/image";
import Link from "next/link";

const cases = [
  {
    index: "01",
    key: "psa",
    name: "PSA",
    logo: "/psa-logo.png",
    width: 830,
    height: 338,
    company: "https://www.psacard.com/",
    href: "/work/psa",
    relationship: "Advisory engagement · 2026",
    headline: "A record backlog needed a recovery system—not another throughput target.",
    scope: "Luna Sol isolated the active operating constraint, structured countermeasures, and established the governance and capacity mechanisms behind recovery.",
    proofLabel: "Public operating arc",
    proof: "~14M → ~11–12M",
    evidence: "8-source evidence room",
    evidenceHref: "https://www.psacard.com/info/backlog-tracker",
  },
  {
    index: "02",
    key: "hopskipdrive",
    name: "HopSkipDrive",
    logo: "/hopskipdrive-logo.svg",
    width: 256,
    height: 256,
    company: "https://www.hopskipdrive.com/",
    href: "/work/hopskipdrive",
    relationship: "Consulting engagement · 2026",
    headline: "A regulated transportation platform needed an operating foundation for national scale.",
    scope: "Designed the architecture connecting dispatch, compliance, SOPs, risk, governance, technical requirements, and implementation.",
    proofLabel: "Operating footprint",
    proof: "30+ metro markets",
    evidence: "Official sources checked",
    evidenceHref: "https://www.hopskipdrive.com/blog/new-2026-2027-product-suite/",
  },
  {
    index: "03",
    key: "maid",
    name: "Maid of the Mist",
    logo: "/maid-of-the-mist-logo.svg",
    width: 229,
    height: 154,
    company: "https://www.maidofthemist.com/",
    href: "/work/maid-of-the-mist",
    relationship: "Senior operations engagement · 2026",
    headline: "Guest-flow bottlenecks became a clearer public planning capability.",
    scope: "Assessed the U.S. operation end to end and translated guest-flow evidence into practical operating and planning recommendations.",
    proofLabel: "Public capability",
    proof: "Wait-time trends · 2026",
    evidence: "News + official source",
    evidenceHref: "https://www.wgrz.com/article/news/local/maid-of-the-mist-announces-launch-date-for-2026/71-302e72a9-f363-43db-ad1d-69884d595407",
  },
];

export function HomeCaseIndex({ showHeading = true }: { showHeading?: boolean }) {
  return (
    <section className="section case-index-section paper" id="featured-work">
      <div className="shell">
        {showHeading ? (
          <header className="consulting-section-head" data-reveal>
            <div><span>Featured case studies</span><h2>Evidence, not decoration.</h2></div>
            <p>Each engagement opens into a focused dossier: the operating context, Ryan’s scope, the system designed, and the evidence boundary.</p>
            <Link href="/work" prefetch={false}>View all case studies →</Link>
          </header>
        ) : null}
        <div className="case-index" aria-label="Featured case studies">
          {cases.map((item) => (
            <article className="case-index-row" key={item.name} data-reveal>
              <div className="case-index-identity">
                <span>{item.index}</span>
                <small>{item.relationship}</small>
              </div>
              <a className={`case-index-logo case-index-logo-${item.key}`} href={item.company} target="_blank" rel="noreferrer" aria-label={`Visit ${item.name} company site`}>
                <Image src={item.logo} width={item.width} height={item.height} alt={`${item.name} logo`} />
                {item.key === "hopskipdrive" ? <strong>HopSkipDrive</strong> : null}
              </a>
              <div className="case-index-story">
                <h3>{item.headline}</h3>
                <p>{item.scope}</p>
                <Link href={item.href} prefetch={false}>Read the case study <span aria-hidden="true">→</span></Link>
              </div>
              <div className="case-index-proof">
                <span>{item.proofLabel}</span>
                <strong>{item.proof}</strong>
                <a href={item.evidenceHref} target="_blank" rel="noreferrer"><i aria-hidden="true">✓</i>{item.evidence} <b aria-hidden="true">↗</b></a>
              </div>
            </article>
          ))}
        </div>
        <div className="case-index-boundary">
          <span>Claim boundary</span>
          <p>Company and public outcomes reflect collaborative operating teams. Luna Sol’s contribution and public evidence are labeled separately inside every dossier.</p>
          <Link href="/work" prefetch={false}>Open the complete work index →</Link>
        </div>
      </div>
    </section>
  );
}
