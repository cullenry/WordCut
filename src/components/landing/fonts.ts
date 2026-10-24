import { Newsreader } from "next/font/google";

// Loaded by the landing page only, so the editor never downloads it. The shared fonts are in components/ui/fonts.

/** The one italic accent word in each headline. */
export const accent = Newsreader({ subsets: ["latin"], style: "italic", weight: "500", variable: "--font-accent-serif" });
