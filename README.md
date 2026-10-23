# WordCut

**Edit video by editing text.** WordCut is a free, open-source video editor that runs in your browser. Upload a long video and get a transcript. Delete words to cut them from the video, or highlight a passage to turn it into a clip. Then export vertical 9:16 clips with captions.

Your video never leaves your browser. Only the extracted audio is sent for transcription.

## Why

Cutting a podcast, interview or talk into short clips usually means scrubbing a timeline for the good bits, cutting around every "um" and long pause, then reframing and captioning each clip by hand. Paid tools like Descript and Opus Clip fix this, but they cost a monthly fee, upload your whole video to their servers, and (in Opus Clip's case) let an AI choose your moments.

In WordCut, the transcript is the timeline. You read it, delete what you don't want and pick the moments yourself. It runs in your browser, is MIT licensed, and you can host it yourself with your own transcription key.

## Features

- **Edit by editing text.** Select words and press Delete to cut them, and click a cut word to restore it. Undo and redo work, and playback skips the cuts.
- **Clean up.** Find filler words ("um", "uh", optionally "like" and "you know") and long pauses, review them, and remove them in one go.
- **Clips.** Select words and press C to make a clip. Reframe it to 9:16 and add word-by-word captions in three styles.
- **Export in the browser.** MP4 at 1080x1920 or 720x1280, with cuts, trimmed pauses, crop and captions burned in, encoded with WebCodecs. No watermark.
- **Private by design.** The video file is never uploaded. Only small mono audio chunks (about 11 MB per hour) go to the transcription provider.
- **Saved automatically.** The transcript and your edits are stored in your browser, so reopening the same file restores them.
- **Bring your own transcription.** Deepgram (default), AssemblyAI or OpenAI.

## Screenshots

> Placeholders. Add images to `docs/screenshots/` and replace these lines.

<!-- SCREENSHOT: docs/screenshots/landing.png (landing page, 1440x900) -->
_Screenshot placeholder: the landing page._

<!-- SCREENSHOT: docs/screenshots/editor.png (editor with a transcript open and some words cut) -->
_Screenshot placeholder: the editor, with cut words struck through in the transcript._

<!-- SCREENSHOT: docs/screenshots/clip.png (a 9:16 clip with captions in the preview) -->
_Screenshot placeholder: a 9:16 clip with word-by-word captions._

## Browser support

WordCut needs **Chrome or Edge** for now (desktop, recent versions). It decodes and encodes video with [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), which other browsers don't fully support yet. The editor shows a banner on browsers without it. The landing page works everywhere. Support for other browsers is on the [roadmap](#roadmap).

WebCodecs is only available on secure pages, so WordCut must be served over HTTPS or from `localhost`.

## Run locally

Requires Node.js 20 or newer.

```bash
git clone https://github.com/cullenry/ScriptCut.git
cd ScriptCut
npm install
cp .env.example .env.local   # then add a transcription key, see below
npm run dev
```

Open http://localhost:3000.

```bash
npm test      # unit tests (Vitest)
npm run lint  # type check
```

## Add your transcription API key

Transcription runs on the server (`/api/transcribe`), so your key stays out of the browser. Pick a provider with `TRANSCRIPTION_PROVIDER` and set its key in `.env.local`, then restart `npm run dev`:

```bash
TRANSCRIPTION_PROVIDER=deepgram   # deepgram | assemblyai | openai
DEEPGRAM_API_KEY=your-key-here
TRANSCRIPTION_LANGUAGE=en
```

| Provider | Env var | Notes |
| --- | --- | --- |
| [Deepgram](https://deepgram.com) (default) | `DEEPGRAM_API_KEY` | Nova-3. Fast, word timestamps, speaker labels, and keeps filler words. New accounts get free credit. |
| [AssemblyAI](https://www.assemblyai.com) | `ASSEMBLYAI_API_KEY` | Word timestamps and speaker labels, and keeps filler words (WordCut asks for them). Jobs are queued and polled, so it's a little slower. WordCut deletes each job and its audio from AssemblyAI once it has the words. |
| [OpenAI](https://platform.openai.com) | `OPENAI_API_KEY` | Uses `whisper-1`, the only OpenAI model that returns word timestamps. No speaker labels. See the warning below. |

> [!WARNING]
> **OpenAI's Whisper tends to remove filler words.** It writes "um, so, uh, I think" as "So I think". Those words never reach the transcript, so the **Clean up** feature has little or nothing to find, and the hesitations stay in the video. WordCut sends OpenAI's suggested prompt for keeping fillers, which helps a little but isn't reliable. If you want Clean up, use Deepgram or AssemblyAI.

Whichever provider you choose, each adapter's response is converted to the same word format (text with punctuation, start and end in seconds, confidence, and an optional speaker), so the editor works the same with all three.

`.env.local` is git-ignored. Never put keys in a committed file.

### How transcription works

1. Your browser decodes the audio track and measures loudness over time.
2. The audio is split at natural pauses into chunks of up to 15 minutes, encoded as small mono Opus files (about 3 KB per second).
3. Each chunk is sent to `/api/transcribe`, which passes it to your provider and returns word timestamps.
4. The browser stitches the chunks back into one transcript.

### Adding a provider

Implement the `TranscriptionProvider` interface in `src/server/transcription/provider.ts`. Return words timed relative to the audio you were given, with a `normalize…Response` function that has Vitest tests using a recorded response. Then register it in `src/server/transcription/index.ts`. Every request passes through a `UsageMeter` (`src/server/usage/meter.ts`), which does nothing when self-hosting.

## Self-hosting

WordCut is a standard Next.js app with one server route, `/api/transcribe`, which needs your provider key. Everything else (decoding, editing, rendering and export) happens in the visitor's browser, so a small server is enough.

**Any Node host:**

```bash
npm install
npm run build
TRANSCRIPTION_PROVIDER=deepgram DEEPGRAM_API_KEY=... npm start
```

Put it behind HTTPS (for example a reverse proxy like Caddy or nginx). Browsers hide WebCodecs on plain HTTP pages, and the editor will say so.

**Vercel:** import the repo and add `TRANSCRIPTION_PROVIDER` and your key as environment variables. Audio chunks are kept under 4 MB to fit Vercel's request body limit. `/api/transcribe` allows up to 300 seconds, which AssemblyAI's queue-and-poll flow can need for long chunks.

Things to know:

- There are no accounts and no database. Projects are saved in each visitor's browser (IndexedDB).
- Anyone who can reach your instance can spend your transcription credit. To keep it private, put it behind your host's access controls or a reverse proxy with authentication.
- `UsageMeter` is the hook for limits or billing. The default allows everything.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) and React 19, in TypeScript
- [Tailwind CSS](https://tailwindcss.com) 4
- [Zustand](https://zustand.docs.pmnd.rs) for editor state, with IndexedDB for saved projects
- [Mediabunny](https://mediabunny.dev) and WebCodecs for lazy demuxing, decoding, encoding and MP4 muxing, with export running in a Web Worker
- Canvas 2D captions, with one renderer shared by the preview and the export
- Deepgram, AssemblyAI or OpenAI for transcription
- [Vitest](https://vitest.dev) for unit tests

The product name, tagline and GitHub URL live in one file: `src/lib/config.ts`.

## Roadmap

- **Firefox and Safari support** through an [ffmpeg.wasm](https://ffmpegwasm.netlify.app) fallback for decoding and export where WebCodecs is missing.
- **Free in-browser transcription** with Whisper running locally (WebGPU), so you don't need an API key and the audio never leaves your device either.
- **AI auto-clipping** that suggests clip-worthy moments from the transcript, as suggestions you accept or ignore. You still pick.
- **Face tracking for the 9:16 crop**, so the frame follows the speaker instead of staying at a fixed position.

Have an idea? [Open an issue](https://github.com/cullenry/ScriptCut/issues).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, project rules and how to open a pull request. To report a bug, [open an issue](https://github.com/cullenry/ScriptCut/issues/new?template=bug_report.md).

## Licence

MIT. See [LICENSE](LICENSE).
