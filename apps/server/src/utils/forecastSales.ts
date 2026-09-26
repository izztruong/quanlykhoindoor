import { prisma } from "../config/db";
import type { ShiftCode } from "../generated/prisma/client";
import { sliceByShift } from "../modules/posSales/shiftSlicing";

/**
 * LÕI DỰ BÁO DÙNG CHUNG cho cả gọi đồ và chuẩn bị ca.
 *
 * Cố ý chỉ có MỘT bản: hai module dự báo riêng sẽ cho hai con số khác nhau cho cùng một ngày, và khi
 * lệch thì không ai biết tin cái nào. Gọi đồ lấy kết quả ở đây nhân công thức BOM ra nguyên liệu; chuẩn
 * bị ca lấy chính nó cho khoảng ngắn hơn và dừng ở mức thành phẩm.
 *
 * Phương pháp: trung bình **có trọng số theo độ mới** của các lần (thứ K × ca C) gần nhất. Không dùng
 * hồi quy hay mô hình gì phức tạp hơn, vì ba lý do: kết quả lặp lại được và giải thích được cho quán
 * ("4 Chủ nhật gần nhất ca tối bán 38 ly"), dữ liệu chỉ có vài tháng, và mọi ràng buộc thật (bội số mẻ,
 * hạn dùng) nằm ở tầng trên chứ không ở đây.
 */

/** Cửa sổ trượt. Quán đổi menu hay đổi giá thì dữ liệu cũ hơn thế là nhiễu, không phải tài sản. */
export const FORECAST_WINDOW_WEEKS = 8;

/**
 * Hệ số giảm theo tuần: quan sát cách đây 1 tuần nặng 0,85 lần quan sát tuần này, 2 tuần trước 0,72…
 *
 * Để 0,85 vì trong cửa sổ 8 tuần thì tuần cũ nhất vẫn còn ~30% trọng số — đủ nhẹ để theo kịp xu hướng
 * mà không biến dự báo thành "y như tuần trước" (điều sẽ xảy ra nếu để 0,5).
 */
export const FORECAST_WEEKLY_DECAY = 0.85;

/**
 * Số quan sát tối thiểu ở mức (thứ × ca) để dùng mức đó. Dưới ngưỡng thì gộp mọi thứ trong tuần lại và
 * chỉ tách theo ca — thà một con số thô mà có, hơn là không đề xuất được gì cho món ít bán.
 */
export const MIN_SHIFT_OBSERVATIONS = 3;

export interface ShiftSlot {
  /** "YYYY-MM-DD" theo ngày KINH DOANH, cùng quy ước với sliceByShift. */
  businessDate: string;
  shift: ShiftCode;
}

export type ForecastSource = "WEEKDAY_SHIFT" | "SHIFT_ONLY" | "NONE";

export interface ForecastCell extends ShiftSlot {
  finishedGoodItemId: string;
  /** SL dự kiến bán trong ca này. 0 là một dự báo hợp lệ (món không bán ca đó). */
  quantity: number;
  /** Số ca quá khứ đã dùng để tính. 0 đi kèm source NONE. */
  observations: number;
  source: ForecastSource;
  /** Hệ số ngày đã nhân vào (lễ tết). 1 = ngày thường. */
  dayFactor: number;
  /** Giải thích một dòng, ghép thẳng vào reasons[] của module gọi. */
  detail: string;
}

const SOURCE_LABEL: Record<ForecastSource, string> = {
  WEEKDAY_SHIFT: "cùng thứ, cùng ca",
  SHIFT_ONLY: "cùng ca, gộp mọi thứ trong tuần",
  NONE: "chưa có dữ liệu",
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Thứ theo ISO của một ngày lịch: 1 = Thứ 2 … 7 = Chủ nhật. */
function weekdayOf(dateKey: string): number {
  const jsDay = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function dateKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function daysBetweenKeys(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00.000Z`).getTime();
  const b = new Date(`${to}T12:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Mọi ca của mọi ngày trong khoảng — để phần gọi đồ dự báo một dải ngày bằng chính lõi theo ca. */
export function shiftSlotsBetween(fromKey: string, toKey: string, shifts: ShiftCode[]): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  const total = daysBetweenKeys(fromKey, toKey);
  for (let i = 0; i <= total; i++) {
    const d = new Date(`${fromKey}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const businessDate = dateKeyOf(d);
    for (const shift of shifts) slots.push({ businessDate, shift });
  }
  return slots;
}

export interface ForecastInput {
  userId: string;
  slots: ShiftSlot[];
  /** Bỏ trống = mọi món có lịch sử bán trong cửa sổ. */
  finishedGoodItemIds?: string[];
  /** Mốc "bây giờ", quyết định cửa sổ trượt và trọng số. Truyền vào để kiểm chứng được. */
  now?: Date;
}

export interface ForecastResult {
  cells: ForecastCell[];
  /** Số ca quá khứ có dữ liệu trong cửa sổ — chỉ số cho biết dự báo dựa trên bao nhiêu. */
  observedShifts: number;
  /** Ngày cũ nhất và mới nhất có dữ liệu, để màn hình nói rõ "số liệu tính đến lúc nào". */
  historyFrom: string | null;
  historyTo: string | null;
}

/**
 * Dự báo SL bán của từng món trong từng ca được hỏi.
 *
 * Hai điểm dễ làm sai, đã xử lý ở đây:
 *
 *  - **Ca không có dòng nào của một món KHÔNG phải là thiếu dữ liệu, mà là bán 0.** Nếu chỉ chia cho số
 *    ca có bán thì món bán 3 trong 8 Chủ nhật sẽ được dự báo như thể Chủ nhật nào cũng bán — đề xuất pha
 *    gần gấp ba. Nên mẫu số là **số ca đã có dữ liệu** (ca nào cũng tính, món thiếu thì tính 0).
 *  - **Quan sát của ngày lễ phải chia lại cho hệ số của ngày đó trước khi vào trung bình.** Không chuẩn
 *    hoá thì một Tết đông gấp đôi sẽ đội mức nền của đúng thứ đó lên mãi mãi.
 */
export async function forecastSales(input: ForecastInput): Promise<ForecastResult> {
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - FORECAST_WINDOW_WEEKS * 7 * 86_400_000);

  const [hours, shiftDefs, factors] = await Promise.all([
    prisma.posSaleHour.findMany({
      where: {
        userId: input.userId,
        soldOn: { gte: windowStart },
        finishedGoodItemId: input.finishedGoodItemIds ? { in: input.finishedGoodItemIds } : undefined,
      },
      select: { soldOn: true, hour: true, finishedGoodItemId: true, quantity: true },
    }),
    prisma.shiftDefinition.findMany(),
    prisma.salesDayFactor.findMany({ select: { date: true, factor: true } }),
  ]);

  const factorByDate = new Map(factors.map((f) => [dateKeyOf(f.date), Number(f.factor)]));
  const dayFactor = (dateKey: string) => factorByDate.get(dateKey) ?? 1;

  const cellsHistory = sliceByShift(
    hours.map((h) => ({
      soldOn: h.soldOn,
      hour: h.hour,
      finishedGoodItemId: h.finishedGoodItemId,
      quantity: Number(h.quantity),
    })),
    shiftDefs,
  );

  // Ca đã có dữ liệu — đây là mẫu số, không phải "số ca có bán món này".
  const observedSlotKeys = new Set(cellsHistory.map((c) => `${c.businessDate}|${c.shift}`));
  const observedSlots = [...observedSlotKeys].map((key) => {
    const [businessDate, shift] = key.split("|");
    return { businessDate: businessDate!, shift: shift! as ShiftCode, weekday: weekdayOf(businessDate!) };
  });

  const soldByKey = new Map(
    cellsHistory.map((c) => [`${c.businessDate}|${c.shift}|${c.finishedGoodItemId}`, c.quantity]),
  );

  const itemIds =
    input.finishedGoodItemIds ?? [...new Set(cellsHistory.map((c) => c.finishedGoodItemId))].sort((a, b) => a.localeCompare(b));

  const nowKey = dateKeyOf(new Date(now.getTime() + 7 * 3_600_000)); // ngày theo giờ VN
  const historyDates = [...new Set(observedSlots.map((s) => s.businessDate))].sort();

  /** Trung bình có trọng số của một món trên một tập ca quá khứ. */
  function weightedMean(slots: typeof observedSlots, itemId: string): { value: number; observations: number } {
    let weightSum = 0;
    let valueSum = 0;
    for (const slot of slots) {
      const weeksAgo = Math.max(0, Math.floor(daysBetweenKeys(slot.businessDate, nowKey) / 7));
      const weight = FORECAST_WEEKLY_DECAY ** weeksAgo;
      const raw = soldByKey.get(`${slot.businessDate}|${slot.shift}|${itemId}`) ?? 0;
      // Chuẩn hoá về ngày thường: ngày lễ đông gấp 1,8 thì quan sát chia lại cho 1,8.
      valueSum += (raw / dayFactor(slot.businessDate)) * weight;
      weightSum += weight;
    }
    return { value: weightSum > 0 ? valueSum / weightSum : 0, observations: slots.length };
  }

  const cells: ForecastCell[] = [];
  for (const slot of input.slots) {
    const weekday = weekdayOf(slot.businessDate);
    const sameWeekdayShift = observedSlots.filter((s) => s.shift === slot.shift && s.weekday === weekday);
    const sameShift = observedSlots.filter((s) => s.shift === slot.shift);
    const factor = dayFactor(slot.businessDate);

    for (const itemId of itemIds) {
      let source: ForecastSource;
      let basis: typeof observedSlots;
      if (sameWeekdayShift.length >= MIN_SHIFT_OBSERVATIONS) {
        source = "WEEKDAY_SHIFT";
        basis = sameWeekdayShift;
      } else if (sameShift.length > 0) {
        source = "SHIFT_ONLY";
        basis = sameShift;
      } else {
        source = "NONE";
        basis = [];
      }

      const { value, observations } = weightedMean(basis, itemId);
      const quantity = round3(value * factor);
      const parts = [
        source === "NONE"
          ? "Chưa có doanh số ca nào trong cửa sổ 8 tuần"
          : `Dự báo ${quantity} từ ${observations} ca (${SOURCE_LABEL[source]})`,
      ];
      if (source === "SHIFT_ONLY") {
        parts.push(`chưa đủ ${MIN_SHIFT_OBSERVATIONS} lần cùng thứ nên gộp mọi thứ trong tuần`);
      }
      if (factor !== 1) parts.push(`đã nhân hệ số ngày ${factor}`);

      cells.push({
        ...slot,
        finishedGoodItemId: itemId,
        quantity,
        observations,
        source,
        dayFactor: factor,
        detail: parts.join(" — "),
      });
    }
  }

  return {
    cells,
    observedShifts: observedSlots.length,
    historyFrom: historyDates[0] ?? null,
    historyTo: historyDates[historyDates.length - 1] ?? null,
  };
}
