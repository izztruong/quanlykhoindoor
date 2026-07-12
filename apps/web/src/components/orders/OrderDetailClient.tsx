"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useCompleteSalesOrderReceiving, useSalesOrder, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { exportOrderToExcel } from "@/lib/exportOrderExcel";
import { formatDateTime, labels } from "@/lib/format";
import type { AuthUser, SalesOrderItem, SalesOrderStatus } from "@/types";
import { FileSpreadsheet, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
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
    if (status === "DRAFT" || status === "CONFIRMED" || status === "SHORT") {
      return [{ status: "CANCELLED", label: "Huỷ đơn", variant: "danger" }];
    }
    return [];
  }

  if (status === "DRAFT") {
    return [{ status: "CANCELLED", label: "Huỷ đơn", variant: "danger" }];
  }
  return [];
}

interface ReceivingOverride {
  received?: boolean;
  receivedQuantity?: string;
}

export function OrderDetailClient({ id }: { id: string }) {
  const { data: order, isLoading } = useSalesOrder(id);
  const { data: currentUser } = useCurrentUser();
  const updateStatus = useUpdateSalesOrderStatus(id);
  const completeReceiving = useCompleteSalesOrderReceiving(id);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ReceivingOverride>>({});

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  const actions = getAvailableActions(order.status, currentUser?.role);
  const canReceive = order.status === "CONFIRMED" || order.status === "SHORT";

  function receivedFor(item: SalesOrderItem): boolean {
    return overrides[item.id]?.received ?? item.received;
  }

  function receivedQuantityFor(item: SalesOrderItem): string {
    const override = overrides[item.id]?.receivedQuantity;
    if (override !== undefined) return override;
    return item.receivedQuantity != null ? String(item.receivedQuantity) : "";
  }

  function setReceived(itemId: string, received: boolean) {
    setError(null);
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], received } }));
  }

  function setReceivedQuantity(itemId: string, receivedQuantity: string) {
    setError(null);
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], receivedQuantity } }));
  }

  function toggleAllReceived(checked: boolean) {
    setError(null);
    const next: Record<string, ReceivingOverride> = {};
    for (const item of order!.items) next[item.id] = { received: checked };
    setOverrides(next);
  }

  function handleStatusChange(status: SalesOrderStatus) {
    setError(null);
    updateStatus.mutate(status, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Cập nhật trạng thái thất bại"),
    });
  }

  function handleComplete() {
    setError(null);
    const items = order!.items.map((item) => {
      const received = receivedFor(item);
      const rawQty = receivedQuantityFor(item);
      return {
        itemId: item.id,
        received,
        receivedQuantity: !received && rawQty !== "" ? Number(rawQty) : undefined,
      };
    });

    completeReceiving.mutate(items, {
      onSuccess: () => setOverrides({}),
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
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Hàng hoá</th>
                <th className="px-4 py-2 text-right">Số lượng</th>
                <th className="px-4 py-2 text-left">Đơn vị</th>
                {canReceive && (
                  <th className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Đã nhận</span>
                      <input
                        type="checkbox"
                        checked={order.items.every((item) => receivedFor(item))}
                        onChange={(e) => toggleAllReceived(e.target.checked)}
                        className="h-4 w-4"
                        title="Tích/bỏ tích tất cả"
                      />
                    </div>
                  </th>
                )}
                {order.status === "COMPLETED" && <th className="px-4 py-2 text-center">Đã nhận</th>}
                {canReceive && <th className="px-4 py-2 text-left">SL đã nhận</th>}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const received = receivedFor(item);
                return (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">{item.product.name}</td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2">{item.product.unit?.name ?? "-"}</td>
                    {canReceive && (
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={received}
                          onChange={(e) => setReceived(item.id, e.target.checked)}
                          className="h-4 w-4"
                        />
                      </td>
                    )}
                    {order.status === "COMPLETED" && (
                      <td className="px-4 py-2 text-center">{item.received ? "✓" : "-"}</td>
                    )}
                    {canReceive && (
                      <td className="px-4 py-2">
                        {!received && (
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            max={Number(item.quantity)}
                            className="h-8 w-28"
                            value={receivedQuantityFor(item)}
                            onChange={(e) => setReceivedQuantity(item.id, e.target.value)}
                          />
                        )}
                      </td>
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
