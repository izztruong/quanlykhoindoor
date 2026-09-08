import type ExcelJS from "exceljs";

/**
 * Bố cục file Excel của "Chi chốt ca", tách khỏi component để phần đọc/ghi file kiểm chứng được
 * mà không cần dựng React.
 */
export const TEMPLATE_HEADER = ["Ngày*", "Nội dung chi*", "Đơn vị tính", "Số lượng*", "Đơn giá*", "Ghi chú"];

/** Chỉ số cột (1-based), gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
export const COL = { spentAt: 1, content: 2, unit: 3, quantity: 4, unitPrice: 5, note: 6 } as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Ô ngày trong file có thể là Date thật hoặc chuỗi ("1/9", "06/09/2026" — file quán đang dùng có
 * cả hai). Với Date phải đọc theo UTC: ExcelJS trả ngày Excel về mốc UTC, lấy theo giờ máy sẽ lùi
 * mất một ngày. Trả về "YYYY-MM-DD", hoặc null nếu không đọc được.
 */
export function parseSpentAt(value: ExcelJS.CellValue, text: string, today = new Date()): string | null {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  const trimmed = text.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${iso[1]}-${pad2(month)}-${pad2(day)}`;
  }

  // d/M hoặc d/M/yyyy (thiếu năm thì hiểu là năm nay, đúng như cách quán ghi "1/9").
  const parts = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(trimmed);
  if (!parts) return null;

  const day = Number(parts[1]);
  const month = Number(parts[2]);
  let year = parts[3] ? Number(parts[3]) : today.getFullYear();
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Số trong file có thể là number thật hoặc chuỗi kiểu Việt Nam ("8.000", "0,5") — dấu chấm là
 * phân cách nghìn, dấu phẩy là phần thập phân.
 */
export function parseNumber(value: ExcelJS.CellValue, text: string): number | null {
  if (typeof value === "number") return value;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalised = trimmed.replace(/[\s.]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/** So khớp hàng tiêu đề với file mẫu (bỏ qua dấu *, khoảng trắng và hoa/thường). */
export function headerMatchesTemplate(actual: (string | null | undefined)[]): boolean {
  const normalise = (value: unknown) => String(value ?? "").replace("*", "").trim().toLowerCase();
  const expected = TEMPLATE_HEADER.map(normalise);
  return expected.map((_, i) => normalise(actual[i])).join("|") === expected.join("|");
}
