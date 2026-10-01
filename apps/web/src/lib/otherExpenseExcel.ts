import { headerMatches } from "./excelParse";

// Phần đọc ngày/số dùng chung với Chi chốt ca nằm ở lib/excelParse.ts.
export { parseNumber, parseSpentAt } from "./excelParse";

/**
 * Bố cục file Excel của "Chi ngoài", tách khỏi component để phần đọc/ghi file kiểm chứng được mà
 * không cần dựng React. Ít hơn Chi chốt ca đúng một cột: sổ này không có Loại chi.
 */
export const TEMPLATE_HEADER = ["Ngày*", "Nội dung chi*", "Đơn vị tính", "Số lượng*", "Đơn giá*", "Ghi chú"];

/** Chỉ số cột (1-based), gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
export const COL = { spentAt: 1, content: 2, unit: 3, quantity: 4, unitPrice: 5, note: 6 } as const;

/** So khớp hàng tiêu đề với file mẫu (bỏ qua dấu *, khoảng trắng và hoa/thường). */
export function headerMatchesTemplate(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, TEMPLATE_HEADER);
}
