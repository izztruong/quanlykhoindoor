"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSalesOrders, useSetSalesOrderProcessed } from "@/hooks/useSalesOrders";
import { useUserOptions } from "@/hooks/useUsers";
import { useCurrentUser } from "@/lib/auth";
import { can, hasScopeAll, useCan } from "@/lib/permissions";
import { formatDateTime, formatNumber, labels } from "@/lib/format";
import type { SalesOrderListRow } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "yellow",
  CANCELLED: "red",
};

/**
 * Ô tích "Đã xử lý" bật/tắt ngay tại dòng. Tách thành component vì mỗi dòng cần một mutation riêng
 * theo id đơn (hook nhận id), không gọi hook trong vòng lặp cell được.
 */
function ProcessedCell({ row, canApprove }: { row: SalesOrderListRow; canApprove: boolean }) {
  const setProcessed = useSetSalesOrderProcessed(row.id);
  const checked = Boolean(row.processedAt);

  if (row.status === "CANCELLED") return <span className="text-slate-400">—</span>;
  if (!canApprove) {
    return checked ? <Check size={16} className="text-emerald-600" /> : <span className="text-slate-400">—</span>;
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={setProcessed.isPending}
      onChange={() => setProcessed.mutate(!checked)}
      title={checked ? "Bỏ dấu đã xử lý" : "Đánh dấu đã xử lý"}
      className="h-4 w-4 cursor-pointer accent-indigo-600"
    />
  );
}

export default function OrdersPage() {
  const { canOpen } = useCan();
  const { data: currentUser } = useCurrentUser();
  // Chỉ tài khoản thấy dữ liệu mọi quán mới cần ô lọc theo quán.
  const scopeAll = hasScopeAll(currentUser);
  // Chỉ người có quyền xử lý đơn mới bật/tắt được ô tích; người khác chỉ thấy dấu.
  const canApprove = can(currentUser, "ORDERS", "APPROVE");
  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  const [status, setStatus] = useState("");
  const [processed, setProcessed] = useState("");
  const [createdById, setCreatedById] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Đổi bộ lọc thì về trang 1 ngay trong handler, không qua effect. Làm trong effect thì React
  // render một lượt với (bộ lọc mới, trang cũ) trước khi effect chạy — và lượt đó đã kịp gọi API
  // bằng số trang không còn đúng.
  function changeStatus(value: string) {
    setStatus(value);
    setPage(1);
  }
  function changeProcessed(value: string) {
    setProcessed(value);
    setPage(1);
  }
  function changeCreatedById(value: string) {
    setCreatedById(value);
    setPage(1);
  }
  function changeDateRange(value: { from: string; to: string }) {
    setDateRange(value);
    setPage(1);
  }

  const { data, isLoading } = useSalesOrders({
    status,
    processed: processed || undefined,
    createdById: scopeAll ? createdById || undefined : undefined,
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
      { header: "Ngày đặt", accessorFn: (row) => formatDateTime(row.orderDate), id: "orderDate" },
      {
        header: "Tổng số lượng",
        id: "quantity",
        accessorFn: (row) => formatNumber(row.totalQuantity),
      },
      {
        header: "Đã xử lý",
        id: "processed",
        cell: ({ row }) => <ProcessedCell row={row.original} canApprove={canApprove} />,
      },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => <Badge tone={statusTone[row.original.status]}>{labels.salesOrderStatus(row.original.status)}</Badge>,
      },
    ],
    [canApprove],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Đơn hàng bán</h1>
          <p className="text-sm text-slate-500">Quản lý đơn hàng nội bộ theo tài khoản.</p>
        </div>
        <div className="flex items-center gap-2">
          {canOpen("/orders/new") && (
            <Link href="/orders/new">
              <Button>
                <Plus size={16} />
                Tạo đơn hàng
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Trạng thái</label>
            <div className="w-48">
              <Select value={status} onChange={(e) => changeStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Đã đặt</option>
                <option value="CANCELLED">Đã huỷ</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Xử lý</label>
            <div className="w-40">
              <Select value={processed} onChange={(e) => changeProcessed(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="false">Chưa xử lý</option>
                <option value="true">Đã xử lý</option>
              </Select>
            </div>
          </div>
          {scopeAll && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Tài khoản</label>
              <div className="w-48">
                <Select value={createdById} onChange={(e) => changeCreatedById(e.target.value)}>
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
          <DateRangeFilter value={dateRange} onChange={changeDateRange} label="Ngày đặt" />
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
