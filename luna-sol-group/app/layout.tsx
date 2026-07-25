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
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Luna Sol Group",
    title: "Luna Sol Group | Executive Operations Studio",
    description: "A working executive system for capacity control, transformation portfolios, and weekly business reviews.",
    images: [{ url: "/og-operations-studio.png", width: 1729, height: 910, alt: "Luna Sol Group Executive Operations Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Luna Sol Group | Executive Operations Studio",
    description: "A working executive system for capacity control, transformation portfolios, and weekly business reviews.",
    images: ["/og-operations-studio.png"],
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
