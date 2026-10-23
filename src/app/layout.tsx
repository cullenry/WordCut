import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: `${APP_NAME} - ${APP_TAGLINE}`,
  description:
    "Free, open-source, browser-based video editor. Cut and clip video by editing the transcript, then export captioned 9:16 clips.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
