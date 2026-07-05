"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSalesOrder, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { exportOrderToExcel } from "@/lib/exportOrderExcel";
import { formatDateTime, labels } from "@/lib/format";
import type { AuthUser, SalesOrderStatus } from "@/types";
import { FileSpreadsheet, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

interface StatusAction {
  status: SalesOrderStatus;
  label: string;
  variant: "primary" | "danger";
}

/**
 * Only admins confirm an order (and can cancel it at any open stage). Staff
 * may cancel their own order before it's confirmed, and complete it
 * themselves once an admin has confirmed it — mirrors the backend rule in
 * salesOrders.service.ts.
 */
function getAvailableActions(status: SalesOrderStatus, role?: AuthUser["role"]): StatusAction[] {
  if (role === "ADMIN") {
    if (status === "DRAFT") {
      return [
        { status: "CONFIRMED", label: "Xác nhận đơn", variant: "primary" },
        { status: "CANCELLED", label: "Huỷ đơn", variant: "danger" },
      ];
    }
    if (status === "CONFIRMED") {
      return [
        { status: "COMPLETED", label: "Hoàn thành (xuất kho)", variant: "primary" },
        { status: "CANCELLED", label: "Huỷ đơn", variant: "danger" },
      ];
    }
    return [];
  }

  if (status === "DRAFT") {
    return [{ status: "CANCELLED", label: "Huỷ đơn", variant: "danger" }];
  }
  if (status === "CONFIRMED") {
    return [{ status: "COMPLETED", label: "Hoàn thành (xuất kho)", variant: "primary" }];
  }
  return [];
}

export function OrderDetailClient({ id }: { id: string }) {
  const { data: order, isLoading } = useSalesOrder(id);
  const { data: currentUser } = useCurrentUser();
  const updateStatus = useUpdateSalesOrderStatus(id);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  const actions = getAvailableActions(order.status, currentUser?.role);

  function handleStatusChange(status: SalesOrderStatus) {
    setError(null);
    updateStatus.mutate(status, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Cập nhật trạng thái thất bại"),
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
          <a href={`/print/orders/${id}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              <Printer size={14} />
              In hoá đơn
            </Button>
          </a>
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
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{item.product.name}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2">{item.product.unit?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {actions.length > 0 && (
        <div className="flex justify-end gap-2">
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
      )}
    </div>
  );
}
