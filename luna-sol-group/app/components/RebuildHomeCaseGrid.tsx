import Image from "next/image";
import Link from "next/link";

const cases = [
  {
    index: "01",
    key: "psa",
    name: "PSA",
    relationship: "Advisory engagement · 2026",
    title: "A record backlog needed a recovery system—not another throughput target.",
    copy: "Luna Sol isolated the active constraint, structured countermeasures, and established the governance and capacity mechanisms behind recovery.",
    image: "/psa-timeline.png",
    imageWidth: 1080,
    imageHeight: 1350,
    alt: "PSA public backlog timeline from the 2026 demand shock through recovery.",
    logo: "/psa-logo.png",
    logoWidth: 830,
    logoHeight: 338,
    company: "https://www.psacard.com/",
    href: "/work/psa",
    proofLabel: "Public operating arc",
    proof: "~14M → ~11–12M",
    evidence: "8-source evidence room",
    evidenceHref: "https://www.psacard.com/info/backlog-tracker",
  },
  {
    index: "02",
    key: "hopskipdrive",
    name: "HopSkipDrive",
    relationship: "Consulting engagement · 2026",
    title: "A regulated transportation platform needed an operating foundation for national scale.",
    copy: "Designed the architecture connecting dispatch, compliance, SOPs, risk, governance, technical requirements, and implementation.",
    image: "/hopskipdrive-expansion.jpg",
    imageWidth: 1200,
    imageHeight: 630,
    alt: "HopSkipDrive CareDriver seated in a vehicle.",
    logo: "/hopskipdrive-logo.svg",
    logoWidth: 256,
    logoHeight: 256,
    company: "https://www.hopskipdrive.com/",
    href: "/work/hopskipdrive",
    proofLabel: "Operating footprint",
    proof: "30+ metro markets",
    evidence: "Official sources checked",
    evidenceHref: "https://www.hopskipdrive.com/blog/new-2026-2027-product-suite/",
  },
  {
    index: "03",
    key: "maid",
    name: "Maid of the Mist",
    relationship: "Senior operations engagement · 2026",
    title: "Guest-flow bottlenecks became a clearer public planning capability.",
    copy: "Assessed the U.S. operation end to end and translated guest-flow evidence into practical operating and planning recommendations.",
    image: "/maid-of-the-mist-2026.jpg",
    imageWidth: 1500,
    imageHeight: 1000,
    alt: "Maid of the Mist electric vessels operating near Niagara Falls.",
    logo: "/maid-of-the-mist-logo.svg",
    logoWidth: 229,
    logoHeight: 154,
    company: "https://www.maidofthemist.com/",
    href: "/work/maid-of-the-mist",
    proofLabel: "Public capability",
    proof: "Wait-time trends · 2026",
    evidence: "News + official source",
    evidenceHref: "https://www.wgrz.com/article/news/local/maid-of-the-mist-announces-launch-date-for-2026/71-302e72a9-f363-43db-ad1d-69884d595407",
  },
];

export function RebuildHomeCaseGrid() {
  return (
    <div className="rh-case-grid" aria-label="Featured case studies">
      {cases.map((item) => (
        <article className={`rh-case-card rh-case-card-${item.key}`} key={item.name}>
          <Link className="rh-case-image" href={item.href} prefetch={false} aria-label={`Read the ${item.name} case study`}>
            <Image src={item.image} width={item.imageWidth} height={item.imageHeight} alt={item.alt} sizes="(max-width: 760px) 100vw, 34vw" />
            <span>{item.index}</span>
          </Link>
          <div className="rh-case-body">
            <div className="rh-case-meta"><small>{item.relationship}</small><a href={item.company} target="_blank" rel="noreferrer" aria-label={`Visit ${item.name} company site`}><Image src={item.logo} width={item.logoWidth} height={item.logoHeight} alt={`${item.name} logo`} />{item.key === "hopskipdrive" ? <b>HopSkipDrive</b> : null}</a></div>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
            <div className="rh-case-proof"><span>{item.proofLabel}</span><strong>{item.proof}</strong><a href={item.evidenceHref} target="_blank" rel="noreferrer"><i aria-hidden="true">✓</i> {item.evidence} <b aria-hidden="true">↗</b></a></div>
            <Link className="rh-case-link" href={item.href} prefetch={false}>Read the case study <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      ))}
    </div>
  );
}
