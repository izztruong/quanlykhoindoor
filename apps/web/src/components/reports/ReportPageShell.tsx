"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { ReportFilterBar, ReportFilterValues } from "@/components/filters/ReportFilterBar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useProductGroups, useProducts, useWarehouses } from "@/hooks/useCatalog";
import { api } from "@/lib/api-client";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

function defaultFilter(): ReportFilterValues {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    warehouseId: "",
    productId: "",
    productGroupId: "",
    code: "",
  };
}

interface ReportPageShellProps<T extends object> {
  title: string;
  description: string;
  endpoint: string;
  columns: ColumnDef<T>[];
  requireWarehouse?: boolean;
  paginated?: boolean;
  dateRangeLabel?: string;
  filterMode?: "group" | "code";
  /** Plain-value column specs for the Excel export; omit to hide the "Xuất Excel" button. */
  excelColumns?: ExcelColumn<T>[];
  /** Used to name the downloaded file, e.g. "chi-tiet-xuat". */
  fileBaseName?: string;
}

export function ReportPageShell<T extends object>({
  title,
  description,
  endpoint,
  columns,
  requireWarehouse = false,
  paginated = true,
  dateRangeLabel,
  filterMode = "group",
  excelColumns,
  fileBaseName,
}: ReportPageShellProps<T>) {
  const [filter, setFilter] = useState<ReportFilterValues>(defaultFilter);
  const [appliedFilter, setAppliedFilter] = useState<ReportFilterValues>(filter);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const { data: warehouses = [] } = useWarehouses();
  const { data: productGroups = [] } = useProductGroups();
  const { data: products = [] } = useProducts();

  const canQuery = !requireWarehouse || Boolean(appliedFilter.warehouseId);

  const queryParams = {
    from: appliedFilter.from,
    to: appliedFilter.to,
    warehouseId: appliedFilter.warehouseId,
    productId: appliedFilter.productId,
    productGroupId: filterMode === "group" ? appliedFilter.productGroupId : undefined,
    code: filterMode === "code" ? appliedFilter.code : undefined,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reports", endpoint, appliedFilter, page, pageSize],
    queryFn: () => api.get<{ items: T[]; total: number }>(endpoint, { ...queryParams, page, pageSize }),
    enabled: canQuery,
  });

  function handleSubmit() {
    setPage(1);
    setAppliedFilter(filter);
  }

  async function handleExportExcel() {
    if (!excelColumns || !fileBaseName) return;
    setExporting(true);
    try {
      // Reports without pagination already return every matching row; paginated
      // ones only hold the current page, so re-fetch with a large page size to
      // get everything the current filter matches before exporting.
      const rows = paginated
        ? (await api.get<{ items: T[]; total: number }>(endpoint, { ...queryParams, page: 1, pageSize: Math.max(data?.total ?? 0, 1) })).items
        : (data?.items ?? []);
      await exportRowsToExcel(title, excelColumns, rows, `${fileBaseName}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {excelColumns && fileBaseName && (
          <Button type="button" variant="secondary" onClick={handleExportExcel} disabled={!canQuery || exporting}>
            <FileSpreadsheet size={16} />
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
        )}
      </div>

      <Card>
        <CardBody>
          <ReportFilterBar
            value={filter}
            onChange={setFilter}
            onSubmit={handleSubmit}
            warehouses={warehouses}
            productGroups={productGroups}
            products={products}
            requireWarehouse={requireWarehouse}
            dateRangeLabel={dateRangeLabel}
            filterMode={filterMode}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {!canQuery ? (
            <p className="p-5 text-sm text-slate-400">Vui lòng chọn kho hàng và bấm Lọc để xem dữ liệu.</p>
          ) : (
            <>
              <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading || isFetching} />
              {paginated && (
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
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
