"use client";

import { inventoryCountColumns, inventoryCountExcelColumns } from "@/components/reports/columns";
import { ReportPageShell } from "@/components/reports/ReportPageShell";
import type { InventoryCountRow } from "@/types";

export default function InventoryCountPage() {
  return (
    <ReportPageShell<InventoryCountRow>
      title="Kiểm kê"
      description="Đối chiếu tồn kho hệ thống với tồn kho thực tế theo kỳ."
      endpoint="/reports/inventory-count"
      columns={inventoryCountColumns}
      requireWarehouse
      paginated={false}
      dateRangeLabel="Thời gian kiểm kê"
      excelColumns={inventoryCountExcelColumns}
      fileBaseName="kiem-ke"
    />
  );
}
