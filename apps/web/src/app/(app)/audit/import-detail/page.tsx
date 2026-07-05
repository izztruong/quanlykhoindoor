"use client";

import { detailColumns, detailExcelColumns } from "@/components/reports/columns";
import { ReportPageShell } from "@/components/reports/ReportPageShell";
import { labels } from "@/lib/format";
import type { ReportDetailRow } from "@/types";
import { useMemo } from "react";

export default function ImportDetailPage() {
  const columns = useMemo(() => detailColumns("Kho nhập", labels.stockImportType), []);
  const excelColumns = useMemo(() => detailExcelColumns("Kho nhập", labels.stockImportType), []);
  return (
    <ReportPageShell<ReportDetailRow>
      title="Chi tiết nhập"
      description="Danh sách chi tiết từng dòng hàng hoá đã nhập kho."
      endpoint="/reports/import-detail"
      columns={columns}
      dateRangeLabel="Thời gian nhập"
      filterMode="code"
      excelColumns={excelColumns}
      fileBaseName="chi-tiet-nhap"
    />
  );
}
