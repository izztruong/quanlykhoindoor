import { ReportScreenShell } from "@/components/reports/ReportScreenShell";
import { DetailCard } from "@/components/reports/reportCards";
import type { ReportDetailRow } from "@/types";

export default function ReportScreen() {
  return <ReportScreenShell<ReportDetailRow> title="Chi tiết xuất" endpoint="/reports/export-detail"
    filterMode="code" keyExtractor={(row) => row.id}
    renderRow={(row) => <DetailCard row={row} variant="export" />} />;
}
