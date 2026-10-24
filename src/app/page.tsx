import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/landing/CopyButton";
import { EditorDemo } from "@/components/landing/EditorDemo";
import { accent } from "@/components/landing/fonts";
import { HeroTranscript } from "@/components/landing/HeroTranscript";
import { PlayableDemo, type DemoMediaOption } from "@/components/landing/PlayableDemo";
import { display, label } from "@/components/ui/fonts";
import { GitHubIcon, StarIcon } from "@/components/ui/icons";
import { THEME_SCRIPT } from "@/components/ui/theme";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
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
    body: "Drop in a video and it stays on your device, while only the audio goes out to be transcribed with a timestamp on every word",
  },
  {
    title: "Edit the text",
    body: "Delete words to cut them, strip every um and dead pause in one pass, or highlight a passage and press C to make a clip",
  },
  {
    title: "Export",
    body: "Reframe to 9:16, pick a caption style and export an MP4 rendered right in your browser, with no watermark and no queue",
  },
];

const NOT_INCLUDED = ["Subscription", "Watermark", "Account", "Upload limits", "Export credits"];

const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-16";
const primaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 font-medium text-paper transition-colors hover:bg-cut focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const secondaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-full bg-ink/[0.07] px-6 py-3.5 font-medium transition-colors hover:bg-ink/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const heading =
  "font-display text-[clamp(2.4rem,5.4vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.035em] [word-spacing:0.06em] text-balance";
const lede = "text-lg leading-relaxed text-ink-2 text-pretty";

export default function Home() {
  return (
    <div className={`landing min-h-screen overflow-x-clip ${display.variable} ${accent.variable} ${label.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />

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
        <section className={`${wrap} pb-24 pt-10 sm:pt-16 lg:pb-32 lg:pt-20`}>
          <p className="font-label text-xs uppercase tracking-[0.12em] text-ink-2">
            A free, open-source video editor that runs in your browser
          </p>
          <h1 className="mt-6 font-display text-[clamp(2.9rem,8.6vw,7.4rem)] font-extrabold leading-[0.92] tracking-[-0.04em] [word-spacing:0.06em]">
            Delete the{" "}
            <em className="h-strike font-accent font-medium italic tracking-[-0.02em]">um</em>
            <br />
            Keep the video
          </h1>

          <div className="mt-12 flex flex-col gap-12 lg:mt-16 lg:flex-row lg:items-start lg:gap-16">
            <div className="lg:max-w-[24rem] lg:shrink-0">
              <p className={`${lede} max-w-[34ch]`}>
                Your video becomes a transcript, so deleting a word cuts it from the footage and highlighting a
                passage makes a captioned 9:16 clip
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
              <p className="mt-5 text-sm text-ink-2">No account, no upload, works in Chrome and Edge</p>
            </div>
            <div className="min-w-0 flex-1">
              <HeroTranscript />
            </div>
          </div>
        </section>

        {/* The playable demo */}
        <section aria-labelledby="try-heading" className={`${wrap} py-20 lg:py-28`}>
          <h2 id="try-heading" className={`${heading} max-w-4xl`}>
            Click a word and it&apos;s <Accent>gone</Accent>
          </h2>
          <p className={`${lede} mt-6 max-w-[44ch]`}>
            That&apos;s the whole idea, click any word to cut it from the take and click the red mark it leaves to
            bring it back
          </p>
          <div className="mt-12">
            <PlayableDemo media={DEMO_MEDIA} />
          </div>
        </section>

        {/* How it works, three steps over the editor running on its own */}
        <section id="how-it-works" aria-labelledby="how-heading" className={`${wrap} py-20 lg:py-28`}>
          <h2 id="how-heading" className={`${heading} max-w-4xl`}>
            Three steps, no <Accent>timeline</Accent> wrangling
          </h2>
          <ol className="mt-14 flex flex-col gap-10 md:flex-row md:gap-12">
            {steps.map((s, i) => (
              <li key={s.title} className="flex-1">
                <span className="font-display text-6xl font-extrabold leading-none tracking-[-0.04em] text-cut">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-16">
            <EditorDemo />
          </div>
        </section>

        {/* Privacy, as what stays and what leaves */}
        <section aria-labelledby="private-heading" className={`${wrap} py-20 lg:py-28`}>
          <h2 id="private-heading" className={heading}>
            Your video never <Accent>leaves</Accent>
          </h2>
          <div className="mt-14 flex flex-col gap-10 lg:flex-row lg:items-end lg:gap-14">
            <div>
              <p className="font-display text-[clamp(4rem,11vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.05em]">
                1 hr
              </p>
              <p className={`${lede} mt-4 max-w-[30ch]`}>
                of video stays in this tab, read from disk, cut and rendered right here, then saved back to you
              </p>
            </div>
            <svg
              aria-hidden
              viewBox="0 0 80 24"
              className="h-6 w-20 shrink-0 rotate-90 text-cut lg:mb-24 lg:rotate-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12h72M66 5l8 7-8 7" />
            </svg>
            <div>
              <p className="font-display text-[clamp(2.75rem,6vw,4.75rem)] font-extrabold leading-[0.9] tracking-[-0.045em] text-cut">
                11 MB
              </p>
              <p className="mt-4 max-w-[30ch] leading-relaxed text-ink-2">
                of audio goes out to the transcription service you pick, whether that&apos;s Deepgram, AssemblyAI or
                OpenAI, and that&apos;s all
              </p>
            </div>
          </div>
        </section>

        {/* Free, as what isn't here */}
        <section aria-labelledby="free-heading" className={`${wrap} py-20 lg:py-28`}>
          <h2 id="free-heading" className={heading}>
            Free, not <Accent>freemium</Accent>
          </h2>
          <ul
            aria-label="Not included"
            className="mt-12 flex max-w-5xl flex-wrap gap-x-[0.45em] font-display text-[clamp(2.1rem,5.6vw,4.25rem)] font-extrabold leading-[1.15] tracking-[-0.035em] text-ink/45"
          >
            {NOT_INCLUDED.map((item) => (
              <li key={item}>
                <span className="strike">{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-14 flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
            <p className="font-display text-8xl font-extrabold leading-none tracking-[-0.04em]">MIT</p>
            <div>
              <p className="text-xl font-semibold tracking-tight">Fork it, change it, ship it</p>
              <p className="mt-2 max-w-[44ch] leading-relaxed text-ink-2">
                {APP_NAME} is an open-source alternative to Descript and Opus Clip, and the whole thing is on GitHub
              </p>
            </div>
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`${primaryButton} mt-10`}>
            <StarIcon className="h-4 w-4" />
            Star on GitHub
          </a>
        </section>

        {/* Self-hosting, on an ink band */}
        <section aria-labelledby="host-heading" className="mt-8 bg-ink text-paper">
          <div className={`${wrap} py-24 lg:py-32`}>
            <h2 id="host-heading" className={`${heading} max-w-4xl`}>
              Run it yourself in <Accent>four</Accent> commands
            </h2>
            <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-paper/65">
              Your machine, your server and your transcription key, with no sign-up anywhere
            </p>
            <figure className="mt-12 max-w-3xl rounded-2xl bg-paper/[0.06] p-5 sm:p-7">
              <figcaption className="sr-only">Terminal</figcaption>
              <div className="flex items-start justify-between gap-4">
                <pre className="min-w-0 overflow-x-auto font-label text-[15px] leading-[2.2] sm:text-lg">
                  <code>
                    {COMMANDS.map((c) => (
                      <span key={c} className="block">
                        <span className="select-none text-paper/45">$ </span>
                        {c}
                      </span>
                    ))}
                  </code>
                </pre>
                <CopyButton text={COMMANDS.join("\n")} />
              </div>
            </figure>
            <a
              href={`${GITHUB_URL}#self-hosting`}
              target="_blank"
              rel="noreferrer"
              className="press mt-10 inline-flex items-center rounded-full bg-paper/10 px-6 py-3.5 font-medium transition-colors hover:bg-paper/20"
            >
              Self-hosting guide
            </a>
          </div>
        </section>

        {/* Closing call to action */}
        <section className={`${wrap} py-24 lg:py-36`}>
          <h2 className="max-w-5xl font-display text-[clamp(2.6rem,6.8vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.04em] [word-spacing:0.06em] text-balance">
            Your next clip is already in the <Accent>transcript</Accent>
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

      <footer className={`${wrap} flex flex-col gap-4 pb-10 pt-4 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between`}>
        <Mark />
        <p className="flex gap-4">
          <span>MIT licensed</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

/** The name beside the favicon's mark: three lines of transcript, the middle one cut. */
function Mark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink">
      <svg aria-hidden viewBox="0 0 32 32" className="h-6 w-6">
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <g className="fill-paper">
          <rect x="6" y="8" width="20" height="3.4" rx="1.7" />
          <rect x="6" y="14.3" width="6.5" height="3.4" rx="1.7" />
          <rect x="19.5" y="14.3" width="6.5" height="3.4" rx="1.7" />
          <rect x="6" y="20.6" width="13" height="3.4" rx="1.7" />
        </g>
        <rect x="14.6" y="12.2" width="2.8" height="7.6" rx="1.4" className="fill-cut" />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
    </Link>
  );
}

function Accent({ children }: { children: ReactNode }) {
  return <em className="font-accent font-medium italic tracking-[-0.02em]">{children}</em>;
}
