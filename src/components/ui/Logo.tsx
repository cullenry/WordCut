import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-bold text-white">
        W
      </span>
      {APP_NAME}
    </Link>
  );
}
