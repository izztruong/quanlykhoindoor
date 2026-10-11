import type ExcelJS from "exceljs";

/**
 * Phần đọc file Excel dùng chung cho mọi màn nhập liệu (Chi chốt ca, Chi ngoài…). Để ở đây thay vì
 * chép sang từng module: cách quán gõ ngày tháng và số tiền trong file là như nhau ở mọi sổ, sửa
 * một chỗ thì mọi màn nhập cùng hiểu đúng.
 *
 * Toàn bộ là pure function — kiểm chứng được bằng script `tsx` mà không cần dựng React.
 */

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
 * Mốc thời gian đọc từ ô Excel, dạng "giờ treo tường" đã tách sẵn — CỐ Ý không trả `Date`.
 *
 * Ô Excel không mang múi giờ, còn `Date` thì có. Trả `Date` ở đây là buộc người gọi phải đoán xem
 * mốc đó thuộc múi nào, và cái đoán đó khác nhau giữa máy dev (UTC+7) với Render (UTC). Để người
 * gọi tự đổi bằng `wallClockToIso` ở đúng nơi biết giờ người dùng (trình duyệt).
 */
export interface WallClockMinute {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /**
   * Phần giây, gần như luôn là 0. Người dùng gõ tới phút, nhưng phiếu chuyển từ dữ liệu cũ mang
   * `receivedAt` có giây thật — giữ lại để file xuất ra nhập lại vẫn khớp ĐÚNG mốc, nếu không thì
   * phép kiểm phiếu trùng bỏ sót và sinh ra một phiếu lệch vài giây.
   */
  second: number;
}

function validWallClock(w: WallClockMinute): WallClockMinute | null {
  if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31) return null;
  if (w.hour < 0 || w.hour > 23 || w.minute < 0 || w.minute > 59) return null;
  if (w.second < 0 || w.second > 59) return null;
  if (w.year < 2000 || w.year > 2100) return null;
  return w;
}

/**
 * Đọc ô "ngày + giờ" của file Excel. Khác `parseSpentAt` (chỉ ngày) và `parseSoldAt` của
 * `posSaleDate.ts` (ngày + giờ nhưng **làm tròn mất phút**, vì doanh số POS lưu ở mức giờ).
 *
 * Dùng cho mốc cần đủ phút — `StockImport.transactionAt` là mốc kỳ Check Cost, để 00:00 là hàng nhập
 * cùng ngày với phiếu kiểm đầu kỳ rơi ra ngoài kỳ.
 *
 * **Thiếu phần giờ thì trả null, không mặc định 00:00.** Người dùng gõ thiếu giờ phải thấy lỗi ở
 * đúng dòng đó, chứ không phải nhận một phiếu lệch kỳ mà không có dấu hiệu gì.
 */
export function parseDateTime(value: ExcelJS.CellValue, text: string): WallClockMinute | null {
  // Ô công thức: ExcelJS trả { formula, result } — lấy kết quả rồi đọc lại.
  if (value && typeof value === "object" && !(value instanceof Date) && "result" in value) {
    const inner = (value as { result: unknown }).result;
    return parseDateTime(inner as ExcelJS.CellValue, inner == null ? "" : String(inner));
  }

  // Date do ExcelJS dựng từ serial: giờ treo tường nằm ở các trường UTC, đọc theo giờ máy là lùi ngày.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return validWallClock({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds(),
    });
  }

  // Số serial thô: ngày 0 là 1899-12-30. Làm tròn về PHÚT (không phải ms) — 08:30 trong Excel là
  // 0.3541666666666667, nhân ra ms rồi đọc phút có thể ra 08:29 ở những giá trị lẻ.
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 1440) * 60_000);
    if (Number.isNaN(date.getTime())) return null;
    return validWallClock({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: 0, // đã làm tròn về phút ở trên
    });
  }

  const trimmed = text.trim();
  if (!trimmed) return null;

  // dd/mm/yyyy hoặc dd-mm-yyyy kèm giờ. Ngày đứng TRƯỚC: file dùng mm/dd/yyyy thì số tháng vượt 12
  // và bị từ chối, thay vì âm thầm đọc ngược ngày với tháng.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(trimmed);
  if (dmy) {
    if (dmy[4] === undefined) return null;
    return validWallClock({
      year: Number(dmy[3]),
      month: Number(dmy[2]),
      day: Number(dmy[1]),
      hour: Number(dmy[4]),
      minute: Number(dmy[5]),
      second: dmy[6] === undefined ? 0 : Number(dmy[6]),
    });
  }

  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(trimmed);
  if (ymd) {
    if (ymd[4] === undefined) return null;
    return validWallClock({
      year: Number(ymd[1]),
      month: Number(ymd[2]),
      day: Number(ymd[3]),
      hour: Number(ymd[4]),
      minute: Number(ymd[5]),
      second: ymd[6] === undefined ? 0 : Number(ymd[6]),
    });
  }

  return null;
}

/**
 * Giờ treo tường -> chuỗi ISO để gửi server. Gọi ở TRÌNH DUYỆT, nơi biết đúng giờ người dùng:
 * `z.coerce.date()` bên server đọc chuỗi không múi giờ theo giờ máy chủ, mà Render chạy UTC nên sẽ
 * lệch 7 tiếng. Cùng lý do với `StockImportForm` đổi `datetime-local` sang ISO trước khi gửi.
 */
export function wallClockToIso(w: WallClockMinute): string {
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, 0).toISOString();
}

/** "dd/mm/yyyy HH:mm", kèm ":ss" khi có giây, để in lại giá trị đã đọc cho người dùng đối chiếu. */
export function formatWallClock(w: WallClockMinute): string {
  const base = `${pad2(w.day)}/${pad2(w.month)}/${w.year} ${pad2(w.hour)}:${pad2(w.minute)}`;
  return w.second === 0 ? base : `${base}:${pad2(w.second)}`;
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

/** Bỏ dấu tiếng Việt và hạ về chữ thường để so chuỗi người dùng gõ tay trong Excel. */
export function foldVietnamese(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/** So khớp hàng tiêu đề với file mẫu (bỏ qua dấu *, khoảng trắng và hoa/thường). */
export function headerMatches(actual: (string | null | undefined)[], template: string[]): boolean {
  const normalise = (value: unknown) => String(value ?? "").replace("*", "").trim().toLowerCase();
  const expected = template.map(normalise);
  return expected.map((_, i) => normalise(actual[i])).join("|") === expected.join("|");
}
