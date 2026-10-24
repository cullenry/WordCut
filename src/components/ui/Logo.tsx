import Link from "next/link";
import { APP_NAME } from "@/lib/config";

/** The favicon's mark (three lines of transcript, the middle one cut) beside the name. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink">
      <svg aria-hidden viewBox="0 0 32 32" className="h-5 w-5">
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <g className="fill-paper">
          <rect x="6" y="8" width="20" height="3.4" rx="1.7" />
          <rect x="6" y="14.3" width="6.5" height="3.4" rx="1.7" />
          <rect x="19.5" y="14.3" width="6.5" height="3.4" rx="1.7" />
          <rect x="6" y="20.6" width="13" height="3.4" rx="1.7" />
        </g>
        <rect x="14.6" y="12.2" width="2.8" height="7.6" rx="1.4" className="fill-cut" />
      </svg>
      <span className="font-display text-base font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
    </Link>
  );
}
