"use client";

import { useId } from "react";

/**
 * A stylised talking-head shot: a speaker in front of a window and a shelf. In
 * the 9:16 stage the same picture is cropped to the middle, as a reframed clip is.
 */
export function Scene({ className, slice = false, shown }: { className: string; slice?: boolean; shown?: boolean }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio={slice ? "xMidYMid slice" : "xMidYMid meet"}
      data-shown={shown}
      className={className}
    >
      <defs>
        <linearGradient id={`${id}wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1930" />
          <stop offset="1" stopColor="#0f0e17" />
        </linearGradient>
        <radialGradient id={`${id}glow`} cx="0.7" cy="0.3" r="0.55">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34304a" />
          <stop offset="1" stopColor="#1f1c2c" />
        </linearGradient>
        <clipPath id={`${id}frame`}>
          <rect width="160" height="90" rx={slice ? 0 : 2.5} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}frame)`}>
        <rect width="160" height="90" fill={`url(#${id}wall)`} />
        <rect width="160" height="90" fill={`url(#${id}glow)`} />
        {/* Window */}
        <rect x="16" y="12" width="34" height="46" rx="1.5" fill="#fff" fillOpacity="0.045" />
        <path d="M33 12v46M16 35h34" stroke="#0f0e17" strokeOpacity="0.6" strokeWidth="1" />
        {/* Shelf */}
        <path d="M114 52h34" stroke="#2c2840" strokeWidth="1.5" />
        <rect x="118" y="40" width="4" height="12" rx="0.5" fill="#3a3354" />
        <rect x="123" y="38" width="3.5" height="14" rx="0.5" fill="#a78bfa" fillOpacity="0.45" />
        <rect x="127.5" y="42" width="5" height="10" rx="0.5" fill="#2e2a42" />
        <circle cx="140" cy="47" r="5" fill="#2b3a33" />
        {/* Speaker */}
        <path d="M48 90c1-17 14-27 32-27s31 10 32 27Z" fill={`url(#${id}body)`} />
        <path d="M75 56h10v9c-3 2-7 2-10 0Z" fill="#2a2638" />
        <ellipse cx="80" cy="43" rx="11.5" ry="13.5" fill="#3d3852" />
        <path d="M68.6 41c0-9 5-14.5 11.4-14.5S91.4 32 91.4 41c-2-5-6-7.5-11.4-7.5S70.6 36 68.6 41Z" fill="#241f33" />
        <path d="M90.6 37c1.6 4 1.6 9 0 13" stroke="#a78bfa" strokeOpacity="0.35" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
