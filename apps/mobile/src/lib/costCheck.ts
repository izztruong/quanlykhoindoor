import type { CostCheckCreateInput } from "@/hooks/useCostChecks";
import type { CostCheckFinancialSummary, CostCheckReportRow, ProductType } from "@/types";

export function buildCostRatioRows(s: CostCheckFinancialSummary) {
  return [
    { label: "Chi phí NVL Trà dự kiến (theo công thức)", value: s.expectedNvlTra, pct: s.expectedNvlTraPct },
    { label: "Chi phí ĐAV dự kiến (theo công thức)", value: s.expectedDav, pct: s.expectedDavPct },
    { label: "Chi phí NVL Trà thực tế", value: s.actualNvlTra, pct: s.actualNvlTraPct },
    { label: "Chi phí ĐAV thực tế", value: s.actualDav, pct: s.actualDavPct },
    { label: "Cốc & ống hút thực tế", value: s.cupsStraws, pct: s.cupsStrawsPct },
    { label: "Cost thực tế / doanh thu Trà (gồm cốc)", value: s.actualCostTraValue, pct: s.actualCostTraPct },
    { label: "Cost thực tế / doanh thu Tổng (gồm cốc, bánh)", value: s.actualCostTotalValue, pct: s.actualCostTotalPct },
    { label: "NVL huỷ / doanh thu thuần Trà", value: s.wasteNvlValue, pct: s.wasteNvlPct },
  ];
}

/** Giữ thứ tự loại → nhóm → tên server đã trả, không tính lại snapshot. */
export function groupCostReport(rows: CostCheckReportRow[]) {
  const byType = new Map<ProductType, Map<string, CostCheckReportRow[]>>();
  for (const row of rows) {
    const groups = byType.get(row.productType) ?? new Map<string, CostCheckReportRow[]>();
    const list = groups.get(row.productGroupName) ?? [];
    list.push(row);
    groups.set(row.productGroupName, list);
    byType.set(row.productType, groups);
  }
  return [...byType].map(([type, groups]) => ({ type, groups: [...groups] }));
}

export function actualOverTheoreticalPct(row: { theoretical: number; actualUsed: number }): number | null {
  return row.theoretical !== 0 ? row.actualUsed / row.theoretical : null;
}

export function varianceTone(variance: number) {
  return variance > 1e-6 ? "red" : variance < -1e-6 ? "green" : "gray";
}

export interface CostCheckDraft {
  userId: string;
  openingStockCheckId: string;
  closingStockCheckId: string;
  note: string;
  discountTra: string;
  discountDav: string;
  rows: { finishedGoodItemId: string; quantitySold: string }[];
}

export function buildCostCheckInput(draft: CostCheckDraft): CostCheckCreateInput {
  if (!draft.userId) throw new Error("Vui lòng chọn quán.");
  if (!draft.openingStockCheckId || !draft.closingStockCheckId) {
    throw new Error("Vui lòng chọn phiếu kiểm kê đầu kỳ và cuối kỳ.");
  }
  if (draft.openingStockCheckId === draft.closingStockCheckId) {
    throw new Error("Phiếu đầu kỳ và cuối kỳ phải khác nhau.");
  }
  const soldItems = draft.rows.filter((r) => r.quantitySold.trim() !== "").map((r) => ({
    finishedGoodItemId: r.finishedGoodItemId,
    quantitySold: parseNonnegative(r.quantitySold, "SL đã bán"),
  }));
  if (!soldItems.length) throw new Error("Vui lòng nhập ít nhất 1 dòng SL đã bán.");
  return {
    userId: draft.userId,
    openingStockCheckId: draft.openingStockCheckId,
    closingStockCheckId: draft.closingStockCheckId,
    note: draft.note.trim() || undefined,
    discountTra: draft.discountTra.trim() ? parseNonnegative(draft.discountTra, "Khuyến mãi Trà") : undefined,
    discountDav: draft.discountDav.trim() ? parseNonnegative(draft.discountDav, "Khuyến mãi ĐAV") : undefined,
    soldItems,
  };
}

function parseNonnegative(value: string, label: string) {
  const number = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} phải là số không âm.`);
  return number;
}
