"use client";

import { Input } from "@/components/ui/Input";
import { clampDateRange } from "@/lib/dateRange";

export interface DateRangeValue {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  label?: string;
}

export function DateRangeFilter({ value, onChange, label = "Thời gian" }: DateRangeFilterProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label} (tối đa 3 tháng)</label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="w-40"
          value={value.from}
          onChange={(e) => onChange(clampDateRange(e.target.value, value.to, "from"))}
        />
        <span className="text-slate-400">-</span>
        <Input
          type="date"
          className="w-40"
          value={value.to}
          onChange={(e) => onChange(clampDateRange(value.from, e.target.value, "to"))}
        />
      </div>
    </div>
  );
}
