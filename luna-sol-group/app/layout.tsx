import type { Metadata } from "next";
import "./globals.css";
import "./styles/tokens.css";
import "./styles/foundations.css";
import "./styles/home.css";
import "./styles/editorial.css";
import "./styles/products.css";
import "./styles/motion.css";
import "./styles/consulting.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://luna-sol-group.rmiller62785.chatgpt.site";
const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "Rmiller62785@gmail.com";

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
    title: "Luna Sol Group | Operating Transformation",
    description: "Find the operating constraint. Build the system that clears it.",
    images: [{ url: "/og-consulting.png", width: 1200, height: 630, alt: "Luna Sol Group — turn operating pressure into durable performance" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Luna Sol Group | Operating Transformation",
    description: "Find the operating constraint. Build the system that clears it.",
    images: ["/og-consulting.png"],
  },
  robots: { index: true, follow: true },
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Luna Sol Group",
  url: siteUrl,
  foundingDate: "2023",
  email: contactEmail,
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
