---
name: time-mapping
description: How WordCut maps between source-video time and edited time after cuts. Use when touching src/lib/edl, playback skipping, the seek slider or timeline, captions, export, or anything that converts a time between the original video and the cut video.
---

# Source time vs edited time

WordCut never changes the video or the transcript. Words keep their **source time**
(seconds in the original file) forever. Cuts are a set of deleted word ids, and the
**EDL** (edit decision list) turns those into the source spans that survive. The
**edited time** is a position in the video you would get by playing those spans
back to back.

All of this lives in `src/lib/edl/` (pure TypeScript, tested in `tests/edl.test.ts`
and `tests/time.test.ts`):

| File | What it does |
| --- | --- |
| `edl.ts` | `buildEdl(words, deleted, sourceDuration)` → `Edl`; `fromSpans`, `removedRanges`, `editedCuts`, `roundTime` |
| `time.ts` | `sourceToEdited`, `editedToSource`, `snapToKept`, `playbackJump`, `secondsUntilJump`, `rangeIndexAt` |
| `edits.ts` | Undoable ops on the deleted-id set (`deleteOp`, `restoreOp`, `applyOp`, `invertOp`) |
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
lead-in, `duration` for a cut tail). Each is drawn as a gap with a marker.

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
- Never mutate `deleted`. Every edit makes a new `Set` and a new EDL. History stores the ops
  (only the ids that changed), not snapshots, so undo stays cheap on 20k-word transcripts.
