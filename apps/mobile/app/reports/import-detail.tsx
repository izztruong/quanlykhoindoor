import { ReportScreenShell } from "@/components/reports/ReportScreenShell";
import { DetailCard } from "@/components/reports/reportCards";
import type { ReportDetailRow } from "@/types";

export default function ReportScreen() {
  return <ReportScreenShell<ReportDetailRow> title="Chi tiết nhập" endpoint="/reports/import-detail"
    filterMode="code" keyExtractor={(row) => row.id}
    renderRow={(row) => <DetailCard row={row} variant="import" />} />;
}
