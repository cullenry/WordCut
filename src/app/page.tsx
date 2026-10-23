import Link from "next/link";
import { TranscriptDemo } from "@/components/landing/TranscriptDemo";
import { GitHubIcon, StarIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME, APP_TAGLINE, GITHUB_URL } from "@/lib/config";

/**
 * DEMO PLACEHOLDER: put a screen recording in public/ (e.g. public/demo.mp4 or
 * public/demo.gif, 16:9, under ~8 MB) and point this at it. Until then the
 * demo section shows a marked placeholder.
 */
const DEMO_MEDIA: { src: string; kind: "video" | "image"; alt: string } | null = null;

const REPO_DIR = GITHUB_URL.split("/").pop();

const features = [
  {
    title: "Edit by editing text",
    body: "Delete a word and it disappears from the video. Highlight a passage to turn it into a clip.",
    vignette: <TextEditVignette />,
  },
  {
    title: "You pick the moments",
    body: "No AI guessing which parts go viral. You stay in control of every cut.",
    vignette: <PickVignette />,
  },
  {
    title: "Private by design",
    body: "Your video stays in your browser. Only the extracted audio is sent for transcription.",
    vignette: <PrivacyVignette />,
  },
  {
    title: "Free and open source",
    body: "MIT licensed. Run it yourself and bring your own transcription API key.",
    vignette: <LicenseVignette />,
  },
];

const steps = [
  {
    title: "Upload",
    body: "Drop in a video. It stays on your device; only its audio is sent to be transcribed, with a timestamp for every word.",
  },
  {
    title: "Edit the text",
    body: "Delete words to cut them. Remove fillers and long pauses in one go. Highlight a passage and press C to make a clip.",
  },
  {
    title: "Export",
    body: "Reframe to 9:16, pick a caption style and export an MP4. It's rendered in your browser, with no watermark.",
  },
];

const primaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 font-medium text-white transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2";
const secondaryButton =
  "press inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-panel px-5 py-3 font-medium transition-colors hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-muted transition-colors hover:text-fg"
          >
            <GitHubIcon />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link
            href="/editor"
            className="press rounded-lg bg-panel-2 px-3.5 py-2 font-medium transition-colors hover:bg-border"
          >
            Try it free
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:pb-28 lg:pt-20">
          <div>
            <h1 className="font-serif text-[clamp(2.75rem,7.5vw,4.75rem)] font-medium leading-[1.02] tracking-[-0.025em] text-balance">
              {APP_TAGLINE}
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted text-pretty">
              Delete words from the transcript to cut the video, then export captioned vertical clips.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/editor" className={primaryButton}>
                Try it free
              </Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={secondaryButton}>
                <StarIcon className="h-4 w-4 text-accent-2" />
                Star on GitHub
              </a>
            </div>
            <p className="mt-5 text-sm text-muted">No account, no upload of your video. Works in Chrome and Edge.</p>
          </div>
          <TranscriptDemo />
        </section>

        {/* Demo media */}
        <section aria-labelledby="demo-heading" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <h2 id="demo-heading" className="sr-only">
            {APP_NAME} in action
          </h2>
          <DemoMedia />
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <h2
            id="features-heading"
            className="max-w-2xl font-serif text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-balance"
          >
            The transcript is the timeline.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <article key={f.title} className="flex flex-col rounded-2xl border border-border bg-panel p-6 sm:p-7">
                <div className="mb-7 flex min-h-24 items-center" aria-hidden>
                  {f.vignette}
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 max-w-[38ch] leading-relaxed text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="border-y border-border bg-panel/50"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <h2
              id="how-heading"
              className="font-serif text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em]"
            >
              How it works
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s, i) => (
                <li key={s.title} className="relative md:pt-10">
                  {/* The rule connecting the steps; desktop only, where they sit in a row. */}
                  <span aria-hidden className="absolute left-0 right-0 top-[1.125rem] hidden h-px bg-border md:block" />
                  <span
                    aria-hidden
                    className="relative mb-4 grid h-9 w-9 place-items-center rounded-full border border-accent/50 bg-bg font-serif text-lg text-accent-2 md:absolute md:top-0 md:mb-0"
                  >
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-semibold tracking-tight md:mt-4">{s.title}</h3>
                  <p className="mt-2 max-w-[36ch] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Free and open source */}
        <section aria-labelledby="oss-heading" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:py-32">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2
                id="oss-heading"
                className="font-serif text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.02em] text-balance"
              >
                Free, open source, and yours to run.
              </h2>
              <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted">
                {APP_NAME} is an open-source alternative to Descript and Opus Clip, under the MIT licence. Run it on your
                own machine or server with your own transcription key from Deepgram, AssemblyAI or OpenAI. There&apos;s
                no account, no watermark and no subscription.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={primaryButton}>
                  <StarIcon className="h-4 w-4" />
                  Star on GitHub
                </a>
                <a href={`${GITHUB_URL}#self-hosting`} target="_blank" rel="noreferrer" className={secondaryButton}>
                  Self-hosting guide
                </a>
              </div>
            </div>
            <figure className="min-w-0 rounded-2xl border border-border bg-panel">
              <figcaption className="border-b border-border px-5 py-3 text-sm text-muted">
                Run it locally in four commands
              </figcaption>
              <pre className="overflow-x-auto px-5 py-5 text-[13px] leading-7 sm:text-sm">
                <code>
                  <span className="text-muted">$ </span>git clone {GITHUB_URL}.git{"\n"}
                  <span className="text-muted">$ </span>cd {REPO_DIR}{"\n"}
                  <span className="text-muted">$ </span>npm install{"\n"}
                  <span className="text-muted">$ </span>npm run dev
                </code>
              </pre>
            </figure>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <div className="flex flex-col items-start gap-8 rounded-2xl border border-accent/30 bg-accent/[0.07] px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
            <p className="max-w-xl font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] font-medium leading-[1.15] tracking-[-0.02em] text-balance">
              Your next clip is already in the transcript.
            </p>
            <Link href="/editor" className={`${primaryButton} w-full shrink-0 sm:w-auto`}>
              Try it free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>
            MIT licensed.{" "}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-fg hover:underline">
              Source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function DemoMedia() {
  const frame = "aspect-video w-full overflow-hidden rounded-2xl border border-border bg-panel";
  if (DEMO_MEDIA?.kind === "video") {
    return <video src={DEMO_MEDIA.src} className={frame} autoPlay muted loop playsInline aria-label={DEMO_MEDIA.alt} />;
  }
  if (DEMO_MEDIA?.kind === "image") {
    // A plain img, so an animated GIF isn't re-encoded by next/image.
    return <img src={DEMO_MEDIA.src} alt={DEMO_MEDIA.alt} className={`${frame} object-cover`} />;
  }
  return (
    <div
      className={`${frame} grid place-items-center border-dashed bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgb(255_255_255/0.025)_14px_28px)]`}
    >
      <div className="px-6 text-center">
        <p className="font-medium">Demo video placeholder</p>
        <p className="mt-2 text-sm text-muted">
          Add a 16:9 recording to <code className="text-fg">public/</code> and set <code className="text-fg">DEMO_MEDIA</code>{" "}
          in <code className="text-fg">src/app/page.tsx</code>.
        </p>
      </div>
    </div>
  );
}

/* Small pictures of each feature, drawn in the editor's own visual language. */

function TextEditVignette() {
  return (
    <p className="font-serif text-xl leading-relaxed sm:text-2xl">
      and then we <del className="cut">basically, um,</del> shipped it.
    </p>
  );
}

function PickVignette() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="font-serif text-xl leading-relaxed sm:text-2xl">
        so <span className="rounded-[3px] bg-accent/30 box-decoration-clone px-0.5">here&apos;s the bit worth sharing.</span>
      </p>
      <span className="inline-flex items-center gap-2 text-xs text-muted">
        <kbd className="grid h-6 min-w-6 place-items-center rounded-md border border-border bg-panel-2 px-1.5 font-sans text-fg">
          C
        </kbd>
        Make clip
      </span>
    </div>
  );
}

function PrivacyVignette() {
  return (
    <dl className="w-full max-w-sm space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg border border-border bg-panel-2 px-3.5 py-2.5 whitespace-nowrap">
        <dt>Your 1-hour video</dt>
        <dd className="text-muted">stays on your device</dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg border border-accent/30 px-3.5 py-2.5 whitespace-nowrap">
        <dt>Its audio, about 11 MB</dt>
        <dd className="text-accent-2">sent to transcribe</dd>
      </div>
    </dl>
  );
}

function LicenseVignette() {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-serif text-5xl font-medium tracking-[-0.03em]">MIT</span>
      <span className="text-sm text-muted">No account. No watermark. No subscription.</span>
    </div>
  );
}
