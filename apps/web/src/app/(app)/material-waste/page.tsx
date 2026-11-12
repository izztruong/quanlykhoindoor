"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useMaterialWasteList } from "@/hooks/useMaterialWaste";
import { clampDateRange } from "@/lib/dateRange";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { MaterialWaste } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { parsePage, parsePageSize, useListUrlState } from "@/hooks/useListUrlState";
import { useMemo, useState } from "react";

export default function MaterialWastePage() {
  const { canOpen } = useCan();
  // Bộ lọc ĐÃ áp + trang nằm trên URL (hooks/useListUrlState) để mở chi tiết rồi quay lại vẫn giữ;
  // ô nháp `filter` chỉ là state tạm, khởi tạo từ chính bộ lọc trên URL.
  const { values: listState, update } = useListUrlState({ ...{ from: "", to: "" }, page: "1", pageSize: "20" });
  const { page: pageParam, pageSize: pageSizeParam, ...appliedFilter } = listState;
  const page = parsePage(pageParam);
  const pageSize = parsePageSize(pageSizeParam);
  const setPage = (p: number) => update({ page: String(p) });
  const [filter, setFilter] = useState(appliedFilter);
  const { data, isLoading } = useMaterialWasteList({
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<MaterialWaste>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Thời gian", accessorFn: (row) => formatDateTime(row.wasteAt), id: "createdAt" },
      { header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/material-waste/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
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
          <h1 className="text-xl font-semibold text-slate-800">Phiếu huỷ nguyên liệu</h1>
          <p className="text-sm text-slate-500">Ghi nhận nguyên liệu hỏng/đổ bỏ tại quán — dùng để tính Check Cost.</p>
        </div>
        {canOpen("/material-waste/new") && (
          <Link href="/material-waste/new">
            <Button>
              <Plus size={16} />
              Tạo phiếu huỷ
            </Button>
          </Link>
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
          <CardTitle>Danh sách phiếu huỷ</CardTitle>
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
