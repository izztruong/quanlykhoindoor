import { Card } from "@/components/ui/Card";
import Link from "next/link";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  /** Trang xem chi tiết; bỏ trống thì không hiện link. */
  href?: string;
  isLoading?: boolean;
  children: ReactNode;
}

/** Khung một ô số liệu ở trang chủ: tiêu đề + link "Chi tiết", nội dung tự do bên dưới. */
export function StatCard({ title, href, isLoading, children }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-medium text-slate-700">{title}</h2>
        {href && (
          <Link href={href} className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Chi tiết
          </Link>
        )}
      </div>
      {isLoading ? <p className="mt-3 text-sm text-slate-400">Đang tải...</p> : children}
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
