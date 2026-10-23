# WordCut

Edit video by editing text. WordCut is a free, open-source, browser-based video editor for short-form creators: upload a long video, get a transcript, and cut or clip by deleting or highlighting words. Export vertical 9:16 clips with captions.

Your video never leaves your browser. Only extracted audio is sent for transcription.

![Screenshot placeholder](docs/screenshot.png)

## Status

Early development. Done so far: upload and playback with the three-pane editor layout. Next: transcription, interactive transcript, cutting, filler removal, captioned 9:16 export.

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

Transcription arrives in step 2. Copy `.env.example` to `.env.local`, choose a provider with `TRANSCRIPTION_PROVIDER` (`deepgram`, `assemblyai` or `openai`) and set the key for that provider. Providers are swappable, so self-hosters bring their own key.

## Renaming the product

The product name lives in one constant: `src/lib/config.ts`.

## Licence

MIT. See [LICENSE](LICENSE).
