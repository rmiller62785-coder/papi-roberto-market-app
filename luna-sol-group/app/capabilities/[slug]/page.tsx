import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";
import { capabilities, getCapability } from "@/app/data/expertise";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return capabilities.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const capability = getCapability(slug);
  if (!capability) return {};
  return { title: capability.title, description: capability.promise, alternates: { canonical: `/capabilities/${slug}` } };
}

export default async function CapabilityDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const capability = getCapability(slug);
  if (!capability) notFound();

  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="depth-detail-hero depth-hero-dark">
          <div className="shell depth-detail-hero-grid">
            <div><span className="depth-eyebrow">Capability {capability.index}</span><h1>{capability.title}</h1><p className="depth-lead">{capability.promise}</p></div>
            <aside><span>The operating objective</span><p>{capability.overview}</p></aside>
          </div>
        </section>

        <section className="depth-question-section">
          <div className="shell depth-two-column">
            <header><span>Questions we solve</span><h2>Start where leadership needs a decision.</h2></header>
            <ol>{capability.questions.map((question, index) => <li key={question}><b>{String(index + 1).padStart(2, "0")}</b><span>{question}</span></li>)}</ol>
          </div>
        </section>

        <section className="depth-modules-section">
          <div className="shell"><header className="depth-section-head"><div><span>Work modules</span><h2>From operating evidence to durable control.</h2></div><p>The exact scope is shaped by the decision and evidence available. These modules describe the work, not a promise of a predetermined outcome.</p></header><div className="depth-module-grid">{capability.modules.map((module, index) => <article key={module.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{module.title}</h3><p>{module.description}</p><ul>{module.outputs.map((output) => <li key={output}>{output}</li>)}</ul></article>)}</div></div>
        </section>

        <section className="depth-decisions-band">
          <div className="shell depth-decisions-grid"><div><span>Decisions unlocked</span><h2>Make the next commitment inspectable.</h2></div><ul>{capability.decisions.map((decision) => <li key={decision}>{decision}</li>)}</ul></div>
        </section>

        <section className="depth-related-section">
          <div className="shell"><header className="depth-section-head"><div><span>Related proof and products</span><h2>Follow the operating thread.</h2></div><p>{capability.evidenceNote}</p></header><div className="depth-related-grid">{capability.related.map((item) => <Link href={item.href} key={item.href} prefetch={false}><span>{item.eyebrow}</span><h3>{item.title}</h3><p>{item.description}</p><small>{item.evidenceBasis}</small><strong>Explore <i aria-hidden="true">↗</i></strong></Link>)}</div></div>
        </section>

        <section className="depth-close"><div className="shell"><span>Bring the decision</span><h2>What must be true for the operating commitment to hold?</h2><Link className="button button-light" href="/contact" prefetch={false}>Start a conversation →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
