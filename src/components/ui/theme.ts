// Not a client module, so server pages can build the inline script from it.

/** The key predates the editor having a light theme; kept so saved choices still apply. */
export const THEME_KEY = "wordcut-landing-ink";

export type Ink = "light" | "dark";

/**
 * Runs before the page paints, so a saved choice doesn't flash. With nothing saved,
 * a page uses its own default: the landing page is paper, the editor is ink.
 */
export const themeScript = (fallback: Ink) =>
  `(function(){var s;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=document.documentElement;` +
  `if((s==="dark"||s==="light"?s:"${fallback}")==="dark")d.dataset.ink="dark";else delete d.dataset.ink})()`;

export const THEME_SCRIPT = themeScript("light");
