import type { Metadata } from "next";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = { title: "Accessibility", description: "Luna Sol Group's accessibility commitment and feedback channel.", alternates: { canonical: "/accessibility" } };

export default function AccessibilityPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
  return <><SiteHeader /><main id="main" className="trust-page"><header><div className="shell"><span>Trust center</span><h1>Accessibility</h1><p>Luna Sol aims to make its public website and decision tools usable by as many people as possible.</p></div></header><article className="shell trust-article"><section><h2>Our commitment</h2><p>The site is designed around semantic structure, keyboard access, visible focus states, readable contrast, responsive layouts, form labels, meaningful alternative text, and reduced-motion preferences.</p></section><section><h2>Known scope</h2><p>Accessibility is an ongoing practice. Complex interactive decision tools, embedded content, third-party websites, and downloadable artifacts may present different levels of support. Third-party destinations are controlled by their respective owners.</p></section><section><h2>Request an alternative</h2><p>If content or a tool is difficult to use, email <a href={`mailto:${contactEmail}`}>{contactEmail}</a> with the page, task you were trying to complete, assistive technology if relevant, and the format that would work better. Luna Sol will respond directly and make a reasonable effort to provide an alternative.</p></section><section><h2>Feedback</h2><p>Accessibility feedback is welcome. Please do not include sensitive or confidential client information in an accessibility request.</p></section></article></main><SiteFooter /></>;
}
