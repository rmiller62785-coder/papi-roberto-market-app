import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aperture-nvda-plan.rmiller62785.chatgpt.site"),
  title: "NVDA Opening Intelligence — Transparent Market Research",
  description: "Point-in-time NVDA opening research with live structure, candles, EMA behavior, event-risk evidence, Polymarket repricing, and a transparent base-to-final forecast bridge.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "NVDA Opening Intelligence",
    description: "Evidence → direction → uncertainty → opening range, with every input and price effect visible.",
    images: [{ url: "/og-v2.png", width: 1733, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NVDA Opening Intelligence",
    description: "Transparent, point-in-time NVDA opening research.",
    images: ["/og-v2.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
