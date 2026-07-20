"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { useInventoryCounts } from "@/hooks/useInventoryCounts";
import { useClientPagination } from "@/hooks/useClientPagination";
import { clampDateRange } from "@/lib/dateRange";
import { labels } from "@/lib/format";
import type { InventoryCount } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  COMPLETED: "green",
  CANCELLED: "red",
};

export default function InventoryCountsPage() {
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState("");
  const [filter, setFilter] = useState({ from: "", to: "" });
  const [appliedFilter, setAppliedFilter] = useState({ from: "", to: "" });
  const { data, isLoading } = useInventoryCounts({
    warehouseId: warehouseId || undefined,
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
  });
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(data?.items ?? []);

  const columns = useMemo<ColumnDef<InventoryCount>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Kho hàng", accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
      { header: "Ngày kiểm kê", accessorFn: (row) => row.countDate.slice(0, 10), id: "countDate" },
      { header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => <Badge tone={statusTone[row.original.status]}>{labels.inventoryCountStatus(row.original.status)}</Badge>,
      },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/stock/inventory-counts/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
            Xem / Nhập số liệu
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
          <h1 className="text-xl font-semibold text-slate-800">Phiếu kiểm kê</h1>
          <p className="text-sm text-slate-500">Tạo và thực hiện kiểm kê hàng hoá định kỳ, đối chiếu tồn hệ thống với tồn thực tế.</p>
        </div>
        <Link href="/stock/inventory-counts/new">
          <Button>
            <Plus size={16} />
            Tạo phiếu kiểm kê
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">Kho hàng</label>
            <Select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả kho hàng</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Từ ngày (tối đa 3 tháng)</label>
            <Input
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => clampDateRange(e.target.value, f.to, "from"))}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đến ngày</label>
            <Input type="date" value={filter.to} onChange={(e) => setFilter((f) => clampDateRange(f.from, e.target.value, "to"))} />
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
          <CardTitle>Danh sách phiếu kiểm kê</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={pageItems} isLoading={isLoading} />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
      </Card>
    </div>
  );
}
