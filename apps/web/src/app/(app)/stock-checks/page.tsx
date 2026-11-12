"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { stockCheckTypeLabel } from "@/lib/deadlines";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUserOptions } from "@/hooks/useUsers";
import { useCurrentUser } from "@/lib/auth";
import { hasScopeAll, useCan } from "@/lib/permissions";
import { clampDateRange } from "@/lib/dateRange";
import { formatDateTime } from "@/lib/format";
import type { StockCheck } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { parsePage, parsePageSize, useListUrlState } from "@/hooks/useListUrlState";
import { useMemo, useState } from "react";

export default function StockChecksPage() {
  const { canOpen } = useCan();
  const { data: currentUser } = useCurrentUser();
  // Phạm vi SELF chỉ thấy phiếu của chính mình (router tự ép theo req.user), nên ô lọc theo quán
  // vô nghĩa với họ.
  const scopeAll = hasScopeAll(currentUser);
  const { data: users = [] } = useUserOptions({ enabled: scopeAll });

  // Bộ lọc ĐÃ áp + trang nằm trên URL (hooks/useListUrlState) để mở chi tiết rồi quay lại vẫn giữ;
  // ô nháp `filter` chỉ là state tạm, khởi tạo từ chính bộ lọc trên URL.
  // `createdById` áp dụng ngay khi đổi, không chờ bấm "Lọc" như khoảng ngày — chọn xong là thấy kết quả luôn.
  const { values: listState, update } = useListUrlState({ from: "", to: "", createdById: "", page: "1", pageSize: "20" });
  const { page: pageParam, pageSize: pageSizeParam, createdById, ...appliedFilter } = listState;
  const page = parsePage(pageParam);
  const pageSize = parsePageSize(pageSizeParam);
  const setPage = (p: number) => update({ page: String(p) });
  const [filter, setFilter] = useState(appliedFilter);
  const { data, isLoading } = useStockChecks({
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    createdById: createdById || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<StockCheck>[]>(
    () => [
      {
        header: "Mã phiếu",
        id: "code",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <LatenessDot dueAt={row.original.dueAt} isLate={row.original.isLate} submittedAt={row.original.createdAt} />
            {row.original.code}
          </span>
        ),
      },
      { header: "Loại", accessorFn: (row) => (row.type ? stockCheckTypeLabel[row.type] : "-"), id: "type" },
      { header: "Thời gian kiểm", accessorFn: (row) => formatDateTime(row.checkedAt), id: "checkedAt" },
      // Giờ hệ thống ghi nhận, khác "Thời gian kiểm" vốn do quán tự nhập — đặt cạnh nhau để nhìn
      // là thấy ngay phiếu kiểm hôm trước nhưng mấy hôm sau mới nhập.
      { header: "Thời gian tạo", accessorFn: (row) => formatDateTime(row.createdAt), id: "createdAt" },
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
        {canOpen("/stock-checks/new") && (
          <Link href="/stock-checks/new">
            <Button>
              <Plus size={16} />
              Tạo phiếu kiểm kê
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
          {scopeAll && (
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-slate-500">Người tạo</label>
              <Select
                value={createdById}
                onChange={(e) => update({ createdById: e.target.value, page: "1" })}
              >
                <option value="">Tất cả tài khoản</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
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
          <CardTitle>Danh sách phiếu kiểm kê</CardTitle>
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
