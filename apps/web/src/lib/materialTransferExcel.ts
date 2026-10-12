export { writeWorkbook, type SheetSpec } from "./excelExport";
import { headerMatches } from "./excelParse";

// Phần đọc số, ngày-giờ và khớp tên quán dùng chung nằm ở lib/excelParse.ts.
export {
  matchShopByName,
  parseDateTime,
  parseNumber,
  wallClockToIso,
  type ShopMatch,
  type WallClockMinute,
} from "./excelParse";

/**
 * Bố cục file Excel của Phiếu điều chuyển, tách khỏi component để phần đọc/ghi kiểm chứng được mà
 * không cần dựng React.
 *
 * **Hai sheet** như phiếu nhập kho: một phiếu có nhiều dòng hàng, mà gom theo (quán gửi, quán nhận,
 * thời gian) thì không tách được hai chuyến trùng giờ. Sheet "Phiếu" khai từng phiếu kèm *Mã phiếu
 * tạm*, sheet "Dòng hàng" trỏ về mã tạm đó. Mã tạm chỉ dùng để nối hai sheet, không lưu vào DB.
 *
 * Khác phiếu nhập kho ở hai điểm đáng nhớ:
 * - **Quán khớp theo TÊN**, không theo mã: tài khoản không có cột mã nào.
 * - **Không có cột SL lẻ.** Dữ liệu thật chưa phiếu nào dùng tới, mà đó là cột dễ nhập sai đơn vị
 *   nhất (lẻ tính theo đơn vị công thức và cân CẢ VỎ). API vẫn nhận `looseQuantity`, chỉ file không
 *   có — nên tiêu đề SL chẵn phải nói rõ "theo đơn vị chính".
 */
export const SHEET = { phieu: "Phiếu", dongHang: "Dòng hàng" } as const;

export const PHIEU_HEADER = ["Mã phiếu tạm*", "Quán gửi*", "Quán nhận*", "Thời gian chuyển*", "Ghi chú"];

export const DONG_HANG_HEADER = [
  "Mã phiếu tạm*",
  "Mã hàng hoá*",
  "SL chẵn (theo đơn vị chính)*",
  "Mã NCC",
  "Giá vốn",
  "Ghi chú",
];

/** Chỉ số cột (1-based), gom một chỗ để mẫu và phần nhập không bao giờ lệch nhau. */
export const PHIEU_COL = { tempCode: 1, fromShop: 2, toShop: 3, transferAt: 4, note: 5 } as const;
export const DONG_HANG_COL = { tempCode: 1, productCode: 2, wholeQuantity: 3, supplierCode: 4, costPrice: 5, note: 6 } as const;

export function headerMatchesPhieu(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, PHIEU_HEADER);
}

export function headerMatchesDongHang(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, DONG_HANG_HEADER);
}
