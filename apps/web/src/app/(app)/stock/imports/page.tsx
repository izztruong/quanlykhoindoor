"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { StockImportExcelActions } from "@/components/stock/StockImportExcelActions";
import { useStockImports } from "@/hooks/useStockImports";
import { useCurrentUser } from "@/lib/auth";
import { formatCurrency, formatDateTime, labels } from "@/lib/format";
import { hasScopeAll, useCan } from "@/lib/permissions";
import type { StockImport } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Camera, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function StockImportsPage() {
  const { canOpen } = useCan();
  const { data: currentUser } = useCurrentUser();
  // Quán chỉ thấy phiếu của kho mình (server lọc theo warehouse.shopUserId), nên ô lọc kho chỉ có
  // nghĩa với tài khoản thấy dữ liệu mọi quán.
  const scopeAll = hasScopeAll(currentUser);
  const { data: warehouses = [] } = useWarehouses();
  const [warehouseId, setWarehouseId] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Đổi bộ lọc thì về trang 1 ngay trong handler, không qua effect — effect chạy sau một lượt render
  // đã kịp gọi API bằng số trang không còn đúng.
  function changeWarehouse(value: string) {
    setWarehouseId(value);
    setPage(1);
  }
  function changeDateRange(value: { from: string; to: string }) {
    setDateRange(value);
    setPage(1);
  }

  const { data, isLoading } = useStockImports({
    warehouseId: scopeAll ? warehouseId || undefined : undefined,
    from: dateRange.from || undefined,
    to: dateRange.to || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<StockImport>[]>(
    () => [
      {
        header: "Mã phiếu",
        id: "code",
        cell: ({ row }) => (
          <Link href={`/stock/imports/${row.original.id}`} className="font-medium text-indigo-600 hover:underline">
            {row.original.code}
          </Link>
        ),
      },
      { header: "Loại", accessorFn: (row) => labels.stockImportType(row.type), id: "type" },
      { header: "Thời gian", accessorFn: (row) => formatDateTime(row.transactionAt), id: "transactionAt" },
      { header: "Quán", accessorFn: (row) => row.warehouse?.shopUser?.name ?? row.warehouse?.name ?? "-", id: "shop" },
      { header: "Nhà cung cấp", accessorFn: (row) => row.supplier?.name ?? "—", id: "supplier" },
      {
        header: "Tổng tiền vốn",
        accessorFn: (row) => formatCurrency(row.items.reduce((sum, it) => sum + Number(it.costAmount), 0)),
        id: "total",
      },
      {
        header: "Chứng từ",
        id: "images",
        cell: ({ row }) =>
          row.original.imageCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Camera size={14} />
              {row.original.imageCount}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      { header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "—", id: "createdBy" },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Phiếu nhập kho</h1>
          <p className="text-sm text-slate-500">
            Hàng thực nhận về quán. Check Cost lấy cột &quot;Nhận trong kỳ&quot; từ chính các phiếu này.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Nhập Excel chỉ tạo phiếu mới nên gác cùng quyền với nút Tạo phiếu. */}
          {canOpen("/stock/imports/new") && (
            <StockImportExcelActions
              filter={{
                warehouseId: scopeAll ? warehouseId || undefined : undefined,
                from: dateRange.from || undefined,
                to: dateRange.to || undefined,
              }}
              scopeAll={scopeAll}
            />
          )}
          {canOpen("/stock/imports/new") && (
            <Link href="/stock/imports/new">
              <Button>
                <Plus size={16} />
                Tạo phiếu
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          {scopeAll && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Kho</label>
              <div className="w-56">
                <Select value={warehouseId} onChange={(e) => changeWarehouse(e.target.value)}>
                  <option value="">Tất cả kho</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.shopUser ? ` — ${w.shopUser.name}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          <DateRangeFilter value={dateRange} onChange={changeDateRange} label="Thời gian nhập" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu</CardTitle>
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
