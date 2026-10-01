import { headerMatches } from "./excelParse";

// Phần đọc ngày/số dùng chung với các sổ khác nằm ở lib/excelParse.ts. Re-export lại ở đây để
// ShiftExpenseExcelActions không phải biết tới hai file.
export { parseNumber, parseSpentAt } from "./excelParse";

/**
 * Bố cục file Excel của "Chi chốt ca", tách khỏi component để phần đọc/ghi file kiểm chứng được
 * mà không cần dựng React.
 */
export const TEMPLATE_HEADER = ["Ngày*", "Loại chi*", "Nội dung chi*", "Đơn vị tính", "Số lượng*", "Đơn giá*", "Ghi chú"];

/** Chỉ số cột (1-based), gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
export const COL = { spentAt: 1, type: 2, content: 3, unit: 4, quantity: 5, unitPrice: 6, note: 7 } as const;

/** Bỏ dấu tiếng Việt và hạ về chữ thường để so chuỗi người dùng gõ tay trong Excel. */
function foldVietnamese(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

const MATERIAL_WORDS = ["nvl", "nguyen vat lieu", "nguyen lieu", "material"];
const OTHER_WORDS = ["khac", "chi khac", "other"];

/**
 * Ô "Loại chi" gõ tay nên nhận cả "NVL", "Nguyên vật liệu", "Khác", "khac"… Không đoán bừa: chuỗi
 * lạ trả về null để phần nhập báo đúng dòng sai thay vì âm thầm xếp hết vào NVL.
 */
export function parseExpenseType(text: string): "MATERIAL" | "OTHER" | null {
  const folded = foldVietnamese(text);
  if (!folded) return null;
  if (MATERIAL_WORDS.includes(folded)) return "MATERIAL";
  if (OTHER_WORDS.includes(folded)) return "OTHER";
  return null;
}

/** So khớp hàng tiêu đề với file mẫu (bỏ qua dấu *, khoảng trắng và hoa/thường). */
export function headerMatchesTemplate(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, TEMPLATE_HEADER);
}
