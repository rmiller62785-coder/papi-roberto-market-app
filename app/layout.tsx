import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aperture-nvda-plan.rmiller62785.chatgpt.site"),
  title: "Aperture NVDA — MOO Opening Planner",
  description: "Point-in-time NVDA Market-on-Open decision support with explicit deadlines, independent long and short paper tickets, source health, and a separate 9:31 confirmation workflow.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Aperture NVDA — MOO Opening Planner",
    description: "One qualified opening decision, both MOO paper tickets, explicit Nasdaq deadlines, and visible data entitlements.",
    images: [{ url: "/og-v2.png", width: 1733, height: 909 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aperture NVDA — MOO Opening Planner",
    description: "Transparent, point-in-time NVDA MOO research and paper planning.",
    images: ["/og-v2.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
