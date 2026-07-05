import { cn } from "@/lib/cn";
import { forwardRef, InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100",
        className,
      )}
      {...props}
    />
  );
});
