import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "gray" | "green" | "red" | "yellow" | "blue";

const toneClasses: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-600",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  yellow: "bg-amber-50 text-amber-700",
  blue: "bg-indigo-50 text-indigo-700",
};

export function Badge({ tone = "gray", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", toneClasses[tone], className)}
      {...props}
    />
  );
}
