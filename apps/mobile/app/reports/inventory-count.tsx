import { ReportScreenShell } from "@/components/reports/ReportScreenShell";
import { InventoryCountCard } from "@/components/reports/reportCards";
import type { InventoryCountRow } from "@/types";

export default function InventoryReportScreen() {
  return <ReportScreenShell<InventoryCountRow> title="Kiểm kê" endpoint="/reports/inventory-count"
    requireWarehouse paginated={false} keyExtractor={(row) => row.product.id}
    renderRow={(row) => <InventoryCountCard row={row} />} />;
}
