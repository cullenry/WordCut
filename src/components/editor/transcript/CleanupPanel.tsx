"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { applyOp, applyTrims } from "@/lib/edl/edits";
import { buildEdl } from "@/lib/edl/edl";
import { sourceToEdited } from "@/lib/edl/time";
import { formatDuration, formatTime } from "@/lib/format";
import { cleanupOp, countPlan, type PlannedFiller, type PlannedSilence } from "@/lib/transcript/cleanup";
import { MAX_THRESHOLD, MIN_THRESHOLD } from "@/lib/transcript/silences";
import { useEditorStore, type CleanupReview } from "@/store/editor-store";

/** Seconds of lead-in when jumping to an item, so you hear it in context. */
const LEAD_IN = 0.8;

/**
 * Review before applying: every filler and long pause that a cleanup would
 * touch, each with a checkbox. The same plan drives the highlights in the
 * transcript and the markers on the timeline; nothing changes until Apply.
 */
export function CleanupPanel() {
  const review = useEditorStore((s) => s.cleanup);
  return review ? <Panel review={review} /> : null;
}

function Panel({ review }: { review: CleanupReview }) {
  const { plan, settings } = review;
  const { setCleanupSettings, toggleCleanupItem, setCleanupGroup, applyCleanup, closeCleanup, seek } =
    useEditorStore.getState();
  const counts = countPlan(plan);
  const nothingTicked = counts.fillers + counts.silences === 0;

  const saved = useSavedSeconds(review);
  const edl = useEditorStore((s) => s.edl);
  // Timestamps are on the edited timeline, like everywhere else the user sees a time.
  const editedAt = (source: number) => (edl ? sourceToEdited(edl, source) : source);

  // Esc cancels, Enter applies. A focused button keeps its own Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "Escape") {
        e.preventDefault();
        closeCleanup();
      } else if (e.code === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        applyCleanup(); // does nothing when no item is ticked
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyCleanup, closeCleanup]);

  const summary = [
    counts.fillers > 0 && `${counts.fillers} ${counts.fillers === 1 ? "filler" : "fillers"}`,
    counts.silences > 0 && `${counts.silences} ${counts.silences === 1 ? "pause" : "pauses"}`,
  ].filter(Boolean);

  return (
    <section aria-label="Clean up" className="sheet flex max-h-[58%] min-h-0 flex-col border-t border-border bg-panel-2">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-sm font-medium">Clean up</h2>
        <button
          onClick={closeCleanup}
          aria-label="Cancel clean up"
          className="press grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-fg"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        <Group
          title="Fillers"
          items={plan.fillers}
          onToggleAll={(on) => setCleanupGroup("fillers", on)}
          empty={settings.phrases ? "No fillers found." : "No um, uh or er found."}
          controls={
            <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={settings.phrases}
                onChange={(e) => setCleanupSettings({ phrases: e.target.checked })}
                className="accent-accent"
              />
              Also suggest &ldquo;like&rdquo;, &ldquo;you know&rdquo;, &ldquo;I mean&rdquo;&hellip;
            </label>
          }
        >
          {plan.fillers.map((f) => (
            <FillerItem key={f.key} item={f} time={editedAt(f.start)} onToggle={toggleCleanupItem} onSeek={seek} />
          ))}
        </Group>

        <Group
          title="Long pauses"
          items={plan.silences}
          onToggleAll={(on) => setCleanupGroup("silences", on)}
          empty={`No pauses longer than ${formatDuration(settings.threshold)}.`}
          controls={
            <div className="space-y-1 py-1">
              <Slider
                label="Longer than"
                value={settings.threshold}
                min={MIN_THRESHOLD}
                max={MAX_THRESHOLD}
                step={0.1}
                onChange={(threshold) => setCleanupSettings({ threshold })}
              />
              <Slider
                label="Shorten to"
                value={Math.min(settings.keep, settings.threshold)}
                min={0.1}
                max={0.5}
                step={0.05}
                onChange={(keep) => setCleanupSettings({ keep })}
              />
            </div>
          }
        >
          {plan.silences.map((s) => (
            <SilenceItem key={s.key} item={s} time={editedAt(s.start)} onToggle={toggleCleanupItem} onSeek={seek} />
          ))}
        </Group>
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-2.5">
        <p className="min-w-0 flex-1 text-xs tabular-nums text-muted">
          {nothingTicked ? (
            "Nothing selected"
          ) : (
            <>
              <span className="text-fg">{summary.join(" · ")}</span>
              {saved > 0.05 && <> · saves {formatDuration(saved)}</>}
            </>
          )}
        </p>
        <button
          onClick={closeCleanup}
          className="press rounded-md px-3 py-1.5 text-xs text-muted hover:bg-white/10 hover:text-fg"
        >
          Cancel
        </button>
        <button
          onClick={applyCleanup}
          disabled={nothingTicked}
          className="press rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:cursor-default disabled:opacity-40 disabled:hover:brightness-100"
        >
          Apply
        </button>
      </div>
    </section>
  );
}

/** Seconds the ticked items would remove, measured with the real EDL builder. */
function useSavedSeconds({ plan }: CleanupReview): number {
  const transcript = useEditorStore((s) => s.transcript);
  const source = useEditorStore((s) => s.source);
  const deleted = useEditorStore((s) => s.deleted);
  const trims = useEditorStore((s) => s.trims);
  const edl = useEditorStore((s) => s.edl);
  return useMemo(() => {
    const op = cleanupOp(plan);
    if (!op || !transcript || !source || !edl) return 0;
    const after = buildEdl(transcript.words, applyOp(deleted, op), source.meta.duration, {
      trims: applyTrims(trims, op),
    });
    return edl.duration - after.duration;
  }, [plan, transcript, source, deleted, trims, edl]);
}

function Group({
  title,
  items,
  onToggleAll,
  empty,
  controls,
  children,
}: {
  title: string;
  items: readonly { included: boolean }[];
  onToggleAll: (on: boolean) => void;
  empty: string;
  controls: ReactNode;
  children: ReactNode;
}) {
  const ticked = items.filter((i) => i.included).length;
  return (
    <div className="border-t border-border/60 py-2 first:border-t-0">
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          aria-label={`${title}: select all`}
          disabled={items.length === 0}
          checked={items.length > 0 && ticked === items.length}
          ref={(el) => {
            if (el) el.indeterminate = ticked > 0 && ticked < items.length;
          }}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="accent-accent"
        />
        <h3 className="text-xs font-medium">{title}</h3>
        <span className="text-xs tabular-nums text-muted">
          {items.length > 0 && (ticked === items.length ? items.length : `${ticked} of ${items.length}`)}
        </span>
      </div>
      <div className="pl-[1.625rem]">
        {controls}
        {items.length === 0 ? <p className="py-1.5 text-xs text-muted">{empty}</p> : <ul className="mt-0.5">{children}</ul>}
      </div>
    </div>
  );
}

function ItemRow({
  included,
  label,
  onToggle,
  onSeek,
  time,
  children,
}: {
  included: boolean;
  label: string;
  onToggle: () => void;
  onSeek: () => void;
  time: number;
  children: ReactNode;
}) {
  return (
    // Rows past the fold skip layout and paint, so a few hundred stay instant.
    <li className="item flex items-center gap-2.5 rounded-md hover:bg-white/5">
      <input
        type="checkbox"
        aria-label={label}
        checked={included}
        onChange={onToggle}
        className="accent-accent"
      />
      <button
        onClick={onSeek}
        className={`flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-left text-xs ${included ? "" : "opacity-50"}`}
      >
        <span className="min-w-0 truncate">{children}</span>
        <span className="shrink-0 tabular-nums text-muted">{formatTime(time)}</span>
      </button>
    </li>
  );
}

function FillerItem({
  item,
  time,
  onToggle,
  onSeek,
}: {
  item: PlannedFiller;
  time: number;
  onToggle: (key: string) => void;
  onSeek: (t: number) => void;
}) {
  return (
    <ItemRow
      included={item.included}
      label={`Remove ${item.text}`}
      onToggle={() => onToggle(item.key)}
      onSeek={() => onSeek(Math.max(0, item.start - LEAD_IN))}
      time={time}
    >
      <span className="rounded bg-amber-400/20 px-1 text-amber-100">{item.text}</span>
    </ItemRow>
  );
}

function SilenceItem({
  item,
  time,
  onToggle,
  onSeek,
}: {
  item: PlannedSilence;
  time: number;
  onToggle: (key: string) => void;
  onSeek: (t: number) => void;
}) {
  return (
    <ItemRow
      included={item.included}
      label={`Shorten the ${formatDuration(item.pause)} pause`}
      onToggle={() => onToggle(item.key)}
      onSeek={() => onSeek(Math.max(0, item.start - LEAD_IN))}
      time={time}
    >
      <span className="tabular-nums">
        {formatDuration(item.pause)} <span className="text-muted">&rarr;</span> {formatDuration(item.keep)}
      </span>
    </ItemRow>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-muted">
      <span className="w-[4.75rem] shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 min-w-0 flex-1 accent-accent"
      />
      <span className="w-9 shrink-0 text-right tabular-nums text-fg">{formatDuration(value)}</span>
    </label>
  );
}
