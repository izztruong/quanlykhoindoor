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
        // Bỏ mũi tên mặc định của hệ điều hành (mỗi trình duyệt một kiểu), vẽ lại bằng ui-select-chevron
        // trong globals.css; pr-9 chừa chỗ cho mũi tên.
        "ui-select-chevron h-10 w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pr-9 pl-3 text-sm text-slate-800 shadow-xs transition-colors",
        "hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
