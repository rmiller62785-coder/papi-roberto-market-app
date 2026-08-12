import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { getIndustry, industries } from "@/app/data/expertise";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return industries.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return {};
  return { title: industry.title, description: industry.promise, alternates: { canonical: `/industries/${slug}` } };
}

export default async function IndustryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) notFound();

  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="depth-detail-hero depth-hero-navy">
          <div className="shell depth-detail-hero-grid"><div><span className="depth-eyebrow">Industry {industry.index}</span><h1>{industry.title}</h1><p className="depth-lead">{industry.promise}</p></div><aside><span>The operating context</span><p>{industry.overview}</p></aside></div>
        </section>

        <section className="depth-pressure-section"><div className="shell"><header className="depth-section-head"><div><span>Operating pressures</span><h2>Where the system is tested.</h2></div><p>The pattern changes by company. These are the recurring interfaces Luna Sol is equipped to investigate—not a claim that every organization has the same constraint.</p></header><div className="depth-pressure-grid">{industry.pressures.map((pressure, index) => <article key={pressure.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{pressure.title}</h3><p>{pressure.description}</p></article>)}</div></div></section>

        <section className="depth-decisions-band"><div className="shell depth-decisions-grid"><div><span>Relevant work</span><h2>Operating systems, not generic sector advice.</h2></div><ul>{industry.relevantWork.map((item) => <li key={item}>{item}</li>)}</ul></div></section>

        <section className="depth-related-section"><div className="shell"><header className="depth-section-head"><div><span>Related evidence and expertise</span><h2>See the basis for the point of view.</h2></div><p>{industry.boundary}</p></header><div className="depth-related-grid">{industry.related.map((item) => <Link href={item.href} key={item.href} prefetch={false}><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.description}</p><small>{item.evidenceBasis}</small><strong>Explore <i aria-hidden="true">↗</i></strong></Link>)}</div></div></section>

        <section className="depth-close"><div className="shell"><span>Bring the operating decision</span><h2>Start with the mechanism that must change.</h2><Link className="button button-light" href="/contact" prefetch={false}>Get in touch →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
