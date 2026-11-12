import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "indigo" | "rose" | "amber" | "emerald";

const toneClasses: Record<Tone, string> = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
};

interface StatCardProps {
  title: string;
  /** Trang xem chi tiết; bỏ trống thì không hiện link. */
  href?: string;
  isLoading?: boolean;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}

/** Khung một ô số liệu ở trang chủ: tiêu đề + link "Chi tiết", nội dung tự do bên dưới. */
export function StatCard({ title, href, isLoading, icon: Icon, tone = "indigo", className, children }: StatCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", toneClasses[tone])}>
              <Icon size={20} />
            </span>
          )}
          <h2 className="text-sm font-medium text-slate-500">{title}</h2>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
          >
            Chi tiết
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-2">
          <div className="h-7 w-32 animate-pulse rounded-md bg-slate-100" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-slate-100" />
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

/** Hàng số phụ dưới đường kẻ: mỗi ô là một con số kèm nhãn. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">{children}</div>;
}

export function StatItem({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
