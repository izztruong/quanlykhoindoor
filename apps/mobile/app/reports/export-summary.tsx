import { ReportScreenShell } from "@/components/reports/ReportScreenShell";
import { SummaryCard } from "@/components/reports/reportCards";
import type { ReportSummaryRow } from "@/types";

export default function ReportScreen() {
  return <ReportScreenShell<ReportSummaryRow> title="Tổng hợp xuất" endpoint="/reports/export-summary"
    filterMode="group" keyExtractor={(row) => `${row.warehouse.id}:${row.product.id}`}
    renderRow={(row) => <SummaryCard row={row} />} />;
}
