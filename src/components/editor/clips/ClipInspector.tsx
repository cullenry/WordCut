"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { primaryButton } from "@/components/ui/buttons";
import { drawCaptionSample } from "@/lib/captions/sample";
import {
  CAPTION_COLORS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  DEFAULT_CAPTIONS,
  SIZE_MAX,
  SIZE_MIN,
  parseHex,
  type CaptionPosition,
  type CaptionSettings,
  type CaptionStyleId,
} from "@/lib/captions/types";
import type { Clip } from "@/lib/clips/types";
import { percentOf } from "@/lib/media/export/progress";
import { selectPlayEdl, useEditorStore } from "@/store/editor-store";
import { useExportStore } from "@/store/export-store";
import { captionFontFamily, ensureCaptionFonts } from "../captionFont";
import { CropEditor } from "./CropEditor";

const STYLE_LABELS: Record<CaptionStyleId, { name: string; hint: string }> = {
  bold: { name: "Bold", hint: "Big, outlined, pops on each word" },
  minimal: { name: "Clean", hint: "Light type with a soft shadow" },
  boxed: { name: "Boxed", hint: "On a dark card, spoken word filled in" },
};

/** Crop and caption controls for the selected clip. Every change is live in the preview and one undo step per gesture. */
export function ClipInspector({ clip }: { clip: Clip }) {
  const editClip = useEditorStore((s) => s.editClip);
  const setCaptions = (captions: Partial<CaptionSettings>) => editClip(clip.id, { captions });
  const c = clip.captions;

  return (
    <div className="space-y-6 px-4 py-4">
      <ExportRow clipId={clip.id} />

      <section aria-label="Crop">
        <h3 className="text-sm font-medium">Crop</h3>
        <CropEditor clip={clip} />
      </section>

      <section aria-label="Captions">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Captions</h3>
          <Switch checked={c.enabled} label="Show captions" onChange={(enabled) => setCaptions({ enabled })} />
        </div>

        {c.enabled && (
          <div className="mt-3 space-y-4">
            <div role="radiogroup" aria-label="Caption style" className="space-y-1.5">
              {CAPTION_STYLES.map((style) => (
                <StyleCard
                  key={style}
                  style={style}
                  settings={c}
                  selected={c.style === style}
                  onSelect={() => setCaptions({ style })}
                />
              ))}
            </div>

            <Field label="Position">
              <Segmented
                label="Caption position"
                value={c.position}
                options={CAPTION_POSITIONS.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1), icon: <PositionIcon at={p} /> }))}
                onChange={(position) => setCaptions({ position })}
              />
            </Field>

            <Field label="Size" value={`${Math.round(c.size * 100)}%`}>
              <input
                type="range"
                min={SIZE_MIN}
                max={SIZE_MAX}
                step={0.05}
                value={c.size}
                onChange={(e) => setCaptions({ size: Number(e.target.value) })}
                aria-label="Caption size"
                className="h-1 w-full accent-ink"
              />
            </Field>

            <Field label="Highlight colour">
              <ColorPicker value={c.color} onChange={(color) => setCaptions({ color })} />
            </Field>
          </div>
        )}
      </section>
    </div>
  );
}

/** Opens the export dialog; shows the export's progress while this clip is exporting. */
function ExportRow({ clipId }: { clipId: string }) {
  // The inspector's clip is the one being previewed, so the play EDL is its EDL.
  const duration = useEditorStore((s) => selectPlayEdl(s)?.duration ?? 0);
  const openDialog = useExportStore((s) => s.openDialog);
  const progress = useExportStore((s) =>
    s.status.state === "running" && s.status.clipId === clipId ? percentOf(s.status.fraction) : null,
  );
  return (
    <button
      onClick={() => openDialog(clipId)}
      disabled={duration <= 0}
      title={duration <= 0 ? "Everything in this clip is cut" : "Export an MP4 of this clip"}
      className={`${primaryButton} w-full`}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
      </svg>
      {progress === null ? "Export MP4" : <span className="tabular-nums">Exporting… {progress}%</span>}
    </button>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2">
        <span>{label}</span>
        {value && <span className="font-label text-[11px] text-ink">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`press relative h-5 w-9 rounded-full transition-colors duration-150 ${checked ? "bg-ink" : "bg-ink/20"}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform duration-150 ${checked ? "bg-paper" : "bg-ink"}`}
        style={{ transform: checked ? "translateX(16px)" : "none", transitionTimingFunction: "var(--ease-out)" }}
      />
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-0.5 rounded-full border border-rule p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`press flex items-center justify-center gap-1.5 rounded-full py-1.5 text-xs ${
            o.value === value ? "bg-ink/10 text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A phone outline with a bar where the captions go. */
function PositionIcon({ at }: { at: CaptionPosition }) {
  const y = at === "top" ? 4 : at === "middle" ? 7.5 : 11;
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" />
      <path d={`M6.5 ${y}h3`} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

const toHex6 = (color: string): string => {
  const rgb = parseHex(color);
  return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}` : DEFAULT_CAPTIONS.color;
};

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const preset = CAPTION_COLORS.some((c) => c.value.toLowerCase() === value.toLowerCase());
  return (
    <div role="radiogroup" aria-label="Highlight colour" className="flex items-center gap-2">
      {CAPTION_COLORS.map((c) => {
        const on = c.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.value}
            role="radio"
            aria-checked={on}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange(c.value)}
            className="press h-6 w-6 rounded-full"
            style={{ background: c.value, boxShadow: on ? `0 0 0 2px var(--paper), 0 0 0 4px ${c.value}` : undefined }}
          />
        );
      })}
      <label
        title="Custom colour"
        className="press relative grid h-6 w-6 cursor-pointer place-items-center overflow-hidden rounded-full"
        style={{
          background: preset ? "conic-gradient(#ff5c93, #ffd60a, #a3e635, #22d3ee, #a78bfa, #ff5c93)" : value,
          boxShadow: preset ? undefined : `0 0 0 2px var(--paper), 0 0 0 4px ${value}`,
        }}
      >
        <input
          type="color"
          value={toHex6(value)}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom highlight colour"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** A style swatch drawn by the real caption painter, so it shows exactly what you will get. */
function StyleCard({
  style,
  settings,
  selected,
  onSelect,
}: {
  style: CaptionStyleId;
  settings: CaptionSettings;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    void ensureCaptionFonts(captionFontFamily()).then(() => setFontsReady(1));
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(64 * dpr);
    drawCaptionSample(ctx, canvas.width, canvas.height, { ...settings, style }, captionFontFamily());
  }, [width, style, settings.color, fontsReady, settings]);

  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={STYLE_LABELS[style].hint}
      className={`press group relative block w-full overflow-hidden rounded-field text-left ${
        selected ? "ring-2 ring-ink" : "ring-1 ring-rule hover:ring-ink/40"
      }`}
    >
      <canvas ref={ref} className="block h-16 w-full" style={{ height: 64 }} />
      <span className="absolute left-2 top-1.5 rounded-chip bg-black/50 px-1.5 py-0.5 text-[11px] text-white/90">
        {STYLE_LABELS[style].name}
      </span>
    </button>
  );
}
