import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aperture-nvda-plan.rmiller62785.chatgpt.site"),
  title: "Aperture NVDA — Live Opening Intelligence",
  description: "Live NVDA opening research with weighted ranges, event evidence, historical sessions, candlesticks, EMA context, and a separate fail-safe Strict MOO Gate.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Aperture NVDA — Live Opening Intelligence",
    description: "Weighted opening research, live market APIs, events, candlesticks, EMA context, history, and a separate Strict MOO execution gate.",
    images: [{ url: "/og-v3.png", width: 1788, height: 880 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aperture NVDA — Live Opening Intelligence",
    description: "Transparent NVDA opening research with live data, history, candles, EMA context, and explicit execution safety gates.",
    images: ["/og-v3.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
