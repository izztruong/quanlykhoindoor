import { cn } from "@/lib/cn";
import { forwardRef, SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
