import type { ShiftCode, ShiftDefinition } from "../../generated/prisma/client";

/**
 * Cắt doanh số theo ca từ dữ liệu lưu ở mức GIỜ.
 *
 * Dữ liệu `PosSaleHour` cố ý không mang cột ca — ca chỉ là cấu hình, nên đổi mốc chia ca là tính lại
 * chứ không phải nhập lại. Toàn bộ chuyện "giờ nào thuộc ca nào" gom vào đúng file này.
 *
 * **Giới hạn phải biết:** dữ liệu gom theo giờ nên mốc chia ca thực tế bị làm tròn về giờ. Quy tắc
 * dùng ở đây: ô giờ `h` thuộc ca nào chứa **giữa ô** (h:30). Ca bắt đầu 06:30 thì ô 6 giờ (chứa đơn
 * từ 06:00 đến 06:59) KHÔNG thuộc ca đó, vì 06:30 chính là mốc mở. Muốn chính xác tới phút thì phải
 * lưu doanh số ở mức phút hoặc mức từng đơn — đổi lại dữ liệu phình lên nhiều lần.
 */

/** Phút trong ngày của giữa ô giờ `hour`. */
function bucketMidpointMinutes(hour: number): number {
  return hour * 60 + 30;
}

function toMinutes(h: number, m: number): number {
  return h * 60 + m;
}

/** Ca có chạy qua nửa đêm không (mốc kết thúc sớm hơn hoặc bằng mốc bắt đầu). */
export function spansMidnight(shift: Pick<ShiftDefinition, "startHour" | "startMinute" | "endHour" | "endMinute">): boolean {
  return toMinutes(shift.endHour, shift.endMinute) <= toMinutes(shift.startHour, shift.startMinute);
}

/**
 * Ô giờ `hour` có thuộc ca này không. Với ca qua nửa đêm, khoảng hợp lệ là hai đoạn rời
 * [start, 24:00) và [00:00, end).
 */
export function hourBelongsToShift(
  hour: number,
  shift: Pick<ShiftDefinition, "startHour" | "startMinute" | "endHour" | "endMinute">,
): boolean {
  const mid = bucketMidpointMinutes(hour);
  const start = toMinutes(shift.startHour, shift.startMinute);
  const end = toMinutes(shift.endHour, shift.endMinute);
  return spansMidnight(shift) ? mid >= start || mid < end : mid >= start && mid < end;
}

export interface HourCell {
  soldOn: Date;
  hour: number;
  finishedGoodItemId: string;
  quantity: number;
}

export interface ShiftCell {
  /** Ngày KINH DOANH của ca: với ca qua nửa đêm, phần giờ sau 0h được gán về ngày hôm trước. */
  businessDate: string;
  shift: ShiftCode;
  finishedGoodItemId: string;
  quantity: number;
}

function toDateKey(date: Date): string {
  // Cột là @db.Date nên phần giờ luôn là 00:00 UTC — đọc bằng getUTC* để không bị múi giờ của máy
  // chạy server đẩy sang ngày hôm trước (Render chạy giờ UTC, máy dev thì UTC+7).
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateKey(dateKey: string, offsetDays: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return toDateKey(d);
}

/**
 * Gộp các ô giờ thành ô (ngày kinh doanh × ca × món).
 *
 * Một ô giờ có thể không thuộc ca nào (quán đóng cửa) — khi đó nó bị bỏ, và đó là chủ ý: ba ca không
 * bắt buộc phủ kín 24 giờ.
 */
export function sliceByShift(cells: HourCell[], shifts: ShiftDefinition[]): ShiftCell[] {
  const byKey = new Map<string, ShiftCell>();

  for (const cell of cells) {
    const dateKey = toDateKey(cell.soldOn);
    for (const shift of shifts) {
      if (!hourBelongsToShift(cell.hour, shift)) continue;

      // Ca qua nửa đêm: phần giờ nằm ở nửa sau (trước mốc kết thúc) thuộc ngày kinh doanh HÔM TRƯỚC.
      const isAfterMidnightPart =
        spansMidnight(shift) && bucketMidpointMinutes(cell.hour) < toMinutes(shift.endHour, shift.endMinute);
      const businessDate = isAfterMidnightPart ? shiftDateKey(dateKey, -1) : dateKey;

      const key = `${businessDate}|${shift.code}|${cell.finishedGoodItemId}`;
      const current = byKey.get(key);
      if (current) current.quantity += cell.quantity;
      else byKey.set(key, { businessDate, shift: shift.code, finishedGoodItemId: cell.finishedGoodItemId, quantity: cell.quantity });
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.businessDate.localeCompare(b.businessDate) || a.shift.localeCompare(b.shift),
  );
}
