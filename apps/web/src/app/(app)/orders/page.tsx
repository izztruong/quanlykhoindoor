"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { formatDateTime, formatNumber, labels } from "@/lib/format";
import type { SalesOrder } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

export default function OrdersPage() {
  const [status, setStatus] = useState("");
  const { data, isLoading } = useSalesOrders({ status });

  const columns = useMemo<ColumnDef<SalesOrder>[]>(
    () => [
      {
        header: "Mã đơn",
        id: "code",
        cell: ({ row }) => (
          <Link href={`/orders/${row.original.id}`} className="font-medium text-indigo-600 hover:underline">
            {row.original.code}
          </Link>
        ),
      },
      { header: "Tài khoản", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Kho", accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
      { header: "Ngày đặt", accessorFn: (row) => formatDateTime(row.orderDate), id: "orderDate" },
      {
        header: "Tổng số lượng",
        id: "quantity",
        accessorFn: (row) => formatNumber(row.items.reduce((sum, it) => sum + Number(it.quantity), 0)),
      },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => <Badge tone={statusTone[row.original.status]}>{labels.salesOrderStatus(row.original.status)}</Badge>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Đơn hàng bán</h1>
          <p className="text-sm text-slate-500">Quản lý đơn hàng nội bộ theo tài khoản.</p>
        </div>
        <Link href="/orders/new">
          <Button>
            <Plus size={16} />
            Tạo đơn hàng
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex items-center gap-3">
          <div className="w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              <option value="DRAFT">Nháp</option>
              <option value="CONFIRMED">Đã xác nhận</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="CANCELLED">Đã huỷ</option>
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn hàng</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />
        </CardBody>
      </Card>
    </div>
  );
}
