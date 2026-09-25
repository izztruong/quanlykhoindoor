/** Mốc bán đã chuẩn hoá thành GIỜ TREO TƯỜNG: ngày theo lịch + giờ đồng hồ, không mang múi giờ nào. */
export interface WallClock {
  /** YYYY-MM-DD */
  soldOn: string;
  /** 0–23 */
  hour: number;
}

function wallClock(year: number, month: number, day: number, hour: number): WallClock | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23) return null;
  return { soldOn: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, hour };
}

/**
 * Đọc ô thời gian trong file doanh số POS thành giờ treo tường.
 *
 * **Vì sao không trả về `Date`:** ô ngày-giờ thật của Excel là một số serial KHÔNG mang múi giờ, và
 * ExcelJS quy nó về `Date` bằng cách nhét giờ treo tường vào các trường **UTC** — ô Excel hiện
 * `20/09/2026 00:30` trả về `2026-09-20T00:30:00.000Z`. Đọc bằng `getHours()` (giờ địa phương UTC+7)
 * sẽ ra 7 thay vì 0, và ô 23:45 nhảy sang ngày 21, tức cắt ca sai toàn bộ. Còn chuỗi do mình tự tách
 * thì lại theo giờ địa phương. Hai nguồn hai quy ước, nên chuẩn hoá ngay tại đây thay vì để lẫn hai
 * kiểu `Date` khác nghĩa trong cùng luồng nhập.
 *
 * Lỗi này KHÔNG lộ ra nếu tự ghi file bằng `new Date(...)` rồi tự đọc: bộ ghi của ExcelJS lệch một
 * chiều, bộ đọc lệch chiều ngược lại nên triệt tiêu nhau. Phải thử bằng số serial thô.
 *
 * Nhận: `Date` và số serial do ExcelJS trả về, ô công thức, chuỗi `dd/mm/yyyy hh:mm`,
 * `dd-mm-yyyy hh:mm`, `yyyy-mm-dd hh:mm`. Trả `null` khi thiếu giờ hoặc không đọc được — dòng đó bị
 * liệt kê ra chứ không đoán.
 */
export function parseSoldAt(raw: unknown): WallClock | null {
  // Ô công thức: ExcelJS trả { formula, result } — lấy kết quả rồi đọc lại.
  if (raw && typeof raw === "object" && !(raw instanceof Date) && "result" in raw) {
    return parseSoldAt((raw as { result: unknown }).result);
  }

  // Date do ExcelJS dựng từ serial: giờ treo tường nằm ở các trường UTC.
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return wallClock(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate(), raw.getUTCHours());
  }

  // Số serial thô: ngày 0 là 1899-12-30. Dựng qua Date.UTC nên cũng đọc bằng trường UTC.
  if (typeof raw === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(raw * 86_400_000));
    if (Number.isNaN(date.getTime())) return null;
    return wallClock(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours());
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;

    // dd/mm/yyyy hoặc dd-mm-yyyy, kèm giờ. Ngày đứng TRƯỚC — nếu file dùng mm/dd/yyyy thì số tháng sẽ
    // vượt 12 và bị từ chối, thay vì âm thầm đọc ngược ngày với tháng.
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (dmy) {
      const [, d, m, y, h] = dmy;
      if (h === undefined) return null; // chỉ có ngày, không biết giờ → không cắt ca được
      return wallClock(Number(y), Number(m), Number(d), Number(h));
    }

    // yyyy-mm-dd kèm giờ, phân tách bằng khoảng trắng hoặc T.
    const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (ymd) {
      const [, y, m, d, h] = ymd;
      if (h === undefined) return null;
      return wallClock(Number(y), Number(m), Number(d), Number(h));
    }
  }
  return null;
}
