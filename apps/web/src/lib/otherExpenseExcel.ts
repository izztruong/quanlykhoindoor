import { foldVietnamese, headerMatches } from "./excelParse";

// Phần đọc ngày/số dùng chung với Chi chốt ca nằm ở lib/excelParse.ts.
export { parseNumber, parseSpentAt } from "./excelParse";

/**
 * Bố cục file Excel của "Chi ngoài", tách khỏi component để phần đọc/ghi file kiểm chứng được mà
 * không cần dựng React.
 */
export const TEMPLATE_HEADER = [
  "Ngày*",
  "Quán chi*",
  "Nội dung chi*",
  "Đơn vị tính",
  "Số lượng*",
  "Đơn giá*",
  "Ghi chú",
];

/** Chỉ số cột (1-based), gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
export const COL = { spentAt: 1, shop: 2, content: 3, unit: 4, quantity: 5, unitPrice: 6, note: 7 } as const;

/** So khớp hàng tiêu đề với file mẫu (bỏ qua dấu *, khoảng trắng và hoa/thường). */
export function headerMatchesTemplate(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, TEMPLATE_HEADER);
}

export type ShopMatch = { id: string } | "empty" | "not-found" | "ambiguous";

/**
 * Khớp ô "Quán chi" với danh sách tài khoản quán, bỏ dấu và không phân biệt hoa thường ("Xuân La",
 * "xuan la" đều ra một quán).
 *
 * KHÔNG đoán bừa: ô trống, tên lạ và tên trùng là ba kết quả riêng để phần nhập báo đúng câu. Đặc
 * biệt ô trống cũng là lỗi chứ không tự điền người đang nhập file — kế toán nhập hộ nhiều quán mà
 * bỏ sót một dòng thì dòng đó phải được chỉ ra, không được âm thầm tính sang quán khác.
 */
export function matchShopByName(text: string, shops: { id: string; name: string }[]): ShopMatch {
  const wanted = foldVietnamese(text);
  if (!wanted) return "empty";

  const hits = shops.filter((shop) => foldVietnamese(shop.name) === wanted);
  if (hits.length === 0) return "not-found";
  if (hits.length > 1) return "ambiguous";
  return { id: hits[0]!.id };
}
