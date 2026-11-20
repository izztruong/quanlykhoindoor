"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Modal } from "@/components/ui/Modal";
import { useCostCheckSources } from "@/hooks/useCostCheckSources";
import { ApiError } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { CostCheckSources } from "@/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export type CostCheckSourceTab = "received" | "transferOut" | "wasted";

const TABS: { key: CostCheckSourceTab; label: string }[] = [
  { key: "received", label: "Nhận trong kỳ" },
  { key: "transferOut", label: "Xuất trong kỳ" },
  { key: "wasted", label: "Đã huỷ" },
];

const PAGE_SIZE = 20;
const cell = "border border-slate-200 px-3 py-2";
const head = "border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";

/** Một dòng chung cho cả ba tab — gộp phiếu nhập + điều chuyển đến, hoặc huỷ NVL + huỷ món, vào một bảng. */
interface SourceRow {
  key: string;
  href: string;
  code: string;
  at: string;
  kind: string;
  detail: string;
  originalQty: string;
  qtyInRecipeUnit: number;
}

/**
 * Ô số bấm được trên bảng nguyên liệu của phiếu Check Cost. Số 0 thì không có phiếu nào để xem nên
 * giữ là chữ thường. `enabled` = chỉ quản trị viên (`isSystem`) — server cũng chặn y vậy, đây chỉ là ẩn ô.
 */
export function SourceQtyButton({ value, enabled, onClick }: { value: number; enabled: boolean; onClick: () => void }) {
  if (!enabled || value === 0) return <>{formatNumber(value)}</>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Xem các phiếu làm nên con số này"
      className="cursor-pointer text-indigo-600 underline decoration-dotted underline-offset-2 hover:text-indigo-700"
    >
      {formatNumber(value)}
    </button>
  );
}

/** "2 Túi + 350 Gam" — SL nguyên + SL lẻ như người dùng gõ ở phiếu. */
function splitQty(whole: number | null, loose: number | null, product: CostCheckSources["product"]): string {
  const parts: string[] = [];
  if (whole) parts.push(`${formatNumber(whole)} ${product.baseUnitName}`);
  if (loose) parts.push(`${formatNumber(loose)} ${product.recipeUnitName}`);
  return parts.length > 0 ? parts.join(" + ") : "0";
}

function buildRows(data: CostCheckSources, tab: CostCheckSourceTab): SourceRow[] {
  const { product } = data;
  let rows: SourceRow[];
  if (tab === "received") {
    rows = [
      ...data.received.imports.map((it, i) => ({
        key: `import-${it.id}-${i}`,
        href: `/stock/imports/${it.id}`,
        code: it.code,
        at: it.at,
        kind: "Phiếu nhập kho",
        detail: it.supplierName ?? "—",
        originalQty: `${formatNumber(it.quantity)} ${product.baseUnitName}`,
        qtyInRecipeUnit: it.qtyInRecipeUnit,
      })),
      ...data.received.transfersIn.map((it, i) => ({
        key: `tin-${it.id}-${i}`,
        href: `/material-transfers/${it.id}`,
        code: it.code,
        at: it.at,
        kind: "Nhận điều chuyển",
        detail: `Từ ${it.shopName}`,
        originalQty: splitQty(it.wholeQuantity, it.looseQuantity, product),
        qtyInRecipeUnit: it.qtyInRecipeUnit,
      })),
    ];
  } else if (tab === "transferOut") {
    rows = data.transferOut.items.map((it, i) => ({
      key: `tout-${it.id}-${i}`,
      href: `/material-transfers/${it.id}`,
      code: it.code,
      at: it.at,
      kind: "Điều chuyển đi",
      detail: `Tới ${it.shopName}`,
      originalQty: splitQty(it.wholeQuantity, it.looseQuantity, product),
      qtyInRecipeUnit: it.qtyInRecipeUnit,
    }));
  } else {
    rows = [
      ...data.wasted.raw.map((it, i) => ({
        key: `wraw-${it.id}-${i}`,
        href: `/material-waste/${it.id}`,
        code: it.code,
        at: it.at,
        kind: "Huỷ nguyên liệu",
        detail: product.name,
        originalQty: splitQty(it.wholeQuantity, it.looseQuantity, product),
        qtyInRecipeUnit: it.qtyInRecipeUnit,
      })),
      ...data.wasted.finished.map((it, i) => ({
        key: `wfg-${it.id}-${i}`,
        href: `/material-waste/${it.id}`,
        code: it.code,
        at: it.at,
        kind: "Huỷ món đã pha",
        detail: `${it.finishedGoodName} — ${formatNumber(it.perUnit)} ${product.recipeUnitName}/món theo công thức lúc huỷ`,
        originalQty: `${formatNumber(it.quantity)} món`,
        qtyInRecipeUnit: it.qtyInRecipeUnit,
      })),
    ];
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

function tabTotal(data: CostCheckSources, tab: CostCheckSourceTab): number {
  return tab === "received" ? data.received.total : tab === "transferOut" ? data.transferOut.total : data.wasted.total;
}

function snapshotValue(data: CostCheckSources, tab: CostCheckSourceTab): number | null {
  if (!data.snapshot) return null;
  return tab === "received"
    ? data.snapshot.receivedQty
    : tab === "transferOut"
      ? data.snapshot.transferOutQty
      : data.snapshot.wastedQty;
}

export function CostCheckSourcesModal({
  costCheckId,
  productId,
  productName,
  initialTab,
  onClose,
}: {
  costCheckId: string;
  productId: string;
  productName: string;
  initialTab: CostCheckSourceTab;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useCostCheckSources(costCheckId, productId);
  const [tab, setTab] = useState<CostCheckSourceTab>(initialTab);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => (data ? buildRows(data, tab) : []), [data, tab]);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function switchTab(next: CostCheckSourceTab) {
    setTab(next);
    setPage(1);
  }

  const total = data ? tabTotal(data, tab) : 0;
  const snap = data ? snapshotValue(data, tab) : null;
  // Số trên phiếu chốt lúc tạo, danh sách là dữ liệu hiện tại — lệch là có phiếu nguồn đổi sau khi chốt.
  const drifted = snap !== null && Math.abs(total - snap) > 1e-6;

  return (
    <Modal title={`Nguồn số liệu — ${productName}`} onClose={onClose} size="xl">
      {isLoading && <p className="text-sm text-slate-400">Đang tải...</p>}
      {error && (
        <p className="text-sm text-red-600">{error instanceof ApiError ? error.message : "Không tải được danh sách phiếu"}</p>
      )}
      {data && (
        <div className="flex flex-col gap-4">
          <div className="text-sm text-slate-600">
            <p>
              Phiếu <span className="font-medium text-slate-800">{data.costCheck.code}</span> · {data.costCheck.shopName} · kỳ{" "}
              {formatDateTime(data.costCheck.from)} – {formatDateTime(data.costCheck.to)}
            </p>
            {data.product.factor !== 1 && (
              <p className="mt-1 text-slate-500">
                Quy đổi: 1 {data.product.baseUnitName} = {formatNumber(data.product.factor)} {data.product.recipeUnitName}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-100">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label} ({formatNumber(tabTotal(data, t.key))})
              </button>
            ))}
          </div>

          {drifted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Số trên phiếu (chốt lúc {formatDateTime(data.costCheck.createdAt)}) là{" "}
              <span className="font-semibold">
                {formatNumber(snap ?? 0)} {data.product.recipeUnitName}
              </span>
              , còn các phiếu hiện có cộng lại{" "}
              <span className="font-semibold">
                {formatNumber(total)} {data.product.recipeUnitName}
              </span>{" "}
              — có phiếu đã được sửa, xoá hoặc thêm sau khi chốt (hoặc quy đổi đơn vị đã đổi). Lập lại phiếu Check Cost nếu
              cần số mới.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head}>Mã phiếu</th>
                  <th className={head}>Thời điểm</th>
                  <th className={head}>Loại</th>
                  <th className={head}>Chi tiết</th>
                  <th className={`${head} text-right`}>SL trên phiếu</th>
                  <th className={`${head} text-right`}>Quy ra {data.product.recipeUnitName}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.key}>
                    <td className={`${cell} whitespace-nowrap`}>
                      <Link href={row.href} target="_blank" className="font-medium text-indigo-600 hover:underline">
                        {row.code}
                      </Link>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>{formatDateTime(row.at)}</td>
                    <td className={`${cell} whitespace-nowrap`}>{row.kind}</td>
                    <td className={cell}>{row.detail}</td>
                    <td className={`${cell} whitespace-nowrap text-right`}>{row.originalQty}</td>
                    <td className={`${cell} whitespace-nowrap text-right`}>{formatNumber(row.qtyInRecipeUnit)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className={`${cell} py-6 text-center text-slate-400`}>
                      Không có phiếu nào trong kỳ.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={5} className={`${cell} text-right`}>
                      Tổng ({rows.length} dòng)
                    </td>
                    <td className={`${cell} text-right`}>{formatNumber(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {rows.length > PAGE_SIZE && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={() => setPage(1)}
              pageSizeOptions={[PAGE_SIZE]}
            />
          )}
          {tab === "wasted" && (
            <p className="text-xs text-slate-500">
              Chỉ tính dòng huỷ có tick &quot;Trừ CC&quot;; dòng bỏ tích coi như hàng đã dùng nên không có ở đây.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
