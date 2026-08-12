import type { Metadata } from "next";
import { InquiryForm } from "@/app/components/InquiryForm";
import { SiteFooter } from "@/app/components/SiteFooter";
import { SiteHeader } from "@/app/components/SiteHeader";

export const metadata: Metadata = {
  title: "Contact",
  description: "Bring Luna Sol Group the operating decision, evidence available, urgency, and consequence of getting it wrong.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";
  return (
    <>
      <SiteHeader />
      <main id="main" className="contact-depth-page">
        <section className="contact-depth-hero"><div className="shell contact-depth-grid"><div><span className="depth-eyebrow">Confidential conversation</span><h1>Bring one consequential operating decision.</h1><p>Share the decision, what is at stake, the evidence available, and what the current operating system cannot resolve. Ryan reviews every inquiry directly.</p><dl><div><dt>Useful context</dt><dd>Decision · Scale · Urgency · Known evidence</dd></div><div><dt>First response</dt><dd>Fit, evidence needed, and smallest useful next step</dd></div><div><dt>Alternative</dt><dd><a href={`mailto:${contactEmail}`}>{contactEmail}</a></dd></div></dl></div><InquiryForm /></div></section>
        <section className="contact-boundary"><div className="shell"><span>Engagement boundary</span><p>Submitting this form does not create a consulting relationship. Do not send trade secrets, regulated personal data, credentials, or other information you are not authorized to share. Any engagement scope and confidentiality terms are established separately in writing.</p></div></section>
      </main>
      <SiteFooter />
    </>
  );
}
