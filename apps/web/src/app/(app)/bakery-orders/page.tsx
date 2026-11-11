"use client";

import { BakeryOrderStatusBadge } from "@/components/bakeryOrders/BakeryOrderStatusBadge";
import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useBakeryOrderList, type BakeryOrderFilter } from "@/hooks/useBakeryOrders";
import { useUserOptions } from "@/hooks/useUsers";
import { clampDateRange } from "@/lib/dateRange";
import { BAKERY_ORDER_STATUS_OPTIONS, formatDateOnly } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { AuthUser, BakeryOrder, BakeryOrderStatus } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Mỗi vai trò mở danh sách ra là thấy ngay việc của mình: tiệm bánh thấy đơn chờ xác nhận, người vận
 * chuyển thấy đơn chờ lấy. Quán và admin thấy hết — đơn của quán ít, lọc sẵn lại làm khuất đơn mới đặt.
 */
function defaultStatus(user: AuthUser | null | undefined): BakeryOrderStatus | "" {
  if (!user || user.isSystem) return "";
  if (user.isBakery) return "ORDERED";
  if (!user.isShop && user.permissions.includes("BAKERY_ORDERS.PICKUP")) return "CONFIRMED";
  return "";
}

export default function BakeryOrdersPage() {
  const { user, canOpen, scopeAll } = useCan();
  const { data: shops = [] } = useUserOptions({ scope: "shopOnly", enabled: scopeAll });

  const initial: BakeryOrderFilter = { status: defaultStatus(user), shopUserId: "", from: "", to: "" };
  const [filter, setFilter] = useState<BakeryOrderFilter>(initial);
  const [appliedFilter, setAppliedFilter] = useState<BakeryOrderFilter>(initial);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, isLoading } = useBakeryOrderList({
    status: appliedFilter.status || undefined,
    shopUserId: appliedFilter.shopUserId || undefined,
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<BakeryOrder>[]>(
    () => [
      { header: "Mã đơn", accessorKey: "code" },
      { header: "Ngày giao", accessorFn: (row) => formatDateOnly(row.deliveryOn), id: "deliveryOn" },
      { header: "Quán", accessorFn: (row) => row.shopUser?.name ?? "-", id: "shopUser" },
      { header: "Tiệm bánh", accessorFn: (row) => row.supplier?.name ?? "-", id: "supplier" },
      { header: "Số loại bánh", accessorFn: (row) => row._count?.items ?? 0, id: "itemCount" },
      { header: "Trạng thái", id: "status", cell: ({ row }) => <BakeryOrderStatusBadge status={row.original.status} /> },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/bakery-orders/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
            Xem chi tiết
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Đơn bánh</h1>
          <p className="text-sm text-slate-500">
            Quán đặt → tiệm bánh xác nhận → vận chuyển lấy hàng → quán nhận. Quán nhận xong thì phiếu nhập kho tự sinh.
          </p>
        </div>
        {canOpen("/bakery-orders/new") && (
          <Link href="/bakery-orders/new">
            <Button>
              <Plus size={16} />
              Đặt bánh
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">Trạng thái</label>
            <Select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as BakeryOrderStatus | "" }))}>
              <option value="">Tất cả</option>
              {BAKERY_ORDER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          {scopeAll && (
            <div className="w-56">
              <label className="mb-1 block text-xs font-medium text-slate-500">Quán</label>
              <Select value={filter.shopUserId} onChange={(e) => setFilter((f) => ({ ...f, shopUserId: e.target.value }))}>
                <option value="">Tất cả quán</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Giao từ ngày</label>
            <Input
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(e.target.value, f.to ?? "", "from") }))}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đến ngày</label>
            <Input
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(f.from ?? "", e.target.value, "to") }))}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setAppliedFilter(filter);
              setPage(1);
            }}
          >
            Lọc
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn bánh</CardTitle>
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
