import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aperture-nvda-plan.rmiller62785.chatgpt.site"),
  title: "Nvidia Live Structure — NVDA Market Intelligence",
  description: "Second-by-second NVDA market structure with full-session price action, EMA 9/21 behavior, pivots, thirds, premarket, and the 9:31 checkpoint.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Nvidia Live Structure", description: "NVDA price, EMA 9/21, pivots and thirds — live throughout the session.", images: [{ url: "/og.png", width: 1733, height: 909 }] },
  twitter: { card: "summary_large_image", title: "Nvidia Live Structure", description: "NVDA price, EMA 9/21, pivots and thirds.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
