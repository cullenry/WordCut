# Contributing to WordCut

Thanks for helping. Bug reports, fixes and features are all welcome.

## Getting set up

```bash
git clone https://github.com/cullenry/ScriptCut.git
cd ScriptCut
npm install
cp .env.example .env.local   # add one transcription key
npm run dev
```

Use Chrome or Edge, since WordCut relies on WebCodecs. You only need a transcription key to test transcription. Everything else works on a project that's already transcribed.

Before you open a pull request, run the same checks as CI:

```bash
npm run lint   # type check
npm test       # unit tests
```

## Project rules

These keep WordCut fast, private and easy to work on. Pull requests that break them will be asked to change.

- **The video never leaves the browser.** Only extracted audio goes to `/api/transcribe`.
- **Don't load whole videos into memory.** Never call `file.arrayBuffer()` on the video. Use object URLs and Mediabunny's lazy reads.
- **Editing is non-destructive.** The `Word[]` transcript is never mutated. Edits are stored as deleted word ids and silence trims.
- **One caption renderer.** The preview and the export draw captions with the same code.
- **`src/lib/` is pure TypeScript.** No React or Next imports, and every function there has Vitest tests.
- **Transcription goes through `TranscriptionProvider`, and billing through `UsageMeter`.** Each new provider gets a normalisation function with tests that use recorded responses, never live API calls.
- **The product name comes from `src/lib/config.ts`.** Don't hard-code it.

## Pull requests

- Keep each pull request to one change, and describe what it does and how you tested it.
- Add or update tests for anything in `src/lib/` or `src/server/`.
- For UI changes, include a screenshot or short recording.
- Keep animations short (under 300 ms), on `transform` and `opacity` only, and respect `prefers-reduced-motion`. Don't animate actions people repeat many times, like cutting a word.
- For larger features, open an issue first so we can agree on the approach.

## Reporting bugs

Use the [bug report template](https://github.com/cullenry/ScriptCut/issues/new?template=bug_report.md). Include your browser and version, what you did, and what happened. Please don't attach videos you can't share publicly.

## Licence

By contributing, you agree that your contributions are licensed under the [MIT licence](LICENSE).
