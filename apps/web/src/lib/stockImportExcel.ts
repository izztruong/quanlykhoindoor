export { writeWorkbook, type SheetSpec } from "./excelExport";
import { foldVietnamese, headerMatches } from "./excelParse";

// Phần đọc số và ngày-giờ dùng chung nằm ở lib/excelParse.ts — component chỉ cần import module này.
export { formatWallClock, parseDateTime, parseNumber, wallClockToIso, type WallClockMinute } from "./excelParse";

/**
 * Bố cục file Excel của Phiếu nhập kho, tách khỏi component để phần đọc/ghi kiểm chứng được mà không
 * cần dựng React.
 *
 * **Hai sheet** chứ không một: một phiếu có nhiều dòng hàng, mà gom theo (kho, NCC, thời gian) thì
 * không tách được hai chuyến giao cùng NCC trùng giờ. Sheet "Phiếu" khai từng phiếu kèm *Mã phiếu
 * tạm*, sheet "Dòng hàng" trỏ về mã tạm đó. Mã tạm chỉ dùng để nối hai sheet, không lưu vào DB.
 */
export const SHEET = { phieu: "Phiếu", dongHang: "Dòng hàng" } as const;

export const PHIEU_HEADER = [
  "Mã phiếu tạm*",
  "Mã kho*",
  "Mã NCC*",
  "Thời gian nhập*",
  "Loại phiếu",
  "Hình thức",
  "Ghi chú",
];

export const DONG_HANG_HEADER = ["Mã phiếu tạm*", "Mã hàng hoá*", "Số lượng*", "Giá vốn", "Ghi chú"];

/** Chỉ số cột (1-based), gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
export const PHIEU_COL = { tempCode: 1, warehouseCode: 2, supplierCode: 3, transactionAt: 4, type: 5, form: 6, note: 7 } as const;
export const DONG_HANG_COL = { tempCode: 1, productCode: 2, quantity: 3, costPrice: 4, note: 5 } as const;

export function headerMatchesPhieu(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, PHIEU_HEADER);
}

export function headerMatchesDongHang(actual: (string | null | undefined)[]): boolean {
  return headerMatches(actual, DONG_HANG_HEADER);
}

/**
 * Nhãn tiếng Việt <-> giá trị enum. Ghi nhãn ra file thay vì mã enum để người dùng đọc được, và
 * khớp lại bằng `foldVietnamese` nên "nhap mua" hay "Nhập Mua" đều nhận.
 */
export const TYPE_LABEL: Record<string, string> = { PURCHASE: "Nhập mua", OTHER: "Khác" };
export const FORM_LABEL: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  DEBT: "Ghi nợ",
  OTHER: "Khác",
};

function byLabel(labels: Record<string, string>) {
  return new Map(Object.entries(labels).map(([value, label]) => [foldVietnamese(label), value]));
}
const TYPE_BY_LABEL = byLabel(TYPE_LABEL);
const FORM_BY_LABEL = byLabel(FORM_LABEL);

/** Ô trống trả về giá trị mặc định; chuỗi lạ trả null để phần nhập báo đúng dòng. */
export function parseImportType(text: string): string | null {
  const wanted = foldVietnamese(text);
  if (!wanted) return "PURCHASE";
  return TYPE_BY_LABEL.get(wanted) ?? null;
}

export function parseTransactionForm(text: string): string | null {
  const wanted = foldVietnamese(text);
  if (!wanted) return "CASH";
  return FORM_BY_LABEL.get(wanted) ?? null;
}

/**
 * Thời gian nhập ghi ra file ở ĐÚNG dạng `parseDateTime` đọc lại được — nếu không thì chính file vừa
 * xuất cũng không nhập ngược lại được.
 *
 * KHÔNG dùng `formatDateTime` của `lib/format.ts`: nó là `toLocaleString("vi-VN")` nên ra
 * "08:30 15/8/26" (giờ đứng trước, năm 2 chữ số) — parser không đọc được dạng đó.
 *
 * Kèm `:ss` chỉ khi phiếu có giây thật (phiếu chuyển từ dữ liệu cũ mang `receivedAt` có giây); để
 * tròn phút thì bỏ đi cho file dễ đọc.
 */
export function formatTransactionAtForExcel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getSeconds() === 0 ? base : `${base}:${p(d.getSeconds())}`;
}

/**
 * Trần ảnh chứng từ cho ĐƯỜNG EXCEL — cố ý **thấp hơn** `MAX_IMAGES_PER_IMPORT = 5` của server
 * (`stockImports.schemas.ts`). Đính thủ công ở trang chi tiết vẫn 5 ảnh; ở đây 2 là đủ (hoá đơn +
 * phiếu giao) và giữ quy ước đặt tên chỉ còn đúng hai dạng. Đừng "thống nhất" hai con số này làm một.
 */
export const MAX_EXCEL_IMAGES_PER_SLIP = 2;

/**
 * Ghép một file ảnh với Mã phiếu tạm theo TÊN FILE: `P1.jpg` là ảnh thứ nhất của phiếu `P1`,
 * `P1-2.jpg` là ảnh thứ hai.
 *
 * Khớp theo mã tạm **DÀI NHẤT** mà tên file bắt đầu bằng, rồi phần dư phải rỗng hoặc đúng `-<số>`.
 * Chọn dài nhất vì mã tạm có thể chứa dấu `-`: file `P1-A.jpg` của phiếu `P1-A` mà khớp tham lam từ
 * trái sẽ thành "phiếu P1, ảnh thứ A". Không khớp được thì trả `null` để phần nhập **báo lỗi theo tên
 * file**, không đoán bừa.
 *
 * Trả về cả `index` (1 hoặc 2…) để phần nhập phát hiện hai file cùng trỏ một vị trí.
 */
export function matchImageToTempCode(
  fileName: string,
  tempCodes: string[],
): { tempCode: string; index: number } | null {
  // Bỏ đuôi file; không quan tâm đuôi là gì vì `compressImage` nhận mọi ảnh trình duyệt giải mã được.
  const base = fileName.replace(/\.[^.]*$/, "").trim();
  if (!base) return null;

  const candidates = [...tempCodes].sort((a, b) => b.length - a.length);
  for (const tempCode of candidates) {
    if (!base.startsWith(tempCode)) continue;
    const rest = base.slice(tempCode.length);
    if (rest === "") return { tempCode, index: 1 };
    const matched = /^-(\d+)$/.exec(rest);
    if (matched) return { tempCode, index: Number(matched[1]) };
  }
  return null;
}
