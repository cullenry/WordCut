/** The editor's buttons: the landing page's pills, at the editor's smaller size. */
const pill =
  "press inline-flex items-center justify-center gap-2 rounded-full font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40";

/** Cream on ink in the dark theme, ink on paper in the light one. */
export const primaryButton = `${pill} bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/85 disabled:hover:bg-ink`;
export const secondaryButton = `${pill} bg-ink/[0.07] px-4 py-2 text-sm text-ink hover:bg-ink/[0.12] disabled:hover:bg-ink/[0.07]`;
export const primaryButtonSmall = `${pill} bg-ink px-3.5 py-1.5 text-xs text-paper hover:bg-ink/85 disabled:hover:bg-ink`;
/** Outlined with a hairline, for actions beside a panel's content (Close video, Re-transcribe). */
export const outlineButton = `${pill} border border-rule px-3 py-1 text-xs text-ink hover:border-ink/40`;
/** Text only, for the quiet half of a pair (Cancel beside Apply). */
export const ghostButton = `${pill} px-3 py-1.5 text-xs text-ink-2 hover:bg-ink/[0.07] hover:text-ink`;
