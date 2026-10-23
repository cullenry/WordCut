---
name: time-mapping
description: How WordCut maps between source-video time and edited time after cuts. Use when touching src/lib/edl, playback skipping, the seek slider or timeline, captions, export, or anything that converts a time between the original video and the cut video.
---

# Source time vs edited time

WordCut never changes the video or the transcript. Words keep their **source time**
(seconds in the original file) forever. Cuts are a set of deleted word ids plus a set of
**silence trims** (shortened pauses), and the **EDL** (edit decision list) turns those into
the source spans that survive. The
**edited time** is a position in the video you would get by playing those spans
back to back.

All of this lives in `src/lib/edl/` (pure TypeScript, tested in `tests/edl.test.ts`
and `tests/time.test.ts`):

| File | What it does |
| --- | --- |
| `edl.ts` | `buildEdl(words, deleted, sourceDuration, { trims })` → `Edl`; `fromSpans`, `removedRanges`, `editedCuts`, `roundTime` |
| `trims.ts` | `SilenceTrim`, `trimSpans` (trims → removed source spans), `subtractSpans`, `sanitizeTrims` |
| `time.ts` | `sourceToEdited`, `editedToSource`, `snapToKept`, `playbackJump`, `secondsUntilJump`, `rangeIndexAt` |
| `edits.ts` | Undoable ops on the deleted-id set and trims (`deleteOp`, `restoreOp`, `applyOp`, `applyTrims`, `invertOp`) |
| `history.ts` | Generic undo/redo stacks |

## Which time is which in the app

| Thing | Time base |
| --- | --- |
| `Word.start` / `Word.end`, paragraph starts | source |
| `video.currentTime`, store `currentTime` | source |
| `store.seek(t)` | source (snaps forward out of cuts) |
| `store.seekEdited(t)` | edited |
| Seek slider, time readout, Timeline, paragraph timestamps shown to the user | edited |
| Transcript highlight lookup (`findWordIndexAtTime`) | source |
| Export (step 7) | iterates `edl.ranges` in source time, writes edited time |

Rule of thumb: **store and compare in source time; convert to edited time only for display
and for anything that describes the output video.**

## The EDL

```ts
interface KeptRange { start: number; end: number; offset: number } // [start, end) source; offset = edited start
interface Edl { ranges: KeptRange[]; duration: number /* edited */; sourceDuration: number }
```

Ranges are sorted, half-open, never overlap and never touch (touching ranges are merged).
`offset` is the running sum of the lengths before it, so `duration = last.offset + last.length`.

## How cuts are placed (the pause rule)

Every word owns its own span plus a share of the pauses on either side. The video is
what the kept words own.

- A pause between **two kept** words, or **two deleted** words, is untouched.
- A pause between a **kept** and a **deleted** word is split: the kept word keeps
  `min(pause / 2, pad)` next to itself (`pad` = `DEFAULT_PAD_SECONDS` = 0.25 s) and the deleted word
  takes the rest. So cuts land in silence, never clip a kept word, and a join is at most
  2 × pad = 0.5 s of pause.
- If two words overlap or abut (pause ≤ 0), the boundary is the midpoint of `a.end` and `b.start`.
- Silence **before the first word** belongs to the first word, **after the last word** to the last
  word. Deleting the first word trims the lead-in; deleting everything gives an empty EDL.
- With no words at all, the whole source is kept.

`fromSpans` then rounds every boundary to the microsecond (`roundTime`), clamps to
`[0, sourceDuration]`, merges overlaps, drops kept slivers under 1 ms (`MIN_SPAN`) and closes
removed gaps under 1 ms.

### Worked example 1: building the EDL

Source is 6 s. Words (source seconds):

```
a 1.0–1.5   b 1.6–2.0   c 3.0–3.4   d 3.4–3.8   e 4.0–4.5
     pause 0.1    pause 1.0    pause 0      pause 0.2
```

Delete **c**:
- b→c pause is 1.0. b is kept, so it keeps `min(0.5, 0.25) = 0.25` → boundary at 2.0 + 0.25 = **2.25**.
- c→d pause is 0 → boundary at the midpoint of 3.4 and 3.4 = **3.4**.
- Kept: `[0, 2.25)` offset 0, `[3.4, 6)` offset 2.25. Edited duration = 2.25 + 2.6 = **4.85**.
- The join plays b, then 0.25 s of silence, then d. Removed: 1.15 s.

Delete **a** (first word): a→b pause 0.1, b keeps `min(0.05, 0.25) = 0.05` → kept `[1.55, 6)`.
The 1 s lead-in goes with a.

Delete **b** and **d**:

| Boundary | Pause | Rule | Cut at |
| --- | --- | --- | --- |
| a→b | 0.1 | a kept keeps 0.05 | 1.55 |
| b→c | 1.0 | c kept keeps 0.25 | 2.75 |
| c→d | 0 | midpoint | 3.4 |
| d→e | 0.2 | e kept keeps 0.1 | 3.9 |

Kept: `[0, 1.55)` @0, `[2.75, 3.4)` @1.55, `[3.9, 6)` @2.2. Duration 4.3.

Deleting **b and c** gives one cut `[1.55, 3.4)`, in whatever order they were deleted.

## Silence trims (shortened pauses)

Cleanup (step 5) shortens long pauses without deleting any word. `Word[]` stays immutable, so a
shortened pause is stored as data next to the deleted ids, not as a change to the words:

```ts
interface SilenceTrim { afterId: string; keep: number } // store: trims: Map<afterId, keep>
```

"The pause after word `afterId` is cut down to `keep` seconds" (default 0.3). The gap is always
between `words[i]` and `words[i + 1]`; the pause before the first word and after the last word
are never trimmed (those already belong to the first/last word, see the pause rule).

`trimSpans(words, trims)` turns each trim into a removed source span: the **middle** of the pause,
`keep / 2` clear of both words:

```
removed = [a.end + keep/2, b.start - keep/2]     (only if pause > keep)
```

`buildEdl` builds the kept spans from deleted words first, then **subtracts** the trim spans
(`subtractSpans`) before `fromSpans` rounds and assigns offsets. So there is still one EDL, one
time mapping, one playback path, and nothing downstream (timeline, seek, captions, export) needs to
know trims exist: a trim is just one more cut inside a kept range.

Why this composes safely:
- The span lies strictly inside a pause, so a trim can never clip a word, whatever `keep` is.
- Combined with a deletion beside the pause, the result is whichever removes more. The pause rule
  keeps up to 0.25 s next to a kept word; a trim with `keep = 0.1` then trims that to 0.05 + 0.05.
  Cleanup avoids this overlap by never trimming a pause next to a deleted word (or a filler it is
  about to delete), because the pause rule already shortens those.
- Trimming a pause that sits wholly inside a deleted run changes nothing.

### Worked example 4: a trim

Source is 12 s. Words: `a 1–2`, `b 4–5`, `c 5.1–6`, `d 9–10`. Pause after `a` is 2 s. Trim `{ afterId: "w0", keep: 0.4 }`:

- Removed span = `[2 + 0.2, 4 - 0.2]` = `[2.2, 3.8]` (1.6 s). The pause plays as 0.2 s + 0.2 s = 0.4 s.
- Kept: `[0, 2.2)` @0, `[3.8, 12)` @2.2. Duration 10.4.

| source t | edited | why |
| --- | --- | --- |
| 5 (end of b) | 3.4 | 5 − 1.6 |
| 3 | 2.2 | inside the removed span, resumes at the next range's offset |

| edited e | source | why |
| --- | --- | --- |
| 3.4 | 5 | |
| 2.2 | 3.8 | on the join |

### One undo for a whole cleanup

A cleanup is **one** history entry. `EditOp` has an optional `trims: { afterId, before, after }[]`
next to `ids`. `applyOp` handles `ids`, `applyTrims` handles `trims`, and `invertOp` swaps
`before`/`after` and flips delete/restore, so one Ctrl+Z reverts every filler and every pause. `before` is
the earlier keep (or `null`), so re-trimming an already trimmed pause also undoes exactly.

Trims are saved with the project as `edits.silenceTrims` (absent in older projects) and checked
with `sanitizeTrims`, like deleted ids. They are cleared on re-transcribe.

## Mapping functions

### `sourceToEdited(edl, t)`

Find the last range with `start <= t` (binary search).
- Inside it (`t < end`): `offset + (t - start)`.
- In a cut: the **resume point**, i.e. the next range's `offset` (or `duration` if none follows).
- Before the first range: 0. After the last: `duration`.

### `editedToSource(edl, e)`

Clamp `e` to `[0, duration]`, find the last range with `offset <= e`, return `start + (e - offset)`.
- A time exactly on a join belongs to the **following** range (half-open ranges).
- `e = duration` maps to the **end** of the last range.
- Empty EDL maps everything to 0.

### Worked example 2: mapping

Kept `[1, 2)` @0, `[3, 5)` @1, `[7, 8)` @3 in a 10 s source (edited duration 4).

| source t | edited | why |
| --- | --- | --- |
| 0 | 0 | lead-in is cut; resumes at range 0 |
| 1.5 | 0.5 | 0 + (1.5 − 1) |
| 2 | 1 | 2 is the excluded end of range 0, so a cut; resumes at range 1's offset |
| 2.5 | 1 | in a cut |
| 4 | 2 | 1 + (4 − 3) |
| 7.5 | 3.5 | 3 + (7.5 − 7) |
| 9 | 4 | tail is cut → duration |

| edited e | source | why |
| --- | --- | --- |
| 0 | 1 | |
| 1 | 3 | on a join → following range |
| 2 | 4 | |
| 3 | 7 | on a join |
| 4 | 8 | edited end → end of last range |
| −1 / 99 | 1 / 8 | clamped |

### Round trips

- `editedToSource(sourceToEdited(t)) === t` for every **kept** `t` (tested at every ms).
- `sourceToEdited(editedToSource(e)) === e` for every `e` in `[0, duration]`.
- For a `t` inside a cut, the round trip lands on the resume point (2.5 → 1 → 3). This is
  intended: a cut time has no edited position of its own.

Use exact equality in tests only for millisecond inputs; both directions run through
`roundTime`, so float noise is removed at 1e-6. For arbitrary floats assert `< 1e-6`.

## Playback

`VideoPreview` keeps playback inside the kept ranges:

- `playbackJump(edl, t, lookahead)` returns `null` (keep playing), a source time to seek to, or
  `"end"` (pause at the last kept frame). It fires `lookahead` seconds **before** the end of a
  range, because the playhead is only polled once a frame and a seek takes a moment to land.
  Since cuts sit inside pauses, jumping early only trims silence.
- `SKIP_LOOKAHEAD` is 0.03 s of wall-clock time, multiplied by `playbackRate`.
- The lookahead is capped at half the range length so a very short kept word still plays.
- If the last range runs to the end of the source, playback ends naturally (no `"end"`).
- Three triggers call the same `follow()`: rAF every frame, a `setTimeout` aimed at
  `secondsUntilJump(...) / playbackRate` (rAF is throttled when the window is covered), and
  `timeupdate` as a backstop for background tabs.
- `togglePlay` snaps the start position to a kept frame first, and restarts from the first kept
  range when at the edited end.

Measured in Chrome: with a cut starting at 2.37, the jump fired at 2.345 and landed on 2.92.

### Worked example 3: lookahead

Ranges `[1, 2)` and `[3, 5)`, lookahead 0.03:
- t = 1.96 → `null`; t = 1.975 → jump to 3 (≥ 2 − 0.03).
- `secondsUntilJump(edl, 1.5, 0.03)` = 2 − 0.03 − 1.5 = 0.47 s → timer set for 470 ms at 1×, 235 ms at 2×.
- Range `[1, 1.04)` (a 40 ms word): early = min(0.03, 0.02) = 0.02, so the jump fires at 1.02, not 1.01.

## Timeline

The timeline is drawn in **edited** time: kept ranges laid end to end. `editedCuts(edl)`
gives one `{ at, removed }` per cut, where `at` is the join on the edited timeline (0 for a cut
lead-in, `duration` for a cut tail). Each is drawn as a gap with a marker. A trimmed pause is a
cut like any other, so it gets a marker too.

While the cleanup review is open nothing is applied yet, so its markers are drawn on the
**current** edited timeline: each pause as the band `sourceToEdited(cutStart)`..`sourceToEdited(cutEnd)`
(the part that will go; both ends are inside a kept range) and each filler at its word's span.

## Clips and captions (step 6)

A **clip** stores only a source range `[start, end)`. It never stores edited time, so it follows
cuts and trims made before or after it was created.

- `clipEdl(edl, start, end)` (`src/lib/clips/range.ts`) returns the kept ranges inside the clip,
  re-based so offsets start at 0. It is an ordinary `Edl`, so `sourceToEdited`, `editedToSource`,
  `playbackJump` and `secondsUntilJump` all work on a clip unchanged, in **clip time**.
- In the clips panel `selectPlayEdl(state)` returns the clip EDL instead of the full one. Playback,
  the seek bar, `togglePlay`, the arrow-key seek and the 9:16 canvas all read it, so there is one
  playback path for both views.
- A clip made from words is padded by up to `CLIP_PAD` (0.12 s) each side, never more than half the
  pause to the neighbouring word. A clip that starts or ends on a cut word simply starts at the first
  kept range inside it; restoring the words later grows the clip back.
- Clip duration is `clipEdl(...).duration`, never `end - start`. Zero means everything in it is cut;
  `makeClip` refuses that, and an existing clip shows "Everything is cut".

**Captions are built in clip time.** `captionWordsFor` drops cut words and maps each remaining word
with `sourceToEdited(clipEdl, t)`, so words either side of a cut are adjacent and group into one line.
`groupCaptionPages` then makes pages of up to 2 lines of about 4 words (new page on a pause of 0.7 s
or a sentence end). The renderer is given clip time: `sourceToEdited(clipEdl, video.currentTime)` in the
preview. **The export worker must iterate `clipEdl.ranges` and pass clip time the same way** (a frame at
source time `t` has clip time `sourceToEdited(clipEdl, t)`), and call `renderClipFrame`, nothing else.

| Thing | Time base |
| --- | --- |
| `Clip.start` / `Clip.end` | source |
| `CaptionWord`, `CaptionPage`, `drawCaptions(t)` | clip (edited, from the clip start) |
| Clip list "at 0:42" | full edited timeline |
| Seek bar / readout in clip view | clip |

## Pitfalls

- Don't compare a source time against `edl.duration`, or an edited time against `Word.start`.
  Name variables `edited`/`source` when both are in scope.
- `snapToKept` returns `null` past the last kept range. Decide what to do (usually seek to the last
  range's end) rather than falling back to the raw time.
- A word's `start` is always inside its own kept range (its ownership starts at or before
  `start`), so `seek(word.start)` lands on the word. The highlight lookup can still return a
  **deleted** word just after a cut (hold time), so filter deleted words out of the active index.
- Word ids are positional (`w0`, `w1`, …). Re-transcribing makes old deleted ids meaningless,
  so edits and history are reset when a new transcript arrives, and `sanitizeDeleted` drops
  unknown ids when loading a saved project.
- Trims are keyed by the id of the word **before** the gap. Don't key them by time: the transcript
  is the source of truth for where a pause is, and a trim must keep meaning the same pause.
- Never mutate `deleted` or `trims`. Every edit makes a new `Set`/`Map` and a new EDL. History stores the ops
  (only the ids that changed), not snapshots, so undo stays cheap on 20k-word transcripts.
