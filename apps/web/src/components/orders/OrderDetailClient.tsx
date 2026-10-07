"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSalesOrder, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { exportOrderToExcel } from "@/lib/exportOrderExcel";
import { formatCurrency, formatDateTime, formatNumber, labels } from "@/lib/format";
import type { SalesOrderItem, StockItem } from "@/types";
import { Camera, FileSpreadsheet, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { OrderItemImagesModal } from "./OrderItemImagesModal";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

/**
 * Trang chi tiết chỉ đọc. Nhập NCC / giá / SL + ngày nhận nằm ở màn "Xử lý đơn"
 * (orders/[id]/process) — dùng cho cả lần đầu lẫn sửa lại sau khi hoàn thành.
 */
export function OrderDetailClient({ id }: { id: string }) {
  const { data: order, isLoading } = useSalesOrder(id);
  const { data: currentUser } = useCurrentUser();
  const updateStatus = useUpdateSalesOrderStatus(id);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Giữ id chứ không giữ cả dòng: imageCount phải lấy từ dữ liệu đơn mới nhất sau mỗi lần tải/xoá ảnh.
  const [imagesItemId, setImagesItemId] = useState<string | null>(null);

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  const canApprove = can(currentUser, "ORDERS", "APPROVE");
  // Server chỉ cho huỷ đơn chưa xử lý: APPROVE huỷ mọi đơn, ADD huỷ đơn của mình.
  const canCancel = order.status === "DRAFT" && (canApprove || can(currentUser, "ORDERS", "ADD"));
  const isCompleted = order.status === "COMPLETED";
  const imagesItem = imagesItemId ? order.items.find((item) => item.id === imagesItemId) : undefined;

  /** Các dòng phiếu xuất của hàng hoá này — mỗi dòng một NCC (một hàng có thể tách nhiều NCC). */
  function exportLinesFor(item: SalesOrderItem): StockItem[] {
    return (order!.stockExport?.items ?? []).filter((line) => line.productId === item.productId);
  }

  function handleCancel() {
    if (!confirm("Bạn có chắc muốn huỷ đơn hàng này?")) return;
    setError(null);
    updateStatus.mutate("CANCELLED", {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Huỷ đơn thất bại"),
    });
  }

  async function handleExportExcel() {
    if (!order) return;
    setExporting(true);
    try {
      await exportOrderToExcel(order);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Đơn hàng {order.code}</h1>
            <Badge tone={statusTone[order.status]}>{labels.salesOrderStatus(order.status)}</Badge>
          </div>
          <p className="text-sm text-slate-500">Ngày đặt: {formatDateTime(order.orderDate)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={handleExportExcel} disabled={exporting}>
            <FileSpreadsheet size={14} />
            Xuất Excel
          </Button>
          {canApprove && (
            <a href={`/print/orders/${id}`} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <Printer size={14} />
                In hoá đơn
              </Button>
            </a>
          )}
          <Link href="/orders" className="text-sm text-indigo-600 hover:underline">
            ← Danh sách đơn hàng
          </Link>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-400">Tài khoản</div>
            <div className="font-medium text-slate-800">{order.createdBy?.name ?? "-"}</div>
          </div>
          <div>
            <div className="text-slate-400">Kho xuất</div>
            <div className="font-medium text-slate-800">{order.warehouse.name}</div>
          </div>
          <div>
            <div className="text-slate-400">Phiếu xuất kho liên kết</div>
            <div className="font-medium text-slate-800">{order.stockExport ? order.stockExport.code : "Chưa xuất kho"}</div>
          </div>
          {order.note && (
            <div className="md:col-span-3">
              <div className="text-slate-400">Ghi chú</div>
              <div className="font-medium text-slate-800">{order.note}</div>
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
                <th className="border border-slate-200 px-4 py-2 text-right">SL đặt</th>
                <th className="border border-slate-200 px-4 py-2 text-left">Đơn vị</th>
                {isCompleted && (
                  <>
                    <th className="border border-slate-200 px-4 py-2 text-left">NCC</th>
                    <th className="border border-slate-200 px-4 py-2 text-right">Giá xuất</th>
                    <th className="border border-slate-200 px-4 py-2 text-right">SL nhận</th>
                    <th className="border border-slate-200 px-4 py-2 text-left">Ngày nhận</th>
                    <th className="border border-slate-200 px-4 py-2 text-left">Ghi chú</th>
                    <th className="border border-slate-200 px-4 py-2 text-left">Chứng từ</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const ordered = Number(item.quantity);
                const received = item.receivedQuantity != null ? Number(item.receivedQuantity) : null;
                // Hàng admin tự thêm lúc xử lý có SL đặt = 0 — không tô màu so với số đặt.
                const receivedTone =
                  received == null || ordered <= 0
                    ? ""
                    : received < ordered
                      ? "text-red-600"
                      : received > ordered
                        ? "text-emerald-600"
                        : "";
                const lines = exportLinesFor(item);
                const split = lines.length > 1;
                return (
                  <tr key={item.id}>
                    <td className="border border-slate-200 px-4 py-2">{item.product.name}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right">{ordered > 0 ? formatNumber(ordered) : "—"}</td>
                    <td className="border border-slate-200 px-4 py-2">{item.product.unit?.name ?? "-"}</td>
                    {isCompleted && (
                      <>
                        <td className="border border-slate-200 px-4 py-2">
                          {lines.length === 0
                            ? "-"
                            : lines.map((line) => (
                                <div key={line.id}>
                                  {line.supplier?.name ?? "Không chọn"}
                                  {split && <span className="text-slate-400"> × {formatNumber(line.quantity)}</span>}
                                </div>
                              ))}
                        </td>
                        <td className="border border-slate-200 px-4 py-2 text-right">
                          {lines.length === 0 ? "-" : lines.map((line) => <div key={line.id}>{formatCurrency(line.costPrice)}</div>)}
                        </td>
                        <td className={`border border-slate-200 px-4 py-2 text-right font-medium ${receivedTone}`}>
                          {received != null ? formatNumber(received) : "-"}
                        </td>
                        <td className="whitespace-nowrap border border-slate-200 px-4 py-2">
                          {item.receivedAt ? formatDateTime(item.receivedAt) : "-"}
                        </td>
                        <td className="border border-slate-200 px-4 py-2 text-slate-600">{item.note || "-"}</td>
                        <td className="border border-slate-200 px-4 py-2">
                          {canApprove || item.imageCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setImagesItemId(item.id)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-indigo-600 hover:bg-indigo-50"
                              title={canApprove ? "Xem / đính ảnh chứng từ" : "Xem ảnh chứng từ"}
                            >
                              <Camera size={14} />
                              {item.imageCount}
                            </button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        {canApprove && order.status !== "CANCELLED" && (
          <Link href={`/orders/${id}/process`}>
            <Button>{isCompleted ? "Sửa nhận hàng" : "Xử lý đơn"}</Button>
          </Link>
        )}
        {canCancel && (
          <Button variant="danger" disabled={updateStatus.isPending} onClick={handleCancel}>
            Huỷ đơn
          </Button>
        )}
      </div>

      {imagesItem && (
        <OrderItemImagesModal orderId={id} item={imagesItem} canManage={canApprove && isCompleted} onClose={() => setImagesItemId(null)} />
      )}
    </div>
  );
}
