"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useClientPagination } from "@/hooks/useClientPagination";
import { clampDateRange } from "@/lib/dateRange";
import { formatDateTime } from "@/lib/format";
import type { StockCheck } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function StockChecksPage() {
  const [filter, setFilter] = useState({ from: "", to: "" });
  const [appliedFilter, setAppliedFilter] = useState({ from: "", to: "" });
  const { data = [], isLoading } = useStockChecks({
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
  });
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(data);

  const columns = useMemo<ColumnDef<StockCheck>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Thời gian kiểm", accessorFn: (row) => formatDateTime(row.checkedAt), id: "createdAt" },
      { header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/stock-checks/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
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
          <h1 className="text-xl font-semibold text-slate-800">Phiếu kiểm kê</h1>
          <p className="text-sm text-slate-500">Kiểm tồn kho hiện có, không cần chọn kho hàng.</p>
        </div>
        <Link href="/stock-checks/new">
          <Button>
            <Plus size={16} />
            Tạo phiếu kiểm kê
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
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
