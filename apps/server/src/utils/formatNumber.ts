/**
 * Định dạng số theo kiểu Việt Nam (dấu chấm phân cách nghìn, dấu phẩy thập phân) — bản server của
 * `formatNumber` trong apps/web/src/lib/format.ts.
 *
 * Chỉ dùng cho chuỗi giải thích trả về người dùng (vd `reasons[]` của gợi ý đặt hàng). Số liệu để
 * tính toán luôn đi ở dạng number/Decimal trong payload, không bao giờ ở dạng đã định dạng — client
 * tự định dạng lại theo chỗ nó hiển thị.
 */
export function formatNumber(value: number | string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  // Giữ tối đa 3 chữ số thập phân cho khớp Decimal(18,3) của các cột số lượng, nhưng không thêm số 0
  // vô nghĩa vào số nguyên.
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(parsed);
}
