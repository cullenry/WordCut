import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/landing/CopyButton";
import { EditorDemo } from "@/components/landing/EditorDemo";
import { accent, display, label } from "@/components/landing/fonts";
import { HeroTranscript } from "@/components/landing/HeroTranscript";
import { PlayableDemo, type DemoMediaOption } from "@/components/landing/PlayableDemo";
import { ScrollRuler } from "@/components/landing/ScrollRuler";
import { THEME_SCRIPT, ThemeToggle } from "@/components/landing/ThemeToggle";
import { GitHubIcon, StarIcon } from "@/components/ui/icons";
import { APP_NAME, GITHUB_URL } from "@/lib/config";

/**
 * What the playable demo's screen shows. "placeholder" is a drawn video frame.
 * To use a screen recording instead, put it in public/ (16:9, under ~8 MB) and
 * set e.g. { kind: "video", src: "/demo.mp4", alt: "..." }, or kind "image" for a GIF.
 */
const DEMO_MEDIA: DemoMediaOption = { kind: "placeholder" };

const REPO_DIR = GITHUB_URL.split("/").pop();
const COMMANDS = [`git clone ${GITHUB_URL}.git`, `cd ${REPO_DIR}`, "npm install", "npm run dev"];

const steps = [
  {
    title: "Upload",
    body: "Drop in a video. It stays on your device. Only the audio goes out to be transcribed, and every word comes back with a timestamp.",
  },
  {
    title: "Edit the text",
    body: "Delete words to cut them. Strip every um and dead pause in one pass. Highlight a passage, press C, and it's a clip.",
  },
  {
    title: "Export",
    body: "Reframe to 9:16, pick a caption style, export an MP4. Rendered in your browser. No watermark, no queue.",
  },
];

const NOT_INCLUDED = ["Subscription", "Watermark", "Account", "Upload limits", "Export credits"];

const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-16";
const primaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 font-medium text-paper transition-colors hover:bg-cut focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const secondaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-full border border-ink/25 px-6 py-3.5 font-medium transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const heading =
  "font-display text-[clamp(2.4rem,5.4vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.035em] [word-spacing:0.06em] text-balance";

export default function Home() {
  return (
    <div className={`landing min-h-screen overflow-x-clip ${display.variable} ${accent.variable} ${label.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <ScrollRuler />

      <header className={`${wrap} flex items-center justify-between gap-4 py-5`}>
        <Mark />
        <nav className="flex items-center gap-2 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="inline-flex h-9 items-center gap-2 rounded-full px-2.5 transition-colors hover:bg-ink/[0.06] sm:px-3"
          >
            <GitHubIcon />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <ThemeToggle />
          <Link
            href="/editor"
            className="press ml-1 rounded-full bg-ink px-4 py-2 font-medium text-paper transition-colors hover:bg-cut"
          >
            Try it free
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className={`${wrap} pb-20 pt-10 sm:pt-16 lg:pb-28 lg:pt-20`}>
          <p className="font-label text-xs uppercase tracking-[0.12em] text-ink-2">
            A free, open-source video editor that runs in your browser
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.9rem,8.6vw,7.4rem)] font-extrabold leading-[0.92] tracking-[-0.04em] [word-spacing:0.06em]">
            Delete the{" "}
            <em className="h-strike font-accent font-medium italic tracking-[-0.02em]">um.</em>
            <br />
            Keep the video.
          </h1>

          <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-5">
              <p className="max-w-[34ch] text-lg leading-relaxed text-ink-2 text-pretty">
                Your video becomes a transcript. Delete a word and it&apos;s cut from the footage. Highlight a passage
                and it&apos;s a captioned 9:16 clip.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/editor" className={primaryButton}>
                  Try it free
                </Link>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
                  <StarIcon className="h-4 w-4" />
                  Star on GitHub
                </a>
              </div>
              <p className="mt-5 text-sm text-ink-2">No account. No upload. Works in Chrome and Edge.</p>
            </div>
            <div className="lg:col-span-7">
              <HeroTranscript />
            </div>
          </div>
        </section>

        {/* 01: the playable demo */}
        <section aria-labelledby="try-heading" className={`${wrap} border-t border-rule py-24 lg:py-36`}>
          <SectionLabel n="01" text="Try it" />
          <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-end">
            <h2 id="try-heading" className={`${heading} lg:col-span-7`}>
              Click a word. It&apos;s <Accent>gone.</Accent>
            </h2>
            <p className="max-w-[38ch] text-lg leading-relaxed text-ink-2 lg:col-span-5">
              That&apos;s the whole idea. Click any word to cut it from the take. Click the red mark it leaves to bring it
              back.
            </p>
          </div>
          <div className="mt-12">
            <PlayableDemo media={DEMO_MEDIA} />
          </div>
        </section>

        {/* 02: how it works, a row of steps over the editor running on its own */}
        <section id="how-it-works" aria-labelledby="how-heading" className="border-t border-rule">
          <div className={`${wrap} py-24 lg:py-36`}>
            <SectionLabel n="02" text="How it works" />
            <h2 id="how-heading" className={`${heading} mt-8 max-w-4xl`}>
              Three steps. No <Accent>timeline</Accent> wrangling.
            </h2>
            <ol className="mt-14 grid border-t border-ink md:grid-cols-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="border-b border-rule py-7 md:border-b-0 md:border-l md:px-7 md:first:border-l-0 md:first:pl-0"
                >
                  <span className="font-display text-7xl font-extrabold leading-none tracking-[-0.04em]">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-2 max-w-[34ch] leading-relaxed text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14">
              <EditorDemo />
            </div>
          </div>
        </section>

        {/* 03: privacy, drawn as what stays and what leaves */}
        <section aria-labelledby="private-heading" className="border-t border-rule">
          <div className={`${wrap} py-24 lg:py-36`}>
            <SectionLabel n="03" text="Private by design" />
            <h2 id="private-heading" className={`${heading} mt-8`}>
              Your video never <Accent>leaves.</Accent>
            </h2>
            <div className="mt-14 grid items-stretch gap-0 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1fr)]">
              <div className="relative border border-dashed border-ink/50 p-6 sm:p-10">
                <span className="absolute -top-2.5 left-5 bg-paper px-2 font-label text-[11px] uppercase tracking-[0.12em] text-ink-2">
                  Your browser
                </span>
                <p className="font-display text-[clamp(4rem,11vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.05em]">
                  1 hr
                </p>
                <p className="mt-4 max-w-[30ch] text-lg leading-relaxed text-ink-2">
                  of video stays in this tab. It&apos;s read from disk, cut and rendered right here, then saved back to
                  you.
                </p>
              </div>
              <div aria-hidden className="flex items-center justify-center py-4 lg:px-4 lg:py-0">
                <svg viewBox="0 0 80 24" className="h-6 w-20 rotate-90 text-cut lg:rotate-0" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M0 12h76M68 5l8 7-8 7" />
                </svg>
              </div>
              <div className="border-t border-ink p-6 sm:p-10 lg:border-l-0 lg:border-t-0 lg:px-0">
                <p className="font-display text-[clamp(2.75rem,6vw,4.75rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-cut">
                  11 MB
                </p>
                <p className="mt-4 max-w-[28ch] leading-relaxed text-ink-2">
                  of audio goes out, to the transcription service you pick: Deepgram, AssemblyAI or OpenAI. That&apos;s
                  all.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 04: free, as a list of what isn't here */}
        <section aria-labelledby="free-heading" className="border-t border-rule">
          <div className={`${wrap} py-24 lg:py-36`}>
            <SectionLabel n="04" text="Free and open source" />
            <h2 id="free-heading" className={`${heading} mt-8`}>
              Free. Not <Accent>freemium.</Accent>
            </h2>
            <div className="mt-14 grid gap-14 lg:grid-cols-12">
              <ul aria-label="Not included" className="lg:col-span-8">
                {NOT_INCLUDED.map((item) => (
                  <li
                    key={item}
                    className="border-b border-rule py-2 font-display text-[clamp(2.1rem,5.6vw,4.25rem)] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink/55 first:border-t"
                  >
                    <span className="strike">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="lg:col-span-4 lg:pt-4">
                <p className="font-label text-[11px] uppercase tracking-[0.12em] text-ink-2">Licence</p>
                <p className="mt-2 font-display text-8xl font-extrabold leading-none tracking-[-0.04em]">
                  MIT
                </p>
                <p className="mt-6 max-w-[32ch] text-lg leading-relaxed text-ink-2">
                  Fork it, change it, ship it. {APP_NAME} is an open-source alternative to Descript and Opus Clip, and
                  the whole thing is on GitHub.
                </p>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`${primaryButton} mt-8`}>
                  <StarIcon className="h-4 w-4" />
                  Star on GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 05: self-hosting, on an ink band */}
        <section aria-labelledby="host-heading" className="bg-ink text-paper">
          <div className={`${wrap} py-24 lg:py-32`}>
            <p className="font-label text-xs uppercase tracking-[0.12em] text-paper/60">05 / Self-host</p>
            <div className="mt-8 grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <h2 id="host-heading" className={heading}>
                  Run it yourself in <Accent>four</Accent> commands.
                </h2>
                <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-paper/65">
                  Your machine, your server, your transcription key. No sign-up anywhere.
                </p>
                <a
                  href={`${GITHUB_URL}#self-hosting`}
                  target="_blank"
                  rel="noreferrer"
                  className="press mt-8 inline-flex items-center rounded-full border border-paper/30 px-6 py-3.5 font-medium transition-colors hover:border-paper"
                >
                  Self-hosting guide
                </a>
              </div>
              <figure className="min-w-0 lg:col-span-7">
                <div className="flex items-center justify-between border-b border-paper/20 pb-3">
                  <figcaption className="font-label text-[11px] uppercase tracking-[0.12em] text-paper/60">
                    Terminal
                  </figcaption>
                  <CopyButton text={COMMANDS.join("\n")} />
                </div>
                <pre className="overflow-x-auto pt-5 font-label text-[15px] leading-[2.2] sm:text-lg">
                  <code>
                    {COMMANDS.map((c, i) => (
                      <span key={c} className="block">
                        <span className="select-none text-paper/50">{String(i + 1).padStart(2, "0")} $ </span>
                        {c}
                      </span>
                    ))}
                  </code>
                </pre>
              </figure>
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className={`${wrap} py-24 lg:py-36`}>
          <h2 className="max-w-5xl font-display text-[clamp(2.6rem,6.8vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.04em] [word-spacing:0.06em] text-balance">
            Your next clip is already in the <Accent>transcript.</Accent>
          </h2>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/editor" className={primaryButton}>
              Try it free
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
              <StarIcon className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className={`${wrap} flex flex-col gap-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between`}>
          <Mark />
          <p>
            MIT licensed.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
              Source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** The name with a red cut notch beside it. */
function Mark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink">
      <span aria-hidden className="relative h-5 w-5 rounded-[3px] bg-ink">
        <span className="absolute inset-y-1 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-cut" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
    </Link>
  );
}

function Accent({ children }: { children: ReactNode }) {
  return <em className="font-accent font-medium italic tracking-[-0.02em]">{children}</em>;
}

function SectionLabel({ n, text }: { n: string; text: string }) {
  return (
    <p className="font-label text-xs uppercase tracking-[0.12em] text-ink-2">
      {n} / {text}
    </p>
  );
}
