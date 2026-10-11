"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StockImportImagesCard } from "@/components/stock/StockImportImagesCard";
import { useDeleteStockImport, useStockImport } from "@/hooks/useStockImports";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDateTime, formatNumber, labels } from "@/lib/format";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StockImportDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: item, isLoading } = useStockImport(id);
  const { data: currentUser } = useCurrentUser();
  const deleteImport = useDeleteStockImport();
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !item) return <p className="text-slate-400">Đang tải...</p>;

  const canEdit = can(currentUser, "STOCK_IMPORTS", "EDIT");
  const canDelete = can(currentUser, "STOCK_IMPORTS", "DELETE");
  // Đính ảnh chỉ cần quyền Thêm — người gõ phiếu phải đính được chứng từ cho phiếu mình vừa tạo.
  const canManageImages = canEdit || can(currentUser, "STOCK_IMPORTS", "ADD");
  const total = item.items.reduce((sum, line) => sum + Number(line.costAmount), 0);

  function handleDelete() {
    if (!window.confirm(`Xoá phiếu nhập ${item!.code}? Số liệu Check Cost của kỳ liên quan sẽ phải tạo lại.`)) return;
    setError(null);
    deleteImport.mutate(id, {
      onSuccess: (result) => {
        if (result.affectedCostChecks.length > 0) {
          alert(
            `Phiếu vừa xoá nằm trong kỳ của ${result.affectedCostChecks.length} phiếu Check Cost đã chốt ` +
              `(${result.affectedCostChecks.map((cc) => cc.code).join(", ")}). Hãy tạo lại những phiếu đó.`,
          );
        }
        router.replace("/stock/imports");
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá phiếu thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Phiếu nhập kho {item.code}</h1>
          <p className="text-sm text-slate-500">Thời gian nhập: {formatDateTime(item.transactionAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link href={`/stock/imports/${id}/edit`}>
              <Button variant="secondary" size="sm">
                <Pencil size={14} />
                Sửa
              </Button>
            </Link>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" disabled={deleteImport.isPending} onClick={handleDelete}>
              <Trash2 size={14} />
              Xoá
            </Button>
          )}
          <Link href="/stock/imports" className="text-sm text-indigo-600 hover:underline">
            ← Danh sách phiếu nhập
          </Link>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-400">Kho</div>
            <div className="font-medium text-slate-800">
              {item.warehouse.name}
              {item.warehouse.shopUser && <span className="text-slate-500"> — {item.warehouse.shopUser.name}</span>}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Nhà cung cấp</div>
            <div className="font-medium text-slate-800">{item.supplier?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-slate-400">Loại phiếu</div>
            <div className="font-medium text-slate-800">{labels.stockImportType(item.type)}</div>
          </div>
          <div>
            <div className="text-slate-400">Hình thức</div>
            <div className="font-medium text-slate-800">{labels.transactionForm(item.form)}</div>
          </div>
          <div>
            <div className="text-slate-400">Người tạo</div>
            <div className="font-medium text-slate-800">{item.createdBy?.name ?? "—"}</div>
          </div>
          <div>
            <div className="text-slate-400">Tổng tiền vốn</div>
            <div className="font-semibold text-slate-800">{formatCurrency(total)}</div>
          </div>
          {item.note && (
            <div className="md:col-span-3">
              <div className="text-slate-400">Ghi chú</div>
              <div className="font-medium text-slate-800">{item.note}</div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hàng hoá</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border border-slate-200 px-4 py-2 text-left">Hàng hoá</th>
                <th className="border border-slate-200 px-4 py-2 text-left">Đơn vị</th>
                <th className="border border-slate-200 px-4 py-2 text-right">Số lượng</th>
                <th className="border border-slate-200 px-4 py-2 text-right">Giá vốn</th>
                <th className="border border-slate-200 px-4 py-2 text-right">Thành tiền</th>
                <th className="border border-slate-200 px-4 py-2 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {item.items.map((line) => (
                <tr key={line.id}>
                  <td className="border border-slate-200 px-4 py-2">{line.product.name}</td>
                  <td className="border border-slate-200 px-4 py-2">{line.product.unit?.name ?? "-"}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatNumber(Number(line.quantity))}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(line.costPrice)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(line.costAmount)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-slate-600">{line.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <StockImportImagesCard importId={id} imageCount={item.imageCount} canManage={canManageImages} />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
