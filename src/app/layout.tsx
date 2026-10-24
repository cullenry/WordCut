import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import { display, label } from "@/components/ui/fonts";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: `${APP_NAME} - ${APP_TAGLINE}`,
  description:
    "Free, open-source, browser-based video editor. Cut and clip video by editing the transcript, then crop and export captioned clips for any platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Each page sets data-ink on <html> before hydrating, for its dark mode (see ThemeToggle).
    <html lang="en" className={`${inter.variable} ${display.variable} ${label.variable}`} suppressHydrationWarning>
      <body>
        {children}
        {/* Page views only, and only on Vercel deployments; it does nothing when self-hosted. */}
        <Analytics />
      </body>
    </html>
  );
}
