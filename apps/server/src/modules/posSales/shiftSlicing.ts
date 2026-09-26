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

/**
 * Múi giờ VN. Giống hằng trong utils/deadlines và cùng lý do: Render chạy UTC, để nguyên thì mốc
 * "17:00 ca tối" thành nửa đêm.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Thứ tự các ca TRONG NGÀY, suy từ mốc bắt đầu chứ không từ tên mã.
 *
 * Không xếp theo CA1/CA2/CA3 vì khung giờ là cấu hình admin đổi được: nếu ai đó đặt CA1 là ca đêm thì
 * xếp theo mã sẽ cho ra "ca trước ca sáng là ca tối hôm nay", tức tồn đầu ca lấy từ tương lai.
 */
export function shiftsInOrder<T extends Pick<ShiftDefinition, "startHour" | "startMinute">>(shifts: T[]): T[] {
  return [...shifts].sort((a, b) => toMinutes(a.startHour, a.startMinute) - toMinutes(b.startHour, b.startMinute));
}

export interface ShiftRef {
  businessDate: string;
  shift: ShiftCode;
}

/**
 * Ca liền trước theo thời gian. Ca đầu ngày thì lùi về ca CUỐI của ngày kinh doanh hôm trước.
 *
 * Trả null khi chưa khai ca nào — không đoán, vì mọi thứ phía sau (tồn đầu ca, vòng đo hao hụt) đều neo
 * vào con số này.
 */
export function previousShift(ref: ShiftRef, shifts: ShiftDefinition[]): ShiftRef | null {
  const ordered = shiftsInOrder(shifts);
  const index = ordered.findIndex((s) => s.code === ref.shift);
  if (index < 0) return null;
  if (index > 0) return { businessDate: ref.businessDate, shift: ordered[index - 1]!.code };
  const last = ordered[ordered.length - 1]!;
  return { businessDate: shiftDateKey(ref.businessDate, -1), shift: last.code };
}

/** Ca liền sau theo thời gian. Ca cuối ngày thì sang ca ĐẦU của ngày kinh doanh hôm sau. */
export function nextShift(ref: ShiftRef, shifts: ShiftDefinition[]): ShiftRef | null {
  const ordered = shiftsInOrder(shifts);
  const index = ordered.findIndex((s) => s.code === ref.shift);
  if (index < 0) return null;
  if (index < ordered.length - 1) return { businessDate: ref.businessDate, shift: ordered[index + 1]!.code };
  return { businessDate: shiftDateKey(ref.businessDate, 1), shift: ordered[0]!.code };
}

/**
 * Mốc bắt đầu và kết thúc THẬT của một ca trong một ngày kinh doanh.
 *
 * Ca qua nửa đêm thì mốc kết thúc rơi sang ngày lịch hôm sau — đó chính là lý do phải trả Date chứ không
 * trả giờ: mọi phép "mẻ này dùng được tới mấy giờ" đều so trên trục thời gian thật.
 */
export function shiftWindow(businessDate: string, shift: ShiftDefinition): { start: Date; end: Date } {
  const [year, month, day] = businessDate.split("-").map(Number);
  const at = (h: number, m: number, plusDays = 0) =>
    new Date(Date.UTC(year!, month! - 1, day! + plusDays, h, m) - VN_OFFSET_MS);
  return {
    start: at(shift.startHour, shift.startMinute),
    end: at(shift.endHour, shift.endMinute, spansMidnight(shift) ? 1 : 0),
  };
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
