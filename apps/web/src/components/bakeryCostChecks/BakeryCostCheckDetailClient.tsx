"use client";

import { BackToListLink } from "@/components/ui/BackToListLink";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { CostCheckSourcesModal, SourceQtyButton, type CostCheckSourceTab } from "@/components/costChecks/CostCheckSourcesModal";
import { useBakeryCostCheck, useDeleteBakeryCostCheck, useUpdateBakeryCostCheckStatus } from "@/hooks/useBakeryCostChecks";
import { rememberedListUrl } from "@/hooks/useListUrlState";
import { useCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { CostCheckReportRow, ProductType } from "@/types";
import { useMemo, useState } from "react";

const cell = "border border-slate-200 px-3 py-2";
const num = `${cell} text-right`;
const head = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

const TYPE_LABELS: Record<ProductType, string> = {
  NVL: "Nguyên vật liệu",
  NVL_TIEU_HAO: "Nguyên vật liệu tiêu hao",
  COC_TAKE: "Cốc & ống hút",
  BANH: "Bánh",
  DUNG_CU: "Dụng cụ",
  KHAC: "Khác",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function BakeryCostCheckDetailClient({ id }: { id: string }) {
  const { data: item, isLoading } = useBakeryCostCheck(id);
  const updateStatus = useUpdateBakeryCostCheckStatus(id);
  const deleteCostCheck = useDeleteBakeryCostCheck();
  const { data: currentUser } = useCurrentUser();
  const router = useRouter();
  // Bấm ô Nhận/Chuyển đi/Huỷ xem phiếu gốc: chỉ quản trị viên (server chặn cùng luật).
  const canSeeSources = Boolean(currentUser?.isSystem);
  const [error, setError] = useState<string | null>(null);
  // Ô Nhận / Chuyển đi / Huỷ vừa bấm — mở modal liệt kê phiếu gốc làm nên con số đó.
  const [sources, setSources] = useState<{ productId: string; productName: string; tab: CostCheckSourceTab } | null>(null);

  // Server đã trả rows theo thứ tự loại → nhóm → tên, nên chỉ gộp tuần tự theo thứ tự gặp.
  const byType = useMemo(() => {
    const map = new Map<ProductType, CostCheckReportRow[]>();
    for (const row of item?.report ?? []) {
      const list = map.get(row.productType) ?? [];
      list.push(row);
      map.set(row.productType, list);
    }
    return [...map.entries()];
  }, [item?.report]);

  if (isLoading || !item) return <p className="text-slate-400">Đang tải...</p>;
  const s = item.bakerySummary;

  function toggleStatus() {
    if (!item) return;
    const next = item.status === "CANCELLED" ? "ACTIVE" : "CANCELLED";
    if (!confirm(next === "CANCELLED" ? "Huỷ phiếu này?" : "Bỏ huỷ phiếu này?")) return;
    setError(null);
    updateStatus.mutate(next, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Đổi trạng thái thất bại"),
    });
  }

  function handleDelete() {
    if (!item) return;
    // Xoá hẳn khác "Huỷ phiếu": không còn dòng lịch sử nào, nên nói rõ ở hộp xác nhận.
    if (!confirm(`Xoá hẳn phiếu ${item.code}? Không khôi phục được. Muốn giữ lại lịch sử thì dùng "Huỷ phiếu".`)) return;
    setError(null);
    deleteCostCheck.mutate(item.id, {
      onSuccess: () => router.replace(rememberedListUrl("/bakery-cost-checks")),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá phiếu thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <BackToListLink href="/bakery-cost-checks" className="text-sm text-indigo-600 hover:underline">
            ← Check Cost tiệm bánh
          </BackToListLink>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800">Phiếu {item.code}</h1>
            {item.status === "CANCELLED" && <Badge tone="red">Đã huỷ</Badge>}
            {item.useVat && <Badge tone="blue">Có VAT</Badge>}
          </div>
          <p className="text-sm text-slate-500">
            {item.user?.name} · {item.openingStockCheck.code} → {item.closingStockCheck.code} ·{" "}
            {item.useVat ? "đã cộng VAT" : "giá chưa thuế"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={toggleStatus} disabled={updateStatus.isPending}>
            {item.status === "CANCELLED" ? "Bỏ huỷ" : "Huỷ phiếu"}
          </Button>
          {can(currentUser, "BAKERY_COST_CHECKS", "DELETE") && (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={deleteCostCheck.isPending}>
              <Trash2 size={16} />
              {deleteCostCheck.isPending ? "Đang xoá..." : "Xoá"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {s && (
        <Card>
          <CardHeader>
            <CardTitle>Tổng hợp</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Doanh thu (giá xuất)</p>
              <p className="text-lg font-semibold text-slate-800">{formatCurrency(s.revenue)}</p>
              <p className="text-xs text-slate-400">{formatNumber(s.soldQuantity)} cái bánh bán ra</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">NVL định mức</p>
              <p className="text-lg font-semibold text-slate-800">{formatCurrency(s.expectedMaterial)}</p>
              <p className="text-xs text-slate-400">{pct(s.expectedMaterialPct)} doanh thu</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">NVL thực dùng</p>
              <p className="text-lg font-semibold text-slate-800">{formatCurrency(s.actualMaterial)}</p>
              <p className="text-xs text-slate-400">{pct(s.actualMaterialPct)} doanh thu</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Lệch (thực − định mức)</p>
              <p className={`text-lg font-semibold ${s.variance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {formatCurrency(s.variance)}
              </p>
              <p className="text-xs text-slate-400">
                {pct(s.variancePct)} doanh thu · huỷ {formatCurrency(s.wasteMaterial)}
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {s && s.revenueByBuyer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bánh đã bán ra</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head}>Người mua</th>
                  <th className={`${head} text-right`}>SL</th>
                  <th className={`${head} text-right`}>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {s.revenueByBuyer.map((b) => (
                  <tr key={b.shopUserId ?? "ngoai"}>
                    <td className={cell}>
                      {b.shopUserId ? b.shopName : <Badge tone="yellow">Bán ngoài</Badge>}
                    </td>
                    <td className={num}>{formatNumber(b.quantity)}</td>
                    <td className={num}>{formatCurrency(b.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nguyên liệu</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={head}>Hàng hoá</th>
                <th className={head}>ĐVT</th>
                <th className={`${head} text-right`}>Tồn đầu</th>
                <th className={`${head} text-right`}>Nhận</th>
                <th className={`${head} text-right`}>Chuyển đi</th>
                <th className={`${head} text-right`}>Huỷ</th>
                <th className={`${head} text-right`}>Tồn cuối</th>
                <th className={`${head} text-right`}>Thực dùng</th>
                <th className={`${head} text-right`}>Định mức</th>
                <th className={`${head} text-right`}>Lệch</th>
              </tr>
            </thead>
            <tbody>
              {byType.map(([type, rows]) => (
                <>
                  <tr key={`h-${type}`}>
                    <td className="border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold" colSpan={10}>
                      {TYPE_LABELS[type] ?? type}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.productId}>
                      <td className={cell}>
                        {row.name}
                        <span className="ml-2 text-xs text-slate-400">{row.code}</span>
                      </td>
                      <td className={cell}>{row.unitLabel}</td>
                      <td className={num}>{formatNumber(row.openingQty)}</td>
                      <td className={num}>
                        <SourceQtyButton
                          enabled={canSeeSources}
                          value={row.receivedQty}
                          onClick={() => setSources({ productId: row.productId, productName: row.name, tab: "received" })}
                        />
                      </td>
                      <td className={num}>
                        <SourceQtyButton
                          enabled={canSeeSources}
                          value={row.transferOutQty}
                          onClick={() => setSources({ productId: row.productId, productName: row.name, tab: "transferOut" })}
                        />
                      </td>
                      <td className={num}>
                        <SourceQtyButton
                          enabled={canSeeSources}
                          value={row.wastedQty}
                          onClick={() => setSources({ productId: row.productId, productName: row.name, tab: "wasted" })}
                        />
                      </td>
                      <td className={num}>{formatNumber(row.closingQty)}</td>
                      <td className={num}>{formatNumber(row.actualUsed)}</td>
                      <td className={num}>{formatNumber(row.theoretical)}</td>
                      <td className={`${num} ${row.variance > 0 ? "text-red-600" : ""}`}>{formatNumber(row.variance)}</td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {sources && (
        <CostCheckSourcesModal
          costCheckId={id}
          productId={sources.productId}
          productName={sources.productName}
          initialTab={sources.tab}
          onClose={() => setSources(null)}
        />
      )}
    </div>
  );
}
