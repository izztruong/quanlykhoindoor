"use client";

import { summaryColumns, summaryExcelColumns } from "@/components/reports/columns";
import { ReportPageShell } from "@/components/reports/ReportPageShell";
import type { ReportSummaryRow } from "@/types";
import { useMemo } from "react";

export default function ImportSummaryPage() {
  const columns = useMemo(() => summaryColumns("Kho nhập"), []);
  const excelColumns = useMemo(() => summaryExcelColumns("Kho nhập"), []);
  return (
    <ReportPageShell<ReportSummaryRow>
      title="Tổng hợp nhập"
      description="Tổng hợp số lượng và giá trị hàng hoá đã nhập kho theo kỳ."
      endpoint="/reports/import-summary"
      columns={columns}
      dateRangeLabel="Thời gian nhập"
      excelColumns={excelColumns}
      fileBaseName="tong-hop-nhap"
    />
  );
}
