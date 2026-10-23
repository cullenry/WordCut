import { IBM_Plex_Mono, Newsreader, Rubik } from "next/font/google";

// Loaded by the landing page only, so the editor never downloads them.

/** Headlines: Rubik ExtraBold, heavy but with softened corners. */
export const display = Rubik({ subsets: ["latin"], weight: "800", variable: "--font-display-sans" });
/** The one italic accent word in each headline. */
export const accent = Newsreader({ subsets: ["latin"], style: "italic", weight: "500", variable: "--font-accent-serif" });
/** Labels, timecodes and commands. */
export const label = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
