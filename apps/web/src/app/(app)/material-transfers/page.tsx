"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { MaterialTransferExcelActions } from "@/components/materialTransfers/MaterialTransferExcelActions";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useMaterialTransferList } from "@/hooks/useMaterialTransfers";
import { clampDateRange } from "@/lib/dateRange";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { MaterialTransfer } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { parsePage, parsePageSize, useListUrlState } from "@/hooks/useListUrlState";
import { useMemo, useState } from "react";

export default function MaterialTransfersPage() {
  const { canOpen } = useCan();
  // Bộ lọc ĐÃ áp + trang nằm trên URL (hooks/useListUrlState) để mở chi tiết rồi quay lại vẫn giữ;
  // ô nháp `filter` chỉ là state tạm, khởi tạo từ chính bộ lọc trên URL.
  const { values: listState, update } = useListUrlState({ ...{ from: "", to: "" }, page: "1", pageSize: "20" });
  const { page: pageParam, pageSize: pageSizeParam, ...appliedFilter } = listState;
  const page = parsePage(pageParam);
  const pageSize = parsePageSize(pageSizeParam);
  const setPage = (p: number) => update({ page: String(p) });
  const [filter, setFilter] = useState(appliedFilter);
  const { data, isLoading } = useMaterialTransferList({
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<MaterialTransfer>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Thời gian", accessorFn: (row) => formatDateTime(row.transferAt), id: "transferAt" },
      { header: "Quán gửi", accessorFn: (row) => row.fromUser?.name ?? "-", id: "fromUser" },
      { header: "Quán nhận", accessorFn: (row) => row.toUser?.name ?? "-", id: "toUser" },
      { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/material-transfers/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
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
          <h1 className="text-xl font-semibold text-slate-800">Phiếu điều chuyển</h1>
          <p className="text-sm text-slate-500">Điều chuyển nguyên liệu giữa các quán, không qua kho trung tâm.</p>
        </div>
        {canOpen("/material-transfers/new") && (
          <div className="flex items-center gap-2">
            <MaterialTransferExcelActions />
            <Link href="/material-transfers/new">
              <Button>
                <Plus size={16} />
                Tạo phiếu điều chuyển
              </Button>
            </Link>
          </div>
        )}
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
              update({ ...filter, page: "1" });
            }}
          >
            Lọc
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu điều chuyển</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => update({ pageSize: String(size), page: "1" })}
          />
        </CardBody>
      </Card>
    </div>
  );
}
