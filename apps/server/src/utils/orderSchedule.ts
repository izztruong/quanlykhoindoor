import { vnWeekday } from "./deadlines";

/**
 * Số ngày từ hôm nay tới NGÀY GỌI ĐỒ KẾ TIẾP, theo lịch gọi (các thứ trong tuần).
 *
 * Đây chính là số ngày một đơn phải phủ: lô đặt hôm nay về ngày `D + chờ`, lô đặt lần sau về
 * `D' + chờ` — **thời gian chờ triệt tiêu**, còn lại đúng `D' − D`. Nên không cần biết hàng nào chờ
 * bao lâu mới tính được số ngày phủ.
 *
 * Hôm nay LÀ ngày gọi thì trả về lần kế tiếp, không phải 0: đơn đặt tối nay phải phủ tới lúc lô sau
 * về, chứ không phải tới hết hôm nay.
 *
 * Ví dụ với lịch gọi {Thứ 5, Chủ nhật}: gọi tối CN → 4 (tới T5) · gọi tối T5 → 3 (tới CN) ·
 * chạy vào T3 → 2 (tới T5) · lịch chỉ có CN → 7.
 *
 * Trả `null` khi chưa khai lịch — phần gọi ý phải nói rõ "chưa khai lịch gọi" thay vì đoán một con số.
 */
export function daysUntilNextOrderDay(now: Date, orderWeekdays: number[]): number | null {
  const valid = [...new Set(orderWeekdays.filter((w) => Number.isInteger(w) && w >= 1 && w <= 7))];
  if (valid.length === 0) return null;

  const today = vnWeekday(now);
  const isOrderDay = new Set(valid);
  // Quét tối đa 7 ngày tới: có ít nhất một thứ hợp lệ nên chắc chắn gặp, và tệ nhất là đúng 7 ngày sau
  // (lịch chỉ khai một ngày, mà hôm nay chính là ngày đó).
  for (let ahead = 1; ahead <= 7; ahead++) {
    if (isOrderDay.has(((today + ahead - 1) % 7) + 1)) return ahead;
  }
  return null;
}

/** 1 = Thứ 2 … 7 = Chủ nhật. Dùng cho chuỗi giải thích trả về người dùng. */
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  7: "Chủ nhật",
};
