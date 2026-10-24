import { IBM_Plex_Mono, Rubik } from "next/font/google";

// Shared by the landing page and the editor; set on <html> by the root layout.

/** Headlines and the logo: Rubik ExtraBold, heavy but with softened corners. */
export const display = Rubik({ subsets: ["latin"], weight: "800", variable: "--font-display-sans" });
/** Labels, timecodes and commands. */
export const label = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
