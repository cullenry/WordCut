# WordCut

Edit video by editing text. WordCut is a free, open-source, browser-based video editor for short-form creators: upload a long video, get a transcript, and cut or clip by deleting or highlighting words. Export vertical 9:16 clips with captions.

Your video never leaves your browser. Only extracted audio is sent for transcription.

![Screenshot placeholder](docs/screenshot.png)

## Status

Early development. Done so far: upload and playback, and transcription with word-level timestamps (saved in your browser, so reopening the same file restores it). Next: interactive transcript, cutting, filler removal, captioned 9:16 export.

Chrome or Edge is recommended. Other browsers may lack the WebCodecs support WordCut relies on.

## How transcription works

1. Your browser decodes the audio track and measures loudness over time.
2. The audio is split at natural pauses into chunks of up to ~15 minutes, encoded as small mono Opus files (about 3 KB per second).
3. Chunks are sent to `/api/transcribe`, which forwards them to your transcription provider and returns word timestamps.
4. The browser stitches the chunks back into one transcript.

The video file itself is never uploaded.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

```bash
npm test      # unit tests
npm run lint  # type check
```

## Transcription API key

Copy `.env.example` to `.env.local` and set your key, then restart `npm run dev`:

```bash
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=your-key-here
TRANSCRIPTION_LANGUAGE=en
```

Deepgram (Nova-3) is the supported provider today. It is fast, gives word-level timestamps and keeps filler words like "um", which the filler-removal feature needs. New Deepgram accounts include free credit. AssemblyAI and OpenAI adapters are planned.

`.env.local` is git-ignored. Never put keys in a committed file.

### Adding a provider

Implement the `TranscriptionProvider` interface in `src/server/transcription/provider.ts`, return words timed relative to the audio you were given, and register it in `src/server/transcription/index.ts`. All requests pass through a `UsageMeter` (`src/server/usage/meter.ts`), which is a no-op for self-hosting.

## Renaming the product

The product name lives in one constant: `src/lib/config.ts`.

## Licence

MIT. See [LICENSE](LICENSE).
