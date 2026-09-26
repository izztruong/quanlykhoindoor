"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCentralPurchasing } from "@/hooks/useCentralPurchasing";
import { formatNumber } from "@/lib/format";
import type { CentralPurchasingRow } from "@/types";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

const SOURCE_LABELS: Record<CentralPurchasingRow["shopStocks"][number]["source"], string> = {
  REORDER_RUN: "Gõ ở Order nhanh",
  STOCK_CHECK: "Phiếu kiểm kê",
  NONE: "Chưa khai lần nào",
};

/** Tồn khai càng cũ thì cả dòng càng kém tin — đổi màu thay vì chỉ ghi số, để mắt bắt được ngay. */
function ageClass(ageDays: number | null): string {
  if (ageDays == null) return "text-red-600";
  if (ageDays > 14) return "text-red-600";
  if (ageDays > 7) return "text-amber-600";
  return "text-slate-600";
}

function ageText(ageDays: number | null): string {
  if (ageDays == null) return "chưa có số";
  if (ageDays === 0) return "hôm nay";
  return `cách đây ${ageDays} ngày`;
}

export default function CentralPurchasingPage() {
  const { data: rows = [], isLoading, isError } = useCentralPurchasing();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const needsOrder = rows.filter((r) => r.needsOrder);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Hàng mua tập trung</h1>
        <p className="text-sm text-slate-500">
          Cốc giấy và những thứ tương tự do admin đặt ở đây, không qua Order nhanh của quán: SL đặt tối thiểu là của cả
          chuỗi, và câu hỏi &ldquo;còn đủ dùng bao nhiêu ngày&rdquo; phải tính trên tồn kho cộng tồn mọi quán. Hàng vào
          danh sách này bằng cách đặt <strong>Nhịp gọi = Mua tập trung</strong> ở Danh mục › Hàng hoá.
        </p>
      </div>

      {needsOrder.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>{needsOrder.length} hàng đã tới lúc gọi:</strong>{" "}
            {needsOrder
              .map((r) => `${r.name} (còn ${r.coverDays != null ? formatNumber(r.coverDays) : "?"} ngày)`)
              .join(" · ")}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tồn toàn chuỗi so với ngưỡng gọi</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-500">Đang tính…</p>
          ) : isError ? (
            <p className="text-sm text-red-600">Không tải được số liệu.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              Chưa có hàng hoá nào đặt nhịp gọi &ldquo;Mua tập trung&rdquo;. Khai ở Danh mục › Hàng hoá.
            </p>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${headClass} w-8`} />
                  <th className={headClass}>Mã</th>
                  <th className={headClass}>Tên hàng hoá</th>
                  <th className={headClass}>ĐVT</th>
                  <th className={headClass}>Tồn kho</th>
                  <th className={headClass}>Tồn quán</th>
                  <th className={headClass}>Tồn chuỗi</th>
                  <th className={headClass}>Dùng/ngày</th>
                  <th className={headClass}>Còn đủ</th>
                  <th className={headClass}>Ngưỡng gọi</th>
                  <th className={headClass}>SL nên đặt</th>
                  <th className={headClass}>NCC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.productId}>
                    <tr className={row.needsOrder ? "bg-amber-50" : undefined}>
                      <td className={cellClass}>
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [row.productId]: !prev[row.productId] }))}
                          className="text-slate-400 hover:text-slate-600"
                          aria-label="Xem chi tiết"
                        >
                          {expanded[row.productId] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className={cellClass}>{row.code}</td>
                      <td className={cellClass}>{row.name}</td>
                      <td className={cellClass}>{row.unitLabel}</td>
                      <td className={cellClass}>{formatNumber(row.warehouseQty)}</td>
                      <td className={cellClass}>
                        <span className={ageClass(row.oldestShopStockAgeDays)}>{formatNumber(row.shopQty)}</span>
                      </td>
                      <td className={`${cellClass} font-medium`}>{formatNumber(row.chainQty)}</td>
                      <td className={cellClass}>{row.dailyUsage == null ? "—" : formatNumber(row.dailyUsage)}</td>
                      <td className={cellClass}>
                        {row.coverDays == null ? (
                          "—"
                        ) : (
                          <span className={row.needsOrder ? "font-semibold text-red-600" : undefined}>
                            {formatNumber(row.coverDays)} ngày
                          </span>
                        )}
                      </td>
                      <td className={cellClass}>{row.leadDays == null ? "chưa khai" : `${row.leadDays} ngày`}</td>
                      <td className={cellClass}>
                        {row.needsOrder ? (
                          <span className="font-semibold">
                            {formatNumber(row.purchaseQty)} {row.purchaseUnitName ?? row.unitLabel}
                            {row.purchaseUnitName && (
                              <span className="block text-xs font-normal text-slate-500">
                                = {formatNumber(row.finalBaseQty)} {row.unitLabel}
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cellClass}>{row.prioritySupplierName ?? <span className="text-red-600">chưa khai</span>}</td>
                    </tr>
                    {expanded[row.productId] && (
                      <tr>
                        <td className={cellClass} />
                        <td className={cellClass} colSpan={11}>
                          <div className="flex flex-col gap-3">
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Vì sao ra con số này</p>
                              <ul className="list-inside list-disc text-sm text-slate-600">
                                {row.reasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Tồn từng quán khai</p>
                              <table className="border-collapse text-sm">
                                <thead>
                                  <tr>
                                    <th className={headClass}>Quán</th>
                                    <th className={headClass}>Tồn</th>
                                    <th className={headClass}>Khai lúc nào</th>
                                    <th className={headClass}>Nguồn</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.shopStocks.map((stock) => (
                                    <tr key={stock.userId}>
                                      <td className={cellClass}>{stock.userName}</td>
                                      <td className={cellClass}>{formatNumber(stock.quantity)}</td>
                                      <td className={`${cellClass} ${ageClass(stock.ageDays)}`}>{ageText(stock.ageDays)}</td>
                                      <td className={cellClass}>{SOURCE_LABELS[stock.source]}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
