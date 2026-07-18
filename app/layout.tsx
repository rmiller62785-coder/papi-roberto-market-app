import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aperture — NVDA Opening Plan",
  description: "Automated NVDA pivot, thirds, premarket, and 9:31 opening analysis for cash-share traders.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
