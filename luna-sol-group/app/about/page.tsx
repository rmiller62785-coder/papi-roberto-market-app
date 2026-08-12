import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "About Luna Sol Group",
  description: "A founder-led management consulting firm for consequential operating decisions in logistics, retail, mobility, and investor-backed businesses.",
  alternates: { canonical: "/about" },
};

const principles = [
  { index: "01", title: "Operating truth before prescription", copy: "Reconcile the dashboard with workflow evidence and frontline reality before recommending action." },
  { index: "02", title: "Decisions before activity", copy: "Define what leadership must decide, the evidence required, and the consequence of delay." },
  { index: "03", title: "Mechanisms before theater", copy: "Build workflows, controls, ownership, and cadence that operators can use under pressure." },
  { index: "04", title: "Capability before dependence", copy: "Leave the operating team able to run the system without permanent reliance on the advisor." },
];

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="depth-page">
        <section className="firm-hero depth-hero-dark"><div className="shell firm-hero-grid"><div><span className="depth-eyebrow">About Luna Sol Group</span><h1>A focused firm for <em>consequential operating decisions.</em></h1></div><div><p>Luna Sol Group is a founder-led management consulting firm that helps executives diagnose operating constraints, design scalable systems, and carry transformation into implementation.</p><p>The firm was founded in 2023 and has operated as a full-time advisory practice since January 2026.</p></div></div></section>

        <section className="firm-thesis"><div className="shell firm-thesis-grid"><span>Why Luna Sol exists</span><h2>Recommendations do not create value. Operating systems do.</h2><div><p>The firm is built for the gap between an approved idea and an operation capable of delivering it. Engagements begin with the decision, make the evidence boundary explicit, and finish with accountable mechanisms the team can sustain.</p><Link href="/approach" prefetch={false}>Explore the decision system ↗</Link></div></div></section>

        <section className="firm-principles"><div className="shell"><header className="depth-section-head"><div><span>Operating principles</span><h2>How the firm works.</h2></div><p>These principles govern the engagement posture, the methods, and the way evidence is presented on this site.</p></header><div className="firm-principles-grid">{principles.map((principle) => <article key={principle.index}><span>{principle.index}</span><h3>{principle.title}</h3><p>{principle.copy}</p></article>)}</div></div></section>

        <section className="firm-boundary"><div className="shell firm-boundary-grid"><div><span>Evidence standard</span><h2>Client work, public context, and prior experience stay separate.</h2></div><div><p>Case-study pages label Luna Sol&apos;s scope separately from public company outcomes. Ryan Miller&apos;s Amazon and Walmart record is presented as prior operating experience—not as Luna Sol client work.</p><p>No testimonial, client result, fund relationship, or personal attribution is implied where the underlying evidence does not support it.</p></div></div></section>

        <section className="firm-principal-link"><div className="shell"><div><span>Founder and principal</span><h2>Senior judgment stays close to the operating decision.</h2><p>Learn about Ryan Miller&apos;s operating background, selected prior experience, and founder-led engagement posture.</p></div><Link className="button" href="/about/ryan-miller" prefetch={false}>Meet Ryan Miller →</Link></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
