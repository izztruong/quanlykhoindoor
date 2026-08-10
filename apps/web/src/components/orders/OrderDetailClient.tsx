"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  useCompleteSalesOrderReceiving,
  useConfirmOrderReportedQuantities,
  useSalesOrder,
  useUpdateSalesOrderReceivedDates,
  useUpdateSalesOrderStatus,
} from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { nowForDatetimeLocal, toDatetimeLocal } from "@/lib/dateRange";
import { exportOrderToExcel } from "@/lib/exportOrderExcel";
import { formatDateTime, formatNumber, labels } from "@/lib/format";
import type { AuthUser, SalesOrderItem, SalesOrderStatus } from "@/types";
import { FileSpreadsheet, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  PENDING_CONFIRM: "yellow",
  CONFIRMED: "blue",
  SHORT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

interface StatusAction {
  status: SalesOrderStatus;
  label: string;
  variant: "primary" | "danger";
}

/**
 * Only admins cancel a confirmed/short order. Staff may cancel their own
 * order before it's confirmed. Confirming an order is no longer a bare
 * status flip — it's a Link to the dedicated confirm-and-create-export page
 * (see the "Xác nhận đơn" render below), and completing one goes through the
 * receiving checklist further down once the order is CONFIRMED or SHORT.
 */
function getAvailableActions(status: SalesOrderStatus, role?: AuthUser["role"]): StatusAction[] {
  if (role === "ADMIN") {
    if (status === "DRAFT" || status === "PENDING_CONFIRM" || status === "CONFIRMED" || status === "SHORT") {
      return [{ status: "CANCELLED", label: "Huỷ đơn", variant: "danger" }];
    }
    return [];
  }

  if (status === "DRAFT") {
    return [{ status: "CANCELLED", label: "Huỷ đơn", variant: "danger" }];
  }
  return [];
}

export function OrderDetailClient({ id }: { id: string }) {
  const { data: order, isLoading } = useSalesOrder(id);
  const { data: currentUser } = useCurrentUser();
  const updateStatus = useUpdateSalesOrderStatus(id);
  const completeReceiving = useCompleteSalesOrderReceiving(id);
  const confirmQuantities = useConfirmOrderReportedQuantities(id);
  const updateReceivedDates = useUpdateSalesOrderReceivedDates(id);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Only holds rows the user has actually touched this session; untouched
  // rows fall back to what was saved from an earlier pass, or the ordered
  // quantity as a starting point (see receivedQuantityFor).
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Ngày nhận theo từng dòng. Mặc định chung ở đầu bảng, dòng nào về ngày khác thì sửa riêng.
  const [dateOverrides, setDateOverrides] = useState<Record<string, string>>({});
  const [bulkReceivedAt, setBulkReceivedAt] = useState(nowForDatetimeLocal);

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  const actions = getAvailableActions(order.status, currentUser?.role);
  const canReceive = order.status === "CONFIRMED" || order.status === "SHORT";
  const isAdmin = currentUser?.role === "ADMIN";
  // Chỉ admin được đặt ngày nhận; quán chỉ điền số lượng. Sửa được ở mọi trạng thái sau khi đơn
  // đã xác nhận (kể cả Hoàn thành), nếu không thì ngày sai sẽ bị khoá cứng.
  const canEditDates = isAdmin && (canReceive || order.status === "COMPLETED");
  const showDateColumn = canEditDates || order.status === "COMPLETED";

  function receivedQuantityFor(item: SalesOrderItem): string {
    const override = overrides[item.id];
    if (override !== undefined) return override;
    if (item.receivedQuantity != null) return String(item.receivedQuantity);
    return String(item.quantity);
  }

  function setReceivedQuantity(itemId: string, receivedQuantity: string) {
    setError(null);
    setOverrides((prev) => ({ ...prev, [itemId]: receivedQuantity }));
  }

  /**
   * Dòng đã nhận từ đợt trước GIỮ NGUYÊN ngày cũ — nếu lấy mặc định hôm nay thì mỗi lần mở lại
   * đơn thiếu để nhận bổ sung, toàn bộ ngày sẽ nhảy sang hôm nay và Check Cost tính sai kỳ.
   * Chỉ dòng chưa từng nhận mới lấy ngày mặc định ở đầu bảng.
   */
  function receivedAtFor(item: SalesOrderItem): string {
    const override = dateOverrides[item.id];
    if (override !== undefined) return override;
    if (item.receivedAt) return toDatetimeLocal(item.receivedAt);
    return bulkReceivedAt;
  }

  function setReceivedAt(itemId: string, value: string) {
    setError(null);
    setDateOverrides((prev) => ({ ...prev, [itemId]: value }));
  }

  /** Áp ngày mặc định cho mọi dòng, kể cả dòng đã nhận đợt trước — dùng khi cả đơn về cùng ngày. */
  function applyBulkDateToAll() {
    setError(null);
    const next: Record<string, string> = {};
    for (const item of order!.items) next[item.id] = bulkReceivedAt;
    setDateOverrides(next);
  }

  /**
   * Lưu RIÊNG ngày nhận — không đụng số lượng, trạng thái đơn hay phiếu xuất kho. Tách khỏi nút
   * "Hoàn thành" để admin sửa ngày mà không vô tình hoàn thành đơn.
   */
  function handleSaveDates() {
    setError(null);
    const items = order!.items
      .map((item) => ({ itemId: item.id, receivedAt: receivedAtFor(item) }))
      .filter((it) => it.receivedAt)
      .map((it) => ({ itemId: it.itemId, receivedAt: new Date(it.receivedAt).toISOString() }));
    if (items.length === 0) return;

    updateReceivedDates.mutate(items, {
      onSuccess: (updated) => {
        setDateOverrides({});
        if (updated.affectedCostChecks.length > 0) {
          const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
          alert(
            `Đã lưu ngày nhận. Các phiếu Check Cost sau có kỳ trùm ngày cũ hoặc ngày mới — số liệu của chúng CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
          );
        }
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu ngày nhận thất bại"),
    });
  }

  function fillAllWithOrdered() {
    setError(null);
    const next: Record<string, string> = {};
    for (const item of order!.items) next[item.id] = String(item.quantity);
    setOverrides(next);
  }

  /** Sum of the linked stock export's lines for this product — what admin reported getting from suppliers. */
  function reportedQuantityFor(item: SalesOrderItem): number {
    return (order!.stockExport?.items ?? [])
      .filter((line) => line.productId === item.productId)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
  }

  function handleConfirmQuantities() {
    setError(null);
    confirmQuantities.mutate(undefined, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xác nhận thất bại"),
    });
  }

  function handleStatusChange(status: SalesOrderStatus) {
    if (status === "CANCELLED" && !confirm("Bạn có chắc muốn huỷ đơn hàng này?")) return;
    setError(null);
    updateStatus.mutate(status, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Cập nhật trạng thái thất bại"),
    });
  }

  function handleComplete() {
    setError(null);
    const items = order!.items.map((item) => {
      const receivedAt = receivedAtFor(item);
      return {
        itemId: item.id,
        receivedQuantity: Number(receivedQuantityFor(item)) || 0,
        receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
      };
    });

    completeReceiving.mutate(items, {
      onSuccess: () => {
        setOverrides({});
        setDateOverrides({});
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Cập nhật thất bại"),
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
          {currentUser?.role === "ADMIN" && (
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
          <div className="flex flex-wrap items-end gap-2">
            {canEditDates && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Ngày nhận mặc định</label>
                  <Input
                    type="datetime-local"
                    className="h-8 w-52"
                    value={bulkReceivedAt}
                    onChange={(e) => setBulkReceivedAt(e.target.value)}
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={applyBulkDateToAll}>
                  Áp ngày cho tất cả
                </Button>
                <Button variant="secondary" size="sm" onClick={handleSaveDates} disabled={updateReceivedDates.isPending}>
                  {updateReceivedDates.isPending ? "Đang lưu..." : "Lưu ngày nhận"}
                </Button>
              </>
            )}
            {canReceive && (
              <Button variant="secondary" size="sm" onClick={fillAllWithOrdered}>
                Điền theo số đặt
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border border-slate-200 px-4 py-2 text-left">Hàng hoá</th>
                <th className="border border-slate-200 px-4 py-2 text-right">Số lượng đặt</th>
                <th className="border border-slate-200 px-4 py-2 text-left">Đơn vị</th>
                {order.status === "PENDING_CONFIRM" && <th className="border border-slate-200 px-4 py-2 text-left">SL nhận</th>}
                {order.status === "PENDING_CONFIRM" && <th className="border border-slate-200 px-4 py-2 text-left">Ghi chú</th>}
                {(canReceive || order.status === "COMPLETED") && <th className="border border-slate-200 px-4 py-2 text-left">SL thực nhận</th>}
                {showDateColumn && <th className="border border-slate-200 px-4 py-2 text-left">Ngày nhận</th>}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const receivedQty = Number(receivedQuantityFor(item));
                const differsFromOrdered = canReceive && Math.abs(receivedQty - Number(item.quantity)) > 1e-6;
                const reportedQty = reportedQuantityFor(item);
                const reportedTone =
                  reportedQty < Number(item.quantity)
                    ? "text-red-600"
                    : reportedQty > Number(item.quantity)
                      ? "text-emerald-600"
                      : "";
                return (
                  <tr key={item.id}>
                    <td className="border border-slate-200 px-4 py-2">{item.product.name}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right">{item.quantity}</td>
                    <td className="border border-slate-200 px-4 py-2">{item.product.unit?.name ?? "-"}</td>
                    {canReceive && (
                      <td className="border border-slate-200 px-4 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className={`h-8 w-28 ${differsFromOrdered ? "border-amber-400 text-amber-700" : ""}`}
                          value={receivedQuantityFor(item)}
                          onChange={(e) => setReceivedQuantity(item.id, e.target.value)}
                        />
                      </td>
                    )}
                    {!canReceive && order.status === "COMPLETED" && (
                      <td className="border border-slate-200 px-4 py-2">{item.receivedQuantity != null ? String(item.receivedQuantity) : item.quantity}</td>
                    )}
                    {showDateColumn && (
                      <td className="whitespace-nowrap border border-slate-200 px-4 py-2">
                        {canEditDates ? (
                          <Input
                            type="datetime-local"
                            className="h-8 w-52"
                            value={receivedAtFor(item)}
                            onChange={(e) => setReceivedAt(item.id, e.target.value)}
                          />
                        ) : item.receivedAt ? (
                          formatDateTime(item.receivedAt)
                        ) : (
                          "-"
                        )}
                      </td>
                    )}
                    {order.status === "PENDING_CONFIRM" && (
                      <td className={`border border-slate-200 px-4 py-2 font-medium ${reportedTone}`}>{formatNumber(reportedQty)}</td>
                    )}
                    {order.status === "PENDING_CONFIRM" && (
                      <td className="border border-slate-200 px-4 py-2 text-slate-600">{item.note ?? "-"}</td>
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
        {currentUser?.role === "ADMIN" && order.status === "DRAFT" && (
          <Link href={`/orders/${id}/confirm`}>
            <Button>Xác nhận đơn</Button>
          </Link>
        )}
        {order.status === "PENDING_CONFIRM" && (
          <Button onClick={handleConfirmQuantities} disabled={confirmQuantities.isPending}>
            {confirmQuantities.isPending ? "Đang lưu..." : "Xác nhận"}
          </Button>
        )}
        {canReceive && (
          <Button onClick={handleComplete} disabled={completeReceiving.isPending}>
            {completeReceiving.isPending ? "Đang lưu..." : "Hoàn thành"}
          </Button>
        )}
        {actions.map((action) => (
          <Button
            key={action.status}
            variant={action.variant}
            disabled={updateStatus.isPending}
            onClick={() => handleStatusChange(action.status)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
