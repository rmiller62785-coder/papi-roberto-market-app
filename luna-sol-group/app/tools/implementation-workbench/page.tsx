import type { Metadata } from "next";
import Link from "next/link";
import { ImplementationWorkbench } from "../../components/ImplementationWorkbench";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Implementation Workbench",
  description: "A working launch-readiness, SOP/RACI, and risk-control system that produces implementation-ready operating artifacts.",
  alternates: { canonical: "/tools/implementation-workbench" },
};

const artifacts = [
  { n: "01", title: "Go/no-go decision brief", body: "A weighted readiness view with critical gates, domain progress, owners, and the exact conditions blocking launch." },
  { n: "02", title: "Executable SOP + RACI", body: "A sequenced workflow connecting inputs, outputs, service levels, controls, and the responsible and accountable owners." },
  { n: "03", title: "Risk + control register", body: "A ranked view of inherent and residual exposure, control effectiveness, named responses, due dates, and closure priority." },
];

export default function ImplementationWorkbenchPage() {
  return <><SiteHeader /><main id="main">
    <section className="implementation-hero"><div className="shell implementation-hero-grid"><div><span className="kicker">Public product · Implementation Workbench</span><h1>Move from approved strategy to <em>operational readiness.</em></h1><p>Three connected implementation mechanisms for the work that determines whether change survives contact with operations: launch gates, process and decision rights, and risk-control closure.</p><div className="studio-hero-actions"><a className="button" href="#workbench">Open the workbench ↓</a><Link className="button button-ghost" href="/tools/executive-operations-studio">Open the Executive Operations Studio</Link></div></div><div className="implementation-hero-proof"><div><span>Launch decision</span><strong>Go / No-go</strong><small>Weighted critical gates</small></div><div><span>Operating design</span><strong>SOP + RACI</strong><small>Workflow and decision rights</small></div><div><span>Control system</span><strong>Risk register</strong><small>Exposure through closure</small></div></div></div><div className="shell studio-trust-strip"><span><i /> No signup</span><span><i /> Local working state</span><span><i /> Exportable artifacts</span><span><i /> Published scoring</span></div></section>
    <section className="implementation-stage" id="workbench"><div className="shell"><ImplementationWorkbench /></div></section>
    <section className="section paper"><div className="shell"><div className="section-heading compact-heading"><div><span className="section-label">Implementation outputs</span><h2>The meeting ends.<br />The operating artifact remains.</h2></div><p>Each module produces something a program team can implement, challenge, assign, and carry into governance—not a generic score.</p></div><div className="implementation-artifact-grid">{artifacts.map((artifact) => <article key={artifact.n}><b>{artifact.n}</b><h3>{artifact.title}</h3><p>{artifact.body}</p></article>)}</div></div></section>
    <section className="section diagnostic-after studio-final-cta"><div className="shell narrow-shell"><span className="section-label light">Adapt the workbench</span><h2>Generic mechanisms are useful. Context-specific controls are valuable.</h2><p>Luna Sol adapts the gates, workflows, decision rights, compliance controls, and governance cadence to the actual operating environment.</p><div className="approach-actions"><Link className="button button-light" href="/#contact">Discuss an implementation system</Link><Link className="text-link light" href="/tools">Explore all products →</Link></div></div></section>
  </main><SiteFooter /></>;
}
