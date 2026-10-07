import { VN_OFFSET_MS } from "./deadlines";

/**
 * Quy đổi thời gian theo giờ Việt Nam cho dữ liệu lưu ở mức NGÀY (`@db.Date`) và ở mức GIỜ
 * (`PosSaleHour.hour`). Tách khỏi `modules/posSales/shiftSlicing.ts` vì ba hàm đầu file này
 * không phải luật chia ca — chúng là cách đọc cột `@db.Date` — và `costChecks` cần dùng chúng
 * mà không được phụ thuộc vào module posSales.
 *
 * Phép tính hạn (giờ–phút cấu hình) vẫn nằm ở `deadlines.ts`; đây chỉ dùng chung hằng UTC+7 của nó.
 */

/**
 * "YYYY-MM-DD" của một cột `@db.Date`.
 *
 * CHỈ DÙNG CHO CỘT `@db.Date`: cột đó luôn có phần giờ 00:00 UTC nên `getUTC*` đọc ra đúng ngày
 * lịch bất kể máy chạy ở múi nào (Render chạy UTC, máy dev UTC+7). Gọi hàm này lên một TIMESTAMP
 * thật (`checkedAt`, `wasteAt`, `createdAt`) là SAI: 07/10 00:30 giờ VN = 06/10 17:30 UTC, và
 * `getUTCDate()` sẽ trả ngày 6. Với timestamp thật thì dùng `vnDateKeyOf`.
 */
export function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Chuỗi "YYYY-MM-DD" → Date đúng ngày đó, để ghi/so với một cột `@db.Date`. Ép về giữa trưa UTC thay
 * vì 00:00: phần giờ bị cột bỏ đi, nhưng đi qua 00:00 UTC thì bất kỳ phép đổi múi giờ lẫn vào đâu đó
 * cũng có thể lùi sang ngày hôm trước. Giữa trưa thì lệch ±7 tiếng vẫn nằm trong cùng một ngày.
 */
export function parseDateOnly(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

/** Cộng/trừ `offsetDays` vào một khoá ngày "YYYY-MM-DD". Đi qua giữa trưa UTC để không chạm ranh ngày. */
export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return toDateKey(d);
}

/**
 * Phút-trong-ngày của GIỮA ô giờ `hour`.
 *
 * Dữ liệu doanh số gom theo giờ nên mọi mốc so sánh đều bị làm tròn về giờ. Quy ước dùng chung cho
 * cả chia ca lẫn cắt kỳ Check Cost: ô giờ `h` (chứa đơn từ h:00 đến h:59) thuộc khoảng nào thì xét
 * mốc **h:30**. Muốn chính xác tới phút thì phải lưu doanh số ở mức phút — dữ liệu phình lên nhiều lần.
 */
export function bucketMidpointMinutes(hour: number): number {
  return hour * 60 + 30;
}

/** Mốc UTC thật của 00:00 GIỜ VN của một cột `@db.Date`. */
export function vnDayStartMs(dateOnly: Date): number {
  return Date.UTC(dateOnly.getUTCFullYear(), dateOnly.getUTCMonth(), dateOnly.getUTCDate()) - VN_OFFSET_MS;
}

/**
 * Mốc UTC thật của GIỮA ô giờ POS `(soldOn, hour)` — tức h:30 giờ VN của ngày đó.
 * Dùng để so một ô doanh số với mốc kỳ Check Cost (`StockCheck.checkedAt`, có cả phút).
 */
export function vnHourCellMs(soldOn: Date, hour: number): number {
  return vnDayStartMs(soldOn) + bucketMidpointMinutes(hour) * 60_000;
}

/** "YYYY-MM-DD" theo giờ VN của một TIMESTAMP thật. Đối xứng với `toDateKey` nhưng cho mốc có giờ. */
export function vnDateKeyOf(instant: Date): string {
  return toDateKey(new Date(instant.getTime() + VN_OFFSET_MS));
}
