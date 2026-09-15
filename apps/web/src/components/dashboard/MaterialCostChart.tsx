"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { DashboardCostMonth } from "@/types";
import { useState } from "react";

interface MaterialCostChartProps {
  months: DashboardCostMonth[];
}

/** Bước lưới "tròn" nhỏ nhất sao cho giá trị lớn nhất nằm gọn trong 4 vạch. */
const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
const TICK_COUNT = 4;

function axisMax(maxValue: number) {
  const step = TICK_STEPS.find((s) => maxValue <= s * TICK_COUNT) ?? Math.ceil(maxValue / TICK_COUNT);
  return { step, max: step * TICK_COUNT };
}

const tickFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/**
 * Cột = chi phí NVL / doanh thu thuần từng tháng. Một trục duy nhất (%): tiền chi phí và doanh thu
 * nằm trong tooltip và bảng số liệu, không vẽ trục tiền thứ hai — hai thang đo trên một khung khiến
 * người đọc so nhầm độ cao cột với đường.
 */
export function MaterialCostChart({ months }: MaterialCostChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const hasData = months.some((m) => m.checkCount > 0);
  const { step, max } = axisMax(Math.max(...months.map((m) => m.pct), 0));
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => step * (TICK_COUNT - i));

  if (!hasData) {
    return <p className="py-10 text-center text-sm text-slate-400">Chưa có phiếu Check Cost nào chốt kỳ trong năm này.</p>;
  }

  return (
    <div>
      <div className="flex gap-2">
        {/* Trục % */}
        <div className="relative h-56 w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">
          {ticks.map((tick, i) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / TICK_COUNT) * 100}%` }}>
              {tickFormat.format(tick * 100)}%
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-56">
            {ticks.map((tick, i) => (
              <div
                key={tick}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ top: `${(i / TICK_COUNT) * 100}%` }}
              />
            ))}

            <div className="absolute inset-0 flex">
              {months.map((m, index) => {
                const noData = m.checkCount === 0;
                // Tooltip bám mép trong ở hai đầu để không tràn khỏi khung trên màn hẹp.
                const align = index < 2 ? "left-0" : index > 9 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={m.month}
                    tabIndex={0}
                    aria-label={`Tháng ${m.month}: ${noData ? "không có số liệu" : formatPercent(m.pct)}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "relative flex flex-1 items-end justify-center outline-none",
                      active === index && "bg-slate-50",
                    )}
                  >
                    {!noData && (
                      <div
                        className="w-3/5 max-w-6 rounded-t bg-indigo-500"
                        // Tỷ lệ âm (tồn cuối kỳ khai lớn hơn đầu kỳ + nhận) không có cột; số thật vẫn ở tooltip/bảng.
                        style={{ height: `${Math.min(Math.max(m.pct, 0) / max, 1) * 100}%` }}
                      />
                    )}

                    {active === index && (
                      <div
                        className={cn(
                          "pointer-events-none absolute bottom-full z-10 mb-2 w-48 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg",
                          align,
                        )}
                      >
                        <div className="mb-1 font-semibold text-slate-800">
                          Tháng {m.month}/{m.year}
                        </div>
                        {noData ? (
                          <div className="text-slate-500">Không có phiếu Check Cost</div>
                        ) : (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-500">
                            <dt>Tỷ lệ</dt>
                            <dd className="text-right font-medium text-slate-800">{formatPercent(m.pct)}</dd>
                            <dt>Chi phí</dt>
                            <dd className="text-right text-slate-700">{formatCurrency(Math.round(m.cost))}</dd>
                            <dt>Doanh thu</dt>
                            <dd className="text-right text-slate-700">{formatCurrency(Math.round(m.netRevenue))}</dd>
                            <dt>Số phiếu</dt>
                            <dd className="text-right text-slate-700">{m.checkCount}</dd>
                          </dl>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex text-xs text-slate-400">
            {months.map((m) => (
              <span key={m.month} className="flex-1 text-center">
                T{m.month}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
      >
        {showTable ? "Ẩn bảng số liệu" : "Xem bảng số liệu"}
      </button>

      {showTable && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="border border-slate-200 px-3 py-2 text-left font-medium">Tháng</th>
                <th className="border border-slate-200 px-3 py-2 text-right font-medium">Chi phí NVL</th>
                <th className="border border-slate-200 px-3 py-2 text-right font-medium">Doanh thu thuần</th>
                <th className="border border-slate-200 px-3 py-2 text-right font-medium">Tỷ lệ</th>
                <th className="border border-slate-200 px-3 py-2 text-right font-medium">Số phiếu</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-700">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="border border-slate-200 px-3 py-2">
                    {m.month}/{m.year}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">
                    {m.checkCount ? formatNumber(Math.round(m.cost)) : "—"}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">
                    {m.checkCount ? formatNumber(Math.round(m.netRevenue)) : "—"}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">
                    {m.checkCount ? formatPercent(m.pct) : "—"}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-right">{m.checkCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
