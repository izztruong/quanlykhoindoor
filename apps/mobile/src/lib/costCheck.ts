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

/**
 * % chênh lệch thực = Thực tế dùng / Theo công thức − 1: dùng vượt (dương) hay hụt (âm) bao nhiêu
 * phần trăm so với định mức, khớp định mức là 0%. null khi hàng hoá không nằm trong công thức nào.
 */
export function varianceVsTheoreticalPct(row: { theoretical: number; actualUsed: number }): number | null {
  return row.theoretical !== 0 ? row.actualUsed / row.theoretical - 1 : null;
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
}

/**
 * KHÔNG gửi `soldItems`: SL món đã bán giờ do server lấy từ doanh số POS theo kỳ của phiếu. Gửi
 * trường đó lên là server trả 400 — cố ý, để bản app cũ hỏng to tiếng chứ không âm thầm tạo phiếu
 * mang số khác số người dùng vừa gõ.
 */
export function buildCostCheckInput(draft: CostCheckDraft): CostCheckCreateInput {
  if (!draft.userId) throw new Error("Vui lòng chọn quán.");
  if (!draft.openingStockCheckId || !draft.closingStockCheckId) {
    throw new Error("Vui lòng chọn phiếu kiểm kê đầu kỳ và cuối kỳ.");
  }
  if (draft.openingStockCheckId === draft.closingStockCheckId) {
    throw new Error("Phiếu đầu kỳ và cuối kỳ phải khác nhau.");
  }
  return {
    userId: draft.userId,
    openingStockCheckId: draft.openingStockCheckId,
    closingStockCheckId: draft.closingStockCheckId,
    note: draft.note.trim() || undefined,
    discountTra: draft.discountTra.trim() ? parseNonnegative(draft.discountTra, "Khuyến mãi Trà") : undefined,
    discountDav: draft.discountDav.trim() ? parseNonnegative(draft.discountDav, "Khuyến mãi ĐAV") : undefined,
  };
}

function parseNonnegative(value: string, label: string) {
  const number = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} phải là số không âm.`);
  return number;
}
