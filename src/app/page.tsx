import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME, APP_TAGLINE, GITHUB_URL } from "@/lib/config";

const features = [
  {
    title: "Edit by editing text",
    body: "Delete a word and it disappears from the video. Highlight a passage to turn it into a clip.",
  },
  {
    title: "You pick the moments",
    body: "No AI guessing which parts go viral. You stay in control of every cut.",
  },
  {
    title: "Private by design",
    body: "Your video stays in your browser. Only the extracted audio is sent for transcription.",
  },
  {
    title: "Free and open source",
    body: "MIT licensed. Run it yourself and bring your own transcription API key.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-muted transition hover:text-fg"
        >
          GitHub
        </a>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-20 pt-20 text-center">
          <p className="mb-4 inline-block rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
            Open source alternative to Descript and Opus Clip
          </p>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            {APP_TAGLINE.replace(/\.$/, "")}
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
              .
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Upload a long video, get a transcript, and cut or clip by deleting or highlighting words.
            Export vertical 9:16 clips with captions. {APP_NAME} is free, open source, and runs in your
            browser.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/editor"
              className="rounded-lg bg-accent px-6 py-3 font-medium text-white transition hover:brightness-110"
            >
              Try it free
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border bg-panel px-6 py-3 font-medium transition hover:bg-panel-2"
            >
              ★ Star on GitHub
            </a>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-panel p-5">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        {APP_NAME} is MIT licensed.
      </footer>
    </div>
  );
}
