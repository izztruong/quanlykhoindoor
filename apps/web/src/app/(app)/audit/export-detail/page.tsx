"use client";

import { detailColumns, detailExcelColumns } from "@/components/reports/columns";
import { ReportPageShell } from "@/components/reports/ReportPageShell";
import { labels } from "@/lib/format";
import type { ReportDetailRow } from "@/types";
import { useMemo } from "react";

export default function ExportDetailPage() {
  const columns = useMemo(() => detailColumns("Kho xuất", labels.stockExportType), []);
  const excelColumns = useMemo(() => detailExcelColumns("Kho xuất", labels.stockExportType), []);
  return (
    <ReportPageShell<ReportDetailRow>
      title="Chi tiết xuất"
      description="Danh sách chi tiết từng dòng hàng hoá đã xuất kho."
      endpoint="/reports/export-detail"
      columns={columns}
      dateRangeLabel="Thời gian xuất"
      filterMode="code"
      excelColumns={excelColumns}
      fileBaseName="chi-tiet-xuat"
    />
  );
}
