"use client";

import { summaryColumns, summaryExcelColumns } from "@/components/reports/columns";
import { ReportPageShell } from "@/components/reports/ReportPageShell";
import type { ReportSummaryRow } from "@/types";
import { useMemo } from "react";

export default function ExportSummaryPage() {
  const columns = useMemo(() => summaryColumns("Kho xuất"), []);
  const excelColumns = useMemo(() => summaryExcelColumns("Kho xuất"), []);
  return (
    <ReportPageShell<ReportSummaryRow>
      title="Tổng hợp xuất"
      description="Tổng hợp số lượng và giá trị hàng hoá đã xuất kho theo kỳ."
      endpoint="/reports/export-summary"
      columns={columns}
      dateRangeLabel="Thời gian xuất"
      excelColumns={excelColumns}
      fileBaseName="tong-hop-xuat"
    />
  );
}
