---
name: webcodecs-export
description: How WordCut exports a clip to MP4 with WebCodecs and Mediabunny in a worker - the codecs and settings that worked, the frame and audio sync model across cuts, the font hand-off to the worker, and the pitfalls found while building it. Use when touching src/lib/media/export, the export dialog or store, renderClipFrame/caption fonts as used by export, or anything that changes how output frames or audio samples are timed.
---

# MP4 export (step 7)

A clip is exported as an MP4 in its crop's shape (9:16, 1:1, 4:5, 16:9, the source's,
or free) with its cuts, trimmed pauses, crop and captions,
entirely in the browser. The page never touches the video bytes; a worker reads the
source lazily, draws every frame with the preview's own renderer, encodes with WebCodecs
and muxes in memory.

## Files

| File | What it does |
| --- | --- |
| `src/lib/media/export/plan.ts` | Pure: frame rate choice, frame grid, frame → source lookup times, sample-exact audio segments, bitrates, file name, codec names |
| `src/lib/media/export/audio.ts` | Pure: `SegmentWriter` (streams decoded audio into one kept range, sample-exact, with fades) |
| `src/lib/media/export/progress.ts` | Pure: weighted progress, `EtaEstimator`, `formatRemaining` |
| `src/lib/media/export/protocol.ts` | Message and job types between page and worker |
| `src/lib/media/export/worker.ts` | The worker: probe, font loading, decode → render → encode → mux |
| `src/lib/media/export/client.ts` | `ExportWorker` (page side), `probeExport` (cached per File) |
| `src/lib/captions/fonts.ts` | Pure: font stack parsing, `absolutizeFontSrc`, `captionCharacters` |
| `src/components/editor/captionFont.ts` | Page side: `captionFontFaces` (reads @font-face rules), `captionFontCheck` |
| `src/store/export-store.ts` | One export at a time; owns the worker; progress, ETA, download URL |
| `src/components/editor/export/` | `ExportDialog`, `ExportPill` |

Tests: `tests/export-plan.test.ts`, `tests/export-audio.test.ts`, `tests/export-progress.test.ts`,
`tests/caption-fonts.test.ts`.

## Settings that worked (Chrome 156, Windows, Oct 2026)

| What | Setting |
| --- | --- |
| Container | `Mp4OutputFormat({ fastStart: "in-memory" })` + `BufferTarget`: moov at the front, best for uploading to social sites. The whole output is in memory (about 1 MB per second at 1080p), never the input. |
| Video | `avc` first, then `hevc`, `vp9`, `av1`. `CanvasSource(offscreenCanvas, { codec, quality: new Quality({ bitrate }), hardwareAcceleration, keyFrameInterval: 2, latencyMode: "quality" })` |
| Bitrate | `width × height × fps × 0.13`: 8.1 Mbps at 1080×1920@30, 3.6 Mbps at 720×1280@30 |
| Hardware | Probe with `canEncodeVideo(codec, { …, hardwareAcceleration: "prefer-hardware" })`; if true use `"prefer-hardware"`, else `"no-preference"`. If a hardware export throws, it is retried once in software (`exportWithFallback`). H.264 hardware worked at both 9:16 sizes. |
| Audio | AAC at the source rate if it is 44.1 or 48 kHz, else 48 kHz; Opus at 48 kHz if AAC can't be encoded (the dialog says so). 192 kbps stereo / 128 kbps mono, at most 2 channels. Resampling and downmixing are left to Mediabunny via `AudioSampleSource({ transform: { sampleRate, numberOfChannels } })`. |
| Decode | `CanvasSink(track, { width, height, fit: "fill", poolSize: 2 })` + `canvasesAtTimestamps(ascending times)`. The sink applies rotation metadata, so a portrait phone video arrives upright, the same as `<video>` shows it. It is sized so the crop is drawn at no more than output size (a 4K source is scaled once, in the sink). |
| Frame rate | The source rate measured with `computePacketStats(240)`, snapped to a common rate within 2 %, capped at 30. A faster source is divided by a whole number if that stays ≥ 24 (59.94 → 29.97, 50 → 25, 120 → 30), else 30. |

Measured: a 6.9 s clip at 1080×1920 encodes in about 1.6 s with hardware H.264.

## Sync model: one clock, two grids

Everything is planned in **clip time** (the clip's EDL, see the time-mapping skill). Video
and audio are each laid on their own fixed grid of that one clock, derived from the same
EDL, so they cannot drift apart, and nothing is ever accumulated.

**Video**: a constant frame rate. Frame `n` is at `frameTime(n) = roundTime(n / fps)` and
shows whatever the source shows at the matching source time. The ranges are walked with
a cursor using the same rule as `editedToSource`: a frame exactly on a join belongs to the
range after it. `frameCount = ceil(duration × fps)` and the last frame is shortened, so
video ends exactly at the clip's duration.

**Audio**: `audioSegments(clipEdl, rate)` turns each kept range into
`{ srcStart, outStart, length }` in samples. Each segment ends on the rounded **edited time
of its join** (`round(nextRange.offset × rate)`) and the next starts on that same sample.
So segments tile the output with no gap or overlap, and every join is within half a sample of
where the frame grid puts it. Rounding each range's length separately would drift by up to
half a sample per cut (100 samples over 200 cuts).

`SegmentWriter` streams decoded chunks into one segment. It places each chunk by its
timestamp (`round(timestamp × rate)`), skips anything before the segment or already
written, **fills gaps with silence instead of closing them up** (so what follows stays in
sync) and pads to the full length if the decoder ends early. Exactly `length` samples come
out, always. Each segment fades in and out over 4 ms (raised cosine). Cuts land in pauses
(the EDL pause rule), so the dip is inaudible, and it guarantees no click even when a cut
lands mid-waveform.

The decoded rate and channel count are read from the **first decoded sample**, not the
container: HE-AAC, for one, decodes at twice the rate it declares.

### Verified in the browser

With a synthetic source (frame index as a barcode, 1 kHz beeps at known times), three kept
ranges at off-grid times and captions on:

- every output frame showed the expected source frame, with no repeats, at 30→30 and 60→30 fps,
  1080 and 720, and with 90° rotation metadata;
- each of 15 beeps landed 0.02 ms (1 sample, the detector's threshold) from
  `sourceToEdited(beep)`, from the first range to the last: no drift;
- the largest sample-to-sample step within ±10 ms of each join was 0;
- an exported frame differed from `renderClipFrame` fed by a `<video>` element (exactly what
  the preview does) by 0.2/255 on average.

## Fonts in the worker

Canvas in a worker uses the **worker's own** `FontFaceSet` (`self.fonts`), and it can't
see the page's `@font-face` rules. next/font serves Inter under hashed URLs, so the worker
can't know them either. So the page hands the rules over:

1. `captionFontFaces(family)` reads every `CSSFontFaceRule` whose family is in the caption
   font stack (next/font's `"Inter", "Inter Fallback"`): `src` with URLs made absolute, plus
   descriptors (`unicode-range`, weight, the fallback's metric overrides).
2. The worker adds a `FontFace` for each, then
   `self.fonts.load(font, captionCharacters(pages))`, which fetches exactly the
   unicode-range subsets the captions use, and waits **before the first frame**.
3. `captionFontCheck` measures some of the clip's own caption text on the page; the worker
   measures it again after loading. A difference over 0.5 px becomes a warning in the
   finished dialog ("line breaks may differ").

Measured: the same text was 2536.56 px wide in both. With Arial in place of Inter the caption
region differed by 27/255 on average, against 0.4/255 with the real hand-off.

## Cancel, progress, responsiveness

- **One worker per export**; cancel is `worker.terminate()`. That really stops it (no
  download arrives afterwards) and frees every decoder, encoder, frame and buffer at once.
  There is nothing to clean up by hand.
- The probe runs once per `File` on its own short-lived worker (`probeExport`), so opening the
  dialog again is instant.
- Progress is posted at most every 100 ms: frames done and samples done, weighted 92/8
  (`exportFraction`). ETA uses the rate over the last 5 s (`EtaEstimator`), not since the
  start, because opening the file and warming the encoder make the first second slow.
- The page's main thread lagged at most 13 ms while exporting. Closing the dialog leaves the
  export running with a pill in the corner; edits made meanwhile don't affect it, because
  the job is a snapshot.

## Pitfalls hit

- **Frame lookups at the exact edge repeat a frame.** `editedToSource` rounds to 1 µs. When a
  kept range starts on a source frame boundary (0.7 s at 30 fps), the output grid lines up
  with the source grid, and `0.7 + 1/30` rounds to `0.733333`, a hair *before* source frame 22
  at `0.7333…`. The decoder returns "the last frame starting at or before" that time, which
  is frame 21, so 21 shows twice and 22 never does. Fix: look up `FRAME_LOOKUP_OFFSET`
  (0.1 ms) into the frame, clamped to stay inside the kept range. Any check that computes
  the expected frame with `floor(t × fps)` has the same bug, so give it the same tolerance.
- **AAC pads the end** to a whole 1024-sample frame, and Mediabunny writes no end trim. The
  audio track (and so the container) runs up to 21 ms past the video: +10.3 ms on a 6.923 s
  clip. It is silence, not drift, since the audio content ends on time. Report it honestly
  rather than claiming exact duration.
- **Output size follows the crop.** `outputSize(ratio, id)` fits the crop's ratio into the
  resolution's box (1080: 1920 long × 1080 short; 720: 1280 × 720) in even pixels, so the
  probe must check encoders at those sizes: it takes `sizes` and `probeExport` caches per
  file and size set. A free 1.42:1 crop exported at 1538 × 1080 with hardware H.264.
- **Captions scale evenly.** `paintCaptions` fits the 1080 × 1920 design space into the
  canvas with one scale and centres it; stretching it to a landscape canvas squashed the type.
- **`Object.keys` sorts integer-like keys.** `{ "1080": …, "720": … }` comes back as `720`
  first. Use an explicit order array (`RESOLUTION_IDS`).
- **`/// <reference lib="webworker" />`** in one file pulls the webworker lib into the whole
  program and clashes with `dom`. Declare the few worker-scope members needed instead (`WorkerScope`).
- **Turbopack** bundles `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`
  out of the box, including `@/` imports inside the worker.
- `snapFrameRate` once used `best === measured` to mean "nothing matched", so an exact
  60000/1001 was rounded to 59.94 and divided to 29.97 (not 30000/1001). Use a null sentinel.
- `UnsupportedInputFormatError` from `getPrimaryVideoTrack` is the "can't read this
  container" case: give it a human message.
- The download is a blob URL clicked through a temporary `<a download>`. Keep the URL until
  the export is dismissed so "Download again" works, then revoke it.
- In browser automation with a covered or minimized Chrome window, screenshots and rAF stall
  while timers run normally. Drive the UI through the DOM and measure instead.

## Not covered

No ffmpeg.wasm fallback: a browser without WebCodecs, or one that can't decode the source
codec, gets a message naming what is missing (`probe` in the worker). Long exports are
limited by memory for the output only (in-memory MP4).
