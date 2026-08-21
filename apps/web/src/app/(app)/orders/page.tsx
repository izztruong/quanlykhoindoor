"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { useUsers } from "@/hooks/useUsers";
import { useCurrentUser } from "@/lib/auth";
import { formatDateTime, formatNumber, labels } from "@/lib/format";
import type { SalesOrderListRow } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  PENDING_CONFIRM: "yellow",
  CONFIRMED: "blue",
  SHORT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

export default function OrdersPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "ADMIN";
  const { data: users = [] } = useUsers({ enabled: isAdmin });
  const [status, setStatus] = useState("");
  const [createdById, setCreatedById] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => setPage(1), [status, createdById, dateRange.from, dateRange.to]);
  const { data, isLoading } = useSalesOrders({
    status,
    createdById: isAdmin ? createdById || undefined : undefined,
    from: dateRange.from || undefined,
    to: dateRange.to || undefined,
    page,
    pageSize,
  });
  const columns = useMemo<ColumnDef<SalesOrderListRow>[]>(
    () => [
      {
        header: "Mã đơn",
        id: "code",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <LatenessDot dueAt={row.original.dueAt} isLate={row.original.isLate} submittedAt={row.original.createdAt} />
            <Link href={`/orders/${row.original.id}`} className="font-medium text-indigo-600 hover:underline">
              {row.original.code}
            </Link>
          </span>
        ),
      },
      { header: "Tài khoản", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Kho", accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
      { header: "Ngày đặt", accessorFn: (row) => formatDateTime(row.orderDate), id: "orderDate" },
      {
        header: "Tổng số lượng",
        id: "quantity",
        accessorFn: (row) => formatNumber(row.totalQuantity),
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
        <div className="flex items-center gap-2">
          <Link href="/orders/new">
            <Button>
              <Plus size={16} />
              Tạo đơn hàng
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Trạng thái</label>
            <div className="w-48">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Chưa xác nhận</option>
                <option value="PENDING_CONFIRM">Chờ xác nhận</option>
                <option value="CONFIRMED">Đã xác nhận</option>
                <option value="SHORT">Thiếu</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="CANCELLED">Đã huỷ</option>
              </Select>
            </div>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Tài khoản</label>
              <div className="w-48">
                <Select value={createdById} onChange={(e) => setCreatedById(e.target.value)}>
                  <option value="">Tất cả tài khoản</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          <DateRangeFilter value={dateRange} onChange={setDateRange} label="Ngày đặt" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn hàng</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
