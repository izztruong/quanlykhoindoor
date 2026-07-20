"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCostCheckList } from "@/hooks/useCostChecks";
import { useClientPagination } from "@/hooks/useClientPagination";
import { formatDateTime } from "@/lib/format";
import type { CostCheck } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

export default function CostChecksPage() {
  const { data = [], isLoading } = useCostCheckList();
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(data);

  const columns = useMemo<ColumnDef<CostCheck>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Quán", accessorFn: (row) => row.user?.name ?? "-", id: "user" },
      { header: "Từ", accessorFn: (row) => formatDateTime(row.openingStockCheck.checkedAt), id: "opening" },
      { header: "Đến", accessorFn: (row) => formatDateTime(row.closingStockCheck.checkedAt), id: "closing" },
      { header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/cost-checks/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
            Xem báo cáo
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
          <h1 className="text-xl font-semibold text-slate-800">Check Cost</h1>
          <p className="text-sm text-slate-500">Đối soát nguyên liệu tiêu hao thực tế so với công thức, theo từng quán.</p>
        </div>
        <Link href="/cost-checks/new">
          <Button>
            <Plus size={16} />
            Tạo phiếu Check Cost
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={pageItems} isLoading={isLoading} />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
      </Card>
    </div>
  );
}
