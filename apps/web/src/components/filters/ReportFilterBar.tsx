"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { clampDateRange } from "@/lib/dateRange";
import type { Product, ProductGroup, Warehouse } from "@/types";
import { Filter } from "lucide-react";

export interface ReportFilterValues {
  from: string;
  to: string;
  warehouseId: string;
  productId: string;
  productGroupId: string;
  /** Voucher code search (e.g. "PX2607...") — only used when filterMode is "code". */
  code: string;
}

interface ReportFilterBarProps {
  value: ReportFilterValues;
  onChange: (value: ReportFilterValues) => void;
  onSubmit: () => void;
  warehouses: Warehouse[];
  productGroups: ProductGroup[];
  products: Product[];
  dateRangeLabel?: string;
  requireWarehouse?: boolean;
  /** "code" replaces the Nhóm hàng hoá filter with a Mã phiếu text search (used by the detail reports). */
  filterMode?: "group" | "code";
}

export function ReportFilterBar({
  value,
  onChange,
  onSubmit,
  warehouses,
  productGroups,
  products,
  dateRangeLabel = "Thời gian",
  requireWarehouse,
  filterMode = "group",
}: ReportFilterBarProps) {
  const set = (patch: Partial<ReportFilterValues>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">{dateRangeLabel} (tối đa 3 tháng)</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.from}
            onChange={(e) => set(clampDateRange(e.target.value, value.to, "from"))}
            className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <span className="text-slate-400">-</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => set(clampDateRange(value.from, e.target.value, "to"))}
            className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      <div className="flex min-w-[180px] flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Kho hàng{requireWarehouse ? " *" : ""}</label>
        <Select value={value.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })}>
          <option value="">{requireWarehouse ? "Chọn kho hàng" : "Tất cả kho"}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-[180px] flex-col gap-1">
        <label className="text-xs font-medium text-slate-500">Hàng hoá</label>
        <Select value={value.productId} onChange={(e) => set({ productId: e.target.value })}>
          <option value="">Chọn hàng hoá</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {filterMode === "code" ? (
        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Mã phiếu</label>
          <input
            type="text"
            placeholder="Nhập mã phiếu..."
            value={value.code}
            onChange={(e) => set({ code: e.target.value })}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      ) : (
        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">Nhóm hàng hoá</label>
          <Select value={value.productGroupId} onChange={(e) => set({ productGroupId: e.target.value })}>
            <option value="">Chọn nhóm hàng hoá</option>
            {productGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Button type="button" onClick={onSubmit} className="h-10">
        <Filter size={16} />
        Lọc
      </Button>
    </div>
  );
}
