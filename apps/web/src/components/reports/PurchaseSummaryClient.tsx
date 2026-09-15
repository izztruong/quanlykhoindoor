"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useUserOptions } from "@/hooks/useUsers";
import { api } from "@/lib/api-client";
import { clampDateRange } from "@/lib/dateRange";
import { exportPurchaseSummaryToExcel } from "@/lib/exportPurchaseSummaryExcel";
import { formatCurrency, formatNumber, labels } from "@/lib/format";
import type { PurchaseSummaryRow } from "@/types";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, Filter } from "lucide-react";
import { useMemo, useState } from "react";

/** Chỉ những trạng thái mà việc đi đặt NCC còn có ý nghĩa — đơn đã huỷ không nằm trong danh sách. */
const STATUS_OPTIONS = ["DRAFT", "PENDING_CONFIRM", "CONFIRMED", "SHORT", "COMPLETED"];

interface FilterValues {
  from: string;
  to: string;
  /** Lọc theo quán đã đặt đơn; rỗng là gộp mọi quán. */
  createdById: string;
  statuses: string[];
}

function defaultFilter(): FilterValues {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    createdById: "",
    // Đơn chưa xác nhận chính là phần còn phải đi đặt, nên đó là mặc định.
    statuses: ["DRAFT"],
  };
}

/** "1 Thùng = 12 Hộp" cho hàng có khai đơn vị gọi, gạch ngang cho hàng gọi thẳng theo đơn vị chính. */
function packagingLabel(row: PurchaseSummaryRow) {
  if (!row.purchaseUnit || !row.baseUnitsPerPurchaseUnit) return "-";
  return `1 ${row.purchaseUnit.name} = ${formatNumber(row.baseUnitsPerPurchaseUnit)} ${row.unit?.name ?? ""}`.trim();
}

export function PurchaseSummaryClient() {
  const [filter, setFilter] = useState<FilterValues>(defaultFilter);
  const [appliedFilter, setAppliedFilter] = useState<FilterValues>(filter);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  // Trang đã chặn ở mức ADMIN nên không cần điều kiện enabled như trang danh sách đơn hàng.
  const { data: users = [] } = useUserOptions();

  const queryParams = {
    from: appliedFilter.from,
    to: appliedFilter.to,
    createdById: appliedFilter.createdById,
    status: appliedFilter.statuses.join(","),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reports", "purchase-summary", appliedFilter, page, pageSize],
    queryFn: () =>
      api.get<{ items: PurchaseSummaryRow[]; total: number }>("/reports/purchase-summary", { ...queryParams, page, pageSize }),
    enabled: appliedFilter.statuses.length > 0,
  });

  const columns = useMemo<ColumnDef<PurchaseSummaryRow>[]>(
    () => [
      { header: "STT", accessorKey: "stt" },
      {
        header: "Nhà cung cấp",
        id: "supplier",
        cell: ({ row }) => (row.original.supplier ? row.original.supplier.name : <Badge tone="red">Chưa có NCC</Badge>),
      },
      { header: "Mã", accessorFn: (row) => row.product.code, id: "productCode" },
      { header: "Tên hàng hoá", accessorFn: (row) => row.product.name, id: "productName" },
      {
        header: "SL quán gọi",
        id: "orderedBaseQty",
        cell: ({ row }) => `${formatNumber(row.original.orderedBaseQty)} ${row.original.unit?.name ?? ""}`.trim(),
      },
      { header: "Quy cách", accessorFn: packagingLabel, id: "packaging" },
      {
        header: "SL tối thiểu",
        id: "minQuantity",
        accessorFn: (row) => (row.minQuantity == null ? "-" : formatNumber(row.minQuantity)),
      },
      {
        header: "SL đặt NCC",
        id: "purchaseQty",
        cell: ({ row }) => {
          const item = row.original;
          const unitName = item.purchaseUnit?.name ?? item.unit?.name ?? "";
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-800">{`${formatNumber(item.purchaseQty)} ${unitName}`.trim()}</span>
              {item.roundedUpToPack && <Badge tone="blue">làm tròn</Badge>}
              {item.raisedToMinimum && <Badge tone="yellow">nâng tối thiểu</Badge>}
            </div>
          );
        },
      },
      {
        header: "Quy ra ĐV chính",
        id: "finalBaseQty",
        cell: ({ row }) => `${formatNumber(row.original.finalBaseQty)} ${row.original.unit?.name ?? ""}`.trim(),
      },
      { header: "Đơn giá nhập", accessorFn: (row) => formatCurrency(row.importPrice), id: "importPrice" },
      { header: "Thành tiền", accessorFn: (row) => formatCurrency(row.amount), id: "amount" },
    ],
    [],
  );

  function toggleStatus(status: string) {
    setFilter((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status) ? prev.statuses.filter((s) => s !== status) : [...prev.statuses, status],
    }));
  }

  function handleSubmit() {
    if (filter.statuses.length === 0) return;
    setPage(1);
    setAppliedFilter(filter);
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      // Bảng chỉ giữ trang đang xem, nên phải lấy lại toàn bộ kết quả khớp bộ lọc trước khi xuất
      // (giống ReportPageShell) — file gửi NCC phải đủ hàng, không phải mỗi trang hiện tại.
      const all = await api.get<{ items: PurchaseSummaryRow[]; total: number }>("/reports/purchase-summary", {
        ...queryParams,
        page: 1,
        pageSize: Math.max(data?.total ?? 0, 1),
      });
      await exportPurchaseSummaryToExcel(all.items, "tong-hop-dat-ncc.xlsx");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Tổng hợp đặt NCC</h1>
          <p className="text-sm text-slate-500">
            Gộp số lượng cùng một hàng hoá qua mọi đơn hàng trong kỳ, chọn NCC ưu tiên nhất rồi quy đổi sang đơn vị gọi của NCC
            đó. Số lượng được làm tròn lên số nguyên đơn vị gọi, sau đó nâng tiếp cho bằng mức tối thiểu nếu chưa đạt.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={handleExportExcel} disabled={exporting || !data?.total}>
          <FileSpreadsheet size={16} />
          {exporting ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Ngày đơn hàng (tối đa 3 tháng)</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filter.from}
                  onChange={(e) => setFilter((prev) => ({ ...prev, ...clampDateRange(e.target.value, prev.to, "from") }))}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={filter.to}
                  onChange={(e) => setFilter((prev) => ({ ...prev, ...clampDateRange(prev.from, e.target.value, "to") }))}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Quán</label>
              <Select
                value={filter.createdById}
                onChange={(e) => setFilter((prev) => ({ ...prev, createdById: e.target.value }))}
                className="w-48"
              >
                <option value="">Tất cả quán</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Trạng thái đơn hàng</label>
              <div className="flex flex-wrap items-center gap-3 py-2">
                {STATUS_OPTIONS.map((status) => (
                  <label key={status} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={filter.statuses.includes(status)}
                      onChange={() => toggleStatus(status)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {labels.salesOrderStatus(status)}
                  </label>
                ))}
              </div>
            </div>

            <Button type="button" onClick={handleSubmit} disabled={filter.statuses.length === 0}>
              <Filter size={16} />
              Lọc
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {appliedFilter.statuses.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">Vui lòng chọn ít nhất một trạng thái đơn hàng và bấm Lọc.</p>
          ) : (
            <>
              <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading || isFetching} />
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
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
