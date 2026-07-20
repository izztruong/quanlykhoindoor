"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { formatCurrency, formatDateTime, labels } from "@/lib/format";
import type { PagedResult, StockTransaction } from "@/types";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  COMPLETED: "green",
  CANCELLED: "red",
};

interface StockTransactionListProps {
  title: string;
  description: string;
  useList: (filter: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) => UseQueryResult<PagedResult<StockTransaction>>;
  newHref: string;
  typeLabel: (v: string) => string;
}

export function StockTransactionList({ title, description, useList, newHref, typeLabel }: StockTransactionListProps) {
  const [status, setStatus] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => setPage(1), [status, dateRange.from, dateRange.to]);
  const { data, isLoading } = useList({
    status: status || undefined,
    from: dateRange.from || undefined,
    to: dateRange.to || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<StockTransaction>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Loại", accessorFn: (row) => typeLabel(row.type), id: "type" },
      { header: "Thời gian", accessorFn: (row) => formatDateTime(row.transactionAt), id: "transactionAt" },
      { header: "Kho", accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
      { header: "Nhà cung cấp", accessorFn: (row) => row.supplier?.name ?? "-", id: "supplier" },
      { header: "Khách hàng", accessorFn: (row) => row.customer?.name ?? "-", id: "customer" },
      {
        header: "Tổng tiền vốn",
        accessorFn: (row) => formatCurrency(row.items.reduce((sum, it) => sum + Number(it.costAmount), 0)),
        id: "total",
      },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => <Badge tone={statusTone[row.original.status]}>{labels.transactionStatus(row.original.status)}</Badge>,
      },
    ],
    [typeLabel],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <Link href={newHref}>
          <Button>
            <Plus size={16} />
            Tạo phiếu
          </Button>
        </Link>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Trạng thái</label>
            <div className="w-48">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Nháp</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="CANCELLED">Đã huỷ</option>
              </Select>
            </div>
          </div>
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
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
