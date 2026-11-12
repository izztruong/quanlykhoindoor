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

const navButton =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-40";

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [20, 50, 100] }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <div>
        {total > 0 ? (
          <>
            <span className="font-medium text-slate-700">
              {first}–{last}
            </span>{" "}
            trong tổng <span className="font-medium text-slate-700">{total}</span>
          </>
        ) : (
          "Tổng 0"
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Số dòng mỗi trang"
          className="ui-select-chevron h-8 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pr-8 pl-2.5 text-sm text-slate-700 shadow-xs hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}/trang
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Trang trước" className={navButton}>
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[4.5rem] text-center text-slate-500">
          <span className="font-semibold text-slate-800">{page}</span> / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Trang sau"
          className={navButton}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
