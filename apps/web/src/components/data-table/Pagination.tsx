"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [20, 50, 100] }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <div>Tổng {total}</div>
      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-8 rounded border border-slate-300 px-2 text-sm"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}/trang
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[1.5rem] text-center font-medium text-slate-700">{page}</span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
