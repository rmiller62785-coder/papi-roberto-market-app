import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://luna-sol-group.rmiller62785.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Luna Sol Group | Operator-Led Transformation",
    template: "%s | Luna Sol Group",
  },
  description: "Operator-led diagnostics, transformation design, and deployment for consequential operating problems in logistics, retail, mobility, and investor-backed businesses.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Luna Sol Group",
    title: "Luna Sol Group | Operations Product Suite",
    description: "Working systems for executive operating control, implementation readiness, portfolio governance, process ownership, and risk closure.",
    images: [{ url: "/og-product-suite.png", width: 1729, height: 910, alt: "Luna Sol Group operations product suite" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Luna Sol Group | Operations Product Suite",
    description: "Working systems for executive operating control, implementation readiness, portfolio governance, process ownership, and risk closure.",
    images: ["/og-product-suite.png"],
  },
  robots: { index: true, follow: true },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Luna Sol Group",
  url: siteUrl,
  foundingDate: "2023",
  email: "Rmiller62785@gmail.com",
  description: "Operator-led diagnostics, transformation design, and deployment for complex operating systems.",
  founder: {
    "@type": "Person",
    name: "Ryan Miller",
    jobTitle: "Founder and Principal",
    alumniOf: ["Amazon", "Walmart"],
  },
  sameAs: ["https://www.linkedin.com/in/ryan-miller-90b1181aa/"],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const analyticsDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        {analyticsDomain ? (
          <script defer data-domain={analyticsDomain} src="https://plausible.io/js/script.js" />
        ) : null}
      </body>
    </html>
  );
}
