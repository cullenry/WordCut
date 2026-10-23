# WordCut
Free open-source browser video editor: edit video by editing the transcript.

## Rules
- Video files never leave the browser. Only extracted audio goes to /api/transcribe.
- Never call file.arrayBuffer() on the whole video. Use object URLs and Mediabunny's lazy reads.
- Editing is non-destructive: Word[] stays immutable, edits are stored as deleted word IDs + silence cuts.
- Preview and export share one caption renderer.
- src/lib/ is pure TypeScript with no React or Next imports, and every function there gets Vitest tests.
- Transcription goes through the TranscriptionProvider interface. Billing goes through UsageMeter.
- Product name comes from src/lib/config.ts only.

## Skills roadmap (remind the user when each stage is reached)
Installed now: frontend-design, emil-design-eng.

- After the editor works (around step 6 or 7): install review-animations and improve-animations (emilkowalski/skills). Optionally vercel-react-best-practices (vercel-labs/agent-skills) for large transcripts.
- After step 4 (cutting): write a time-mapping skill explaining original-time to edited-time mapping, with worked examples.
- After step 7 (export): write a webcodecs-export skill recording codecs and settings that worked, Mediabunny patterns, and pitfalls.
- Near the end: write a launch skill, a checklist for README screenshots, the GitHub release, and Reddit and Hacker News post drafts.
- Skip big design packs (e.g. UI/UX Pro Max) and skills for unused tools (e.g. Supabase) until a real gap appears.
- If an npx install fails, check the skill GitHub page for the current command.
