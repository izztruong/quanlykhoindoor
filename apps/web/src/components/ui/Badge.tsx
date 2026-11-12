import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "gray" | "green" | "red" | "yellow" | "blue";

const toneClasses: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600 ring-slate-500/15",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/15",
  yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
};

export function Badge({ tone = "gray", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
