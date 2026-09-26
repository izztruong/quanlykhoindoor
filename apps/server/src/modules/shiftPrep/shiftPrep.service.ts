import { prisma } from "../../config/db";
import type { PrepMode, ShiftCode, ShiftDefinition } from "../../generated/prisma/client";
import { forecastSales, type ForecastSource } from "../../utils/forecastSales";
import { HttpError } from "../../utils/httpError";
import { nextShift, previousShift, shiftWindow, shiftsInOrder, sliceByShift } from "../posSales/shiftSlicing";

/**
 * Chuẩn bị đồ thành phẩm theo ca.
 *
 * Dùng chung lõi dự báo với phần gọi đồ (`utils/forecastSales`) — khác nhau ở chỗ dừng lại: gọi đồ nhân
 * tiếp công thức BOM ra nguyên liệu, còn ở đây dừng ở mức thành phẩm rồi chia theo bội số mẻ.
 *
 * **Đếm CUỐI ca, không phải đầu ca.** Cuối ca N chính là đầu ca N+1, nên một lần đếm phục vụ hai việc —
 * và quan trọng hơn, nó khép kín vòng đo hao hụt. Đầu ca sau, màn chuẩn bị lấy sẵn số đếm cuối ca trước
 * và chỉ cho sửa khi lệch.
 *
 * **Không có chuyện cộng dồn hai lần, và không cần thêm trạng thái nào để tránh:** ca sáng pha đủ cho cả
 * ca chiều thì đầu ca chiều đếm thấy còn nhiều → cần pha = 0. Con số đếm tay tự khớp mọi thứ, kể cả phần
 * đã đổ đi.
 */

export type OnHandSource =
  /** Người dùng gõ tay trên màn. */
  | "MANUAL"
  /** Lấy từ phiếu đếm cuối ca liền trước — đường chạy thường ngày. */
  | "PREV_SHIFT_COUNT"
  /** Ca trước không đếm: suy từ lần đếm gần nhất, cộng đã pha, trừ đã bán. */
  | "ESTIMATED"
  /** Qua đêm mà hạn dùng không phủ hết khoảng nghỉ → về 0. */
  | "RESET_OVERNIGHT"
  /** Không có gì để dựa vào. */
  | "NONE";

export interface PrepSuggestionRow {
  finishedGoodItemId: string;
  code: string;
  name: string;
  unitLabel: string;
  mode: PrepMode;
  batchSize: number | null;
  shelfLifeHours: number | null;
  targetLevel: number | null;

  onHandQty: number;
  onHandSource: OnHandSource;
  /** Số ca liên tiếp trước đó không ai đếm. 0 = ca trước có đếm. */
  uncountedShifts: number;

  demandQty: number;
  /** Nguồn dự báo, chỉ có nghĩa với chế độ FORECAST. */
  forecastSource: ForecastSource | null;
  /** Các ca mà một mẻ pha bây giờ còn dùng được (kể cả ca này). */
  coversShifts: ShiftCode[];
  /** Mốc hết hạn của mẻ pha bây giờ. Null = chưa khai hạn dùng. */
  expiresAt: string | null;

  /** Lượng cần pha trước khi làm tròn lên mẻ. */
  suggestedQty: number;
  suggestedBatches: number;
  reasons: string[];
}

export interface PrepSuggestionResult {
  businessDate: string;
  shift: ShiftCode;
  shiftName: string;
  /** Mốc bắt đầu ca, dùng làm mốc tính hạn dùng. */
  shiftStart: string;
  shiftEnd: string;
  items: PrepSuggestionRow[];
  /** Ca liền trước — màn hình hiện để người đếm biết số tồn lấy từ đâu. */
  previousShift: { businessDate: string; shift: ShiftCode } | null;
  previousShiftCounted: boolean;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function dateKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function parseBusinessDate(key: string): Date {
  // Cột @db.Date: ép về giữa trưa UTC như parseDateOnly của posSales, để đổi múi giờ không lùi ngày.
  return new Date(`${key}T12:00:00.000Z`);
}

/**
 * Phiếu đếm của một (quán × ngày kinh doanh × ca).
 *
 * **Dùng `findFirst` chứ KHÔNG `findUnique`, dù đã có `@@unique` đúng ba cột này.** Prisma gộp các lời
 * gọi `findUnique` chạy song song trên cùng một model thành một truy vấn, và bản gộp đó **sai khi khoá
 * ghép có cột `@db.Date`**: cả hai lượt đều trả null dù bản ghi có thật. Chạy tuần tự thì đúng, nên lỗi
 * chỉ hiện ra khi hai lượt nằm chung một `Promise.all` — rất khó lần.
 *
 * `findFirst` không bị gộp nên không vướng. Cùng số round trip, cùng kết quả (khoá vẫn là unique).
 */
function findCountByShift(userId: string, businessDate: string, shift: ShiftCode) {
  return prisma.shiftStockCount.findFirst({
    where: { userId, businessDate: parseBusinessDate(businessDate), shift },
    include: { items: true },
  });
}

async function loadShifts(): Promise<ShiftDefinition[]> {
  const shifts = await prisma.shiftDefinition.findMany();
  if (shifts.length === 0) throw new HttpError(400, "Chưa khai khung giờ ca — vào Quản trị › Khung giờ ca để khai trước");
  return shiftsInOrder(shifts);
}

export interface PrepPreviewInput {
  userId: string;
  businessDate: string;
  shift: ShiftCode;
  /** Tồn đầu ca người dùng gõ tay, đè lên số suy từ phiếu đếm. */
  onHandFinished?: { finishedGoodItemId: string; quantity: number }[];
  now?: Date;
}

export async function suggestPrep(input: PrepPreviewInput): Promise<PrepSuggestionResult> {
  const shifts = await loadShifts();
  const shiftDef = shifts.find((s) => s.code === input.shift);
  if (!shiftDef) throw new HttpError(400, "Ca không tồn tại trong khung giờ đã khai");

  const window = shiftWindow(input.businessDate, shiftDef);
  const prev = previousShift({ businessDate: input.businessDate, shift: input.shift }, shifts);

  const [items, targets, prevCount] = await Promise.all([
    // Chỉ món `prepared` — giữ danh sách NGẮN là điều kiện để nhân viên đếm thật, 3 lần mỗi ngày.
    prisma.finishedGoodItem.findMany({
      where: { prepared: true },
      include: { unit: true },
      orderBy: { name: "asc" },
    }),
    prisma.shiftPrepTarget.findMany({ where: { userId: input.userId, shift: input.shift } }),
    // findFirst, KHÔNG findUnique — xem chú thích findCountByShift.
    prev ? findCountByShift(input.userId, prev.businessDate, prev.shift) : Promise.resolve(null),
  ]);

  const targetByItem = new Map(targets.map((t) => [t.finishedGoodItemId, t]));
  const manualByItem = new Map((input.onHandFinished ?? []).map((it) => [it.finishedGoodItemId, it.quantity]));
  const itemIds = items.map((it) => it.id);

  const onHandInfo = await resolveOnHand({
    userId: input.userId,
    itemIds,
    current: { businessDate: input.businessDate, shift: input.shift },
    shifts,
    shiftDef,
    shiftStart: window.start,
    prevCount,
    items,
  });

  // Tầm nhìn: ca này và các ca CÒN LẠI TRONG NGÀY KINH DOANH, không xa hơn.
  //
  // Dừng ở hết ngày kể cả khi hạn dùng còn dài: đầu ca mai sẽ có một lượt pha nữa, nên pha sẵn cho ngày
  // mai chỉ làm tủ đầy và tăng phần phải đổ đi. Siro hạn 72 giờ mà tính cả 6 ca của hai ngày thì đề xuất
  // gấp đôi lượng thật cần — đã gặp khi thử.
  //
  // Vẫn giữ khung hạn dùng cho phần lọc bên dưới: một mẻ phủ được 2 trong 3 ca hôm nay thì chỉ tính 2 ca.
  const horizon: { businessDate: string; shift: ShiftCode; end: Date }[] = [];
  let cursor: { businessDate: string; shift: ShiftCode } | null = { businessDate: input.businessDate, shift: input.shift };
  for (let i = 0; i < shifts.length && cursor; i++) {
    if (cursor.businessDate !== input.businessDate) break;
    const def = shifts.find((s) => s.code === cursor!.shift)!;
    horizon.push({ businessDate: cursor.businessDate, shift: cursor.shift, end: shiftWindow(cursor.businessDate, def).end });
    cursor = nextShift(cursor, shifts);
  }

  const forecast = await forecastSales({
    userId: input.userId,
    slots: horizon.map((h) => ({ businessDate: h.businessDate, shift: h.shift })),
    finishedGoodItemIds: itemIds,
    now: input.now,
  });
  const forecastByKey = new Map(forecast.cells.map((c) => [`${c.businessDate}|${c.shift}|${c.finishedGoodItemId}`, c]));

  const rows: PrepSuggestionRow[] = items.map((item) => {
    const target = targetByItem.get(item.id);
    const mode: PrepMode = target?.mode ?? "TARGET_LEVEL";
    const batchSize = item.batchSize == null ? null : Number(item.batchSize);
    const targetLevel = target?.targetLevel == null ? null : Number(target.targetLevel);
    const onHand = onHandInfo.get(item.id)!;
    const reasons: string[] = [...onHand.reasons];

    const row: PrepSuggestionRow = {
      finishedGoodItemId: item.id,
      code: item.code,
      name: item.name,
      unitLabel: item.unit?.name ?? "-",
      mode,
      batchSize,
      shelfLifeHours: item.shelfLifeHours,
      targetLevel,
      onHandQty: onHand.quantity,
      onHandSource: manualByItem.has(item.id) ? "MANUAL" : onHand.source,
      uncountedShifts: onHand.uncountedShifts,
      demandQty: 0,
      forecastSource: null,
      coversShifts: [],
      expiresAt: null,
      suggestedQty: 0,
      suggestedBatches: 0,
      reasons,
    };

    // Ô người dùng gõ luôn thắng — họ đang đứng trước tủ hàng, hệ thống thì không.
    if (manualByItem.has(item.id)) {
      row.onHandQty = round3(manualByItem.get(item.id)!);
      row.reasons = [`Tồn đầu ca ${row.onHandQty} do người dùng gõ tay`];
    }

    if (mode === "OFF") {
      row.reasons.push("Đã tắt đề xuất cho món này ở ca này");
      return row;
    }

    // Khung hạn dùng: một mẻ pha lúc bắt đầu ca còn dùng được tới đâu.
    const shelfLifeHours = item.shelfLifeHours;
    const covered =
      shelfLifeHours == null
        ? horizon.slice(0, 1)
        : horizon.filter((h) => h.end.getTime() <= window.start.getTime() + shelfLifeHours * 3_600_000);
    // Luôn phủ ít nhất ca này: hạn dùng ngắn hơn một ca thì vẫn phải pha cho ca đang tới.
    const coveredShifts = covered.length > 0 ? covered : horizon.slice(0, 1);
    row.coversShifts = coveredShifts.map((h) => h.shift);
    row.expiresAt =
      shelfLifeHours == null ? null : new Date(window.start.getTime() + shelfLifeHours * 3_600_000).toISOString();

    if (mode === "TARGET_LEVEL") {
      if (targetLevel == null) {
        row.reasons.push("Chưa khai mức mục tiêu cho ca này — khai ở Quản trị › Mức chuẩn bị theo ca");
        return row;
      }
      row.demandQty = targetLevel;
      row.reasons.push(`Mức mục tiêu ca này: ${targetLevel} ${row.unitLabel}`);
    } else {
      const cells = coveredShifts.map((h) => forecastByKey.get(`${h.businessDate}|${h.shift}|${item.id}`));
      if (cells.some((c) => c == null) || cells.every((c) => c!.source === "NONE")) {
        row.reasons.push("Chưa đủ doanh số để dự báo — dùng chế độ mức mục tiêu cho tới khi có dữ liệu");
        return row;
      }
      // CỘNG đúng các ca sắp tới, KHÔNG nhân trung bình với số ca: ca tối bán khác ca sáng.
      row.demandQty = round3(cells.reduce((sum, c) => sum + c!.quantity, 0));
      row.forecastSource = cells[0]!.source;
      row.reasons.push(
        `Dự báo ${row.demandQty} ${row.unitLabel} cho ${coveredShifts.length} ca còn lại trong ngày (${row.coversShifts.join(", ")}) — đầu ca mai sẽ pha tiếp`,
      );
      row.reasons.push(cells[0]!.detail);
      if (shelfLifeHours == null) {
        row.reasons.push("Chưa khai số giờ dùng được sau khi pha — chỉ tính cho ca này, khai ở Danh mục › Đồ thành phẩm");
      }
    }

    const need = Math.max(0, row.demandQty - row.onHandQty);
    row.suggestedQty = round3(need);
    if (need <= 0) {
      row.reasons.push(`Tồn ${row.onHandQty} đã đủ cho nhu cầu ${row.demandQty} — chưa cần pha`);
      return row;
    }
    row.reasons.push(`Cần pha ${row.suggestedQty} = nhu cầu ${row.demandQty} − tồn ${row.onHandQty}`);

    if (batchSize == null || batchSize <= 0) {
      row.reasons.push("Chưa khai một mẻ ra bao nhiêu — đề xuất theo đơn vị, không theo mẻ");
      return row;
    }
    row.suggestedBatches = Math.ceil(need / batchSize);
    row.reasons.push(`${row.suggestedBatches} mẻ × ${batchSize} = ${round3(row.suggestedBatches * batchSize)} (không pha được nửa mẻ)`);
    return row;
  });

  return {
    businessDate: input.businessDate,
    shift: input.shift,
    shiftName: shiftDef.name,
    shiftStart: window.start.toISOString(),
    shiftEnd: window.end.toISOString(),
    items: rows,
    previousShift: prev,
    previousShiftCounted: prevCount != null,
  };
}

interface OnHandResolved {
  quantity: number;
  source: OnHandSource;
  uncountedShifts: number;
  reasons: string[];
}

/**
 * Tồn đầu ca của từng món.
 *
 * Bốn đường, theo thứ tự:
 *   1. Ca trước có phiếu đếm → dùng luôn (đường thường ngày).
 *   2. Ca trước KHÔNG đếm → suy từ lần đếm gần nhất: cộng đã pha, trừ đã bán. Chính là phương trình đo
 *      hao hụt viết ngược, và nói rõ là số ước tính — một con số đoán trông y hệt số thật.
 *   3. Qua đêm mà hạn dùng không phủ hết khoảng nghỉ → 0, kèm lý do. Lặng lẽ dùng số cuối ngày hôm trước
 *      là đề xuất pha thiếu vào đúng ca đông nhất.
 *   4. Không có gì → 0 và nói thẳng là không có gì.
 */
async function resolveOnHand(args: {
  userId: string;
  itemIds: string[];
  current: { businessDate: string; shift: ShiftCode };
  shifts: ShiftDefinition[];
  shiftDef: ShiftDefinition;
  shiftStart: Date;
  prevCount: { businessDate: Date; shift: ShiftCode; countedAt: Date; items: { finishedGoodItemId: string; quantity: unknown }[] } | null;
  items: { id: string; shelfLifeHours: number | null; batchSize: unknown }[];
}): Promise<Map<string, OnHandResolved>> {
  const result = new Map<string, OnHandResolved>();
  const { prevCount, shifts, current, shiftStart } = args;

  // Ca này có phải ca ĐẦU ngày kinh doanh không — quyết định có khoảng nghỉ qua đêm hay không.
  const isFirstOfDay = shifts[0]!.code === current.shift;

  if (prevCount) {
    const countedByItem = new Map(prevCount.items.map((it) => [it.finishedGoodItemId, Number(it.quantity)]));
    const gapHours = (shiftStart.getTime() - prevCount.countedAt.getTime()) / 3_600_000;
    for (const item of args.items) {
      const counted = countedByItem.get(item.id) ?? 0;
      const reasons: string[] = [];
      // Hạn dùng không phủ hết khoảng từ lúc đếm tới lúc mở ca → coi như phải bỏ.
      if (item.shelfLifeHours != null && gapHours > item.shelfLifeHours) {
        reasons.push(
          `Đếm cuối ca trước còn ${counted}, nhưng đã qua ${Math.round(gapHours)} giờ > hạn dùng ${item.shelfLifeHours} giờ${isFirstOfDay ? " (nghỉ qua đêm)" : ""} — tính tồn 0`,
        );
        result.set(item.id, { quantity: 0, source: "RESET_OVERNIGHT", uncountedShifts: 0, reasons });
        continue;
      }
      reasons.push(
        countedByItem.has(item.id)
          ? `Tồn đầu ca lấy từ phiếu đếm cuối ca trước: ${counted}`
          : "Phiếu đếm cuối ca trước không có món này — tính tồn 0, sửa lại nếu còn hàng",
      );
      if (item.shelfLifeHours == null && isFirstOfDay) {
        reasons.push("Chưa khai số giờ dùng được nên vẫn giữ số đếm qua đêm — khai ở Danh mục › Đồ thành phẩm");
      }
      result.set(item.id, { quantity: round3(counted), source: "PREV_SHIFT_COUNT", uncountedShifts: 0, reasons });
    }
    return result;
  }

  // Ca trước không đếm: tìm lần đếm gần nhất TRƯỚC MỐC MỞ CA.
  //
  // Lọc theo countedAt chứ không theo businessDate: phiếu đếm của chính ca đang xét (hoặc của ca sau)
  // vẫn thuộc cùng ngày kinh doanh, nên lọc theo ngày sẽ lấy được một phiếu ở TƯƠNG LAI rồi kết luận
  // "không có lần đếm nào" — đúng lỗi đã gặp: đề xuất pha lại từ đầu dù tủ còn đầy hàng.
  const lastCount = await prisma.shiftStockCount.findFirst({
    where: { userId: args.userId, countedAt: { lt: shiftStart } },
    orderBy: { countedAt: "desc" },
    include: { items: true },
  });

  if (!lastCount) {
    for (const item of args.items) {
      result.set(item.id, {
        quantity: 0,
        source: "NONE",
        uncountedShifts: 0,
        reasons: ["Chưa có lần đếm tồn nào trước ca này — đang tính tồn 0, gõ số thật vào ô tồn"],
      });
    }
    return result;
  }

  // Đã pha và đã bán trong khoảng từ lần đếm đó tới lúc mở ca này.
  const [runs, hours, itemRows] = await Promise.all([
    prisma.shiftPrepRun.findMany({
      where: { userId: args.userId, businessDate: { gte: lastCount.businessDate, lte: parseBusinessDate(current.businessDate) } },
      include: { items: true },
    }),
    prisma.posSaleHour.findMany({
      where: {
        userId: args.userId,
        soldOn: { gte: lastCount.businessDate },
        finishedGoodItemId: { in: args.itemIds },
      },
      select: { soldOn: true, hour: true, finishedGoodItemId: true, quantity: true },
    }),
    prisma.finishedGoodItem.findMany({ where: { id: { in: args.itemIds } }, select: { id: true, batchSize: true } }),
  ]);

  const batchById = new Map(itemRows.map((r) => [r.id, r.batchSize == null ? 0 : Number(r.batchSize)]));
  const sold = sliceByShift(
    hours.map((h) => ({ soldOn: h.soldOn, hour: h.hour, finishedGoodItemId: h.finishedGoodItemId, quantity: Number(h.quantity) })),
    shifts,
  );

  // Các ca nằm GIỮA lần đếm và ca này — chỉ những ca đó mới được cộng/trừ.
  const lastCountKey = dateKeyOf(lastCount.businessDate);
  const between = new Set<string>();
  let walker = nextShift({ businessDate: lastCountKey, shift: lastCount.shift }, shifts);
  let guard = 0;
  while (walker && guard++ < shifts.length * 14) {
    const def = shifts.find((s) => s.code === walker!.shift)!;
    if (shiftWindow(walker.businessDate, def).start.getTime() >= shiftStart.getTime()) break;
    between.add(`${walker.businessDate}|${walker.shift}`);
    walker = nextShift(walker, shifts);
  }

  const preparedByItem = new Map<string, number>();
  for (const run of runs) {
    if (!between.has(`${dateKeyOf(run.businessDate)}|${run.shift}`)) continue;
    for (const it of run.items) {
      if (it.actualBatches == null) continue;
      const batch = batchById.get(it.finishedGoodItemId) ?? 0;
      preparedByItem.set(it.finishedGoodItemId, (preparedByItem.get(it.finishedGoodItemId) ?? 0) + it.actualBatches * batch);
    }
  }
  const soldByItem = new Map<string, number>();
  for (const cell of sold) {
    if (!between.has(`${cell.businessDate}|${cell.shift}`)) continue;
    soldByItem.set(cell.finishedGoodItemId, (soldByItem.get(cell.finishedGoodItemId) ?? 0) + cell.quantity);
  }

  const countedByItem = new Map(lastCount.items.map((it) => [it.finishedGoodItemId, Number(it.quantity)]));
  const gapHours = (shiftStart.getTime() - lastCount.countedAt.getTime()) / 3_600_000;

  for (const item of args.items) {
    const counted = countedByItem.get(item.id) ?? 0;
    const prepared = preparedByItem.get(item.id) ?? 0;
    const soldQty = soldByItem.get(item.id) ?? 0;
    const reasons = [
      `ĐANG DÙNG SỐ ƯỚC TÍNH vì ${between.size} ca trước đó không ai đếm tồn`,
      `Đếm gần nhất ${counted} + đã pha ${round3(prepared)} − đã bán ${round3(soldQty)}`,
    ];
    if (item.shelfLifeHours != null && gapHours > item.shelfLifeHours) {
      reasons.push(`Đã qua ${Math.round(gapHours)} giờ > hạn dùng ${item.shelfLifeHours} giờ — phần cũ coi như phải bỏ, tính tồn 0`);
      result.set(item.id, { quantity: 0, source: "RESET_OVERNIGHT", uncountedShifts: between.size, reasons });
      continue;
    }
    result.set(item.id, {
      quantity: round3(Math.max(0, counted + prepared - soldQty)),
      source: "ESTIMATED",
      uncountedShifts: between.size,
      reasons,
    });
  }
  return result;
}

/**
 * Hao hụt của một ca ĐÃ XONG: tồn đầu + đã pha − đã bán − tồn cuối.
 *
 * Đây là bản thành phẩm của cột `variance` trong Check Cost, nhưng ở độ phân giải CA. Không có nó thì
 * "lượng đổ đi" chỉ là phỏng đoán.
 *
 * Cần đủ HAI phiếu đếm (đầu và cuối ca) mới tính được — thiếu một đầu thì trả null cho món đó chứ không
 * suy, vì sai số của phép suy sẽ bị đọc thành hao hụt.
 */
export interface ShiftVarianceRow {
  finishedGoodItemId: string;
  code: string;
  name: string;
  unitLabel: string;
  openingQty: number | null;
  preparedQty: number;
  soldQty: number;
  closingQty: number | null;
  /** Null khi thiếu phiếu đếm ở một trong hai đầu. */
  varianceQty: number | null;
  note: string;
}

export async function getShiftVariance(userId: string, businessDate: string, shift: ShiftCode): Promise<ShiftVarianceRow[]> {
  const shifts = await loadShifts();
  const shiftDef = shifts.find((s) => s.code === shift);
  if (!shiftDef) throw new HttpError(400, "Ca không tồn tại trong khung giờ đã khai");
  const prev = previousShift({ businessDate, shift }, shifts);

  const [items, opening, closing, run, hours] = await Promise.all([
    prisma.finishedGoodItem.findMany({ where: { prepared: true }, include: { unit: true }, orderBy: { name: "asc" } }),
    // HAI lượt tìm phiếu đếm chạy song song ở đây — đúng trường hợp làm findUnique trả null, xem
    // chú thích findCountByShift.
    prev ? findCountByShift(userId, prev.businessDate, prev.shift) : Promise.resolve(null),
    findCountByShift(userId, businessDate, shift),
    prisma.shiftPrepRun.findFirst({
      where: { userId, businessDate: parseBusinessDate(businessDate), shift },
      include: { items: true },
    }),
    prisma.posSaleHour.findMany({
      where: { userId, soldOn: { gte: parseBusinessDate(businessDate), lte: new Date(parseBusinessDate(businessDate).getTime() + 86_400_000) } },
      select: { soldOn: true, hour: true, finishedGoodItemId: true, quantity: true },
    }),
  ]);

  const sold = sliceByShift(
    hours.map((h) => ({ soldOn: h.soldOn, hour: h.hour, finishedGoodItemId: h.finishedGoodItemId, quantity: Number(h.quantity) })),
    shifts,
  ).filter((c) => c.businessDate === businessDate && c.shift === shift);
  const soldByItem = new Map(sold.map((c) => [c.finishedGoodItemId, c.quantity]));
  const openingByItem = opening ? new Map(opening.items.map((it) => [it.finishedGoodItemId, Number(it.quantity)])) : null;
  const closingByItem = closing ? new Map(closing.items.map((it) => [it.finishedGoodItemId, Number(it.quantity)])) : null;
  const runByItem = new Map((run?.items ?? []).map((it) => [it.finishedGoodItemId, it]));

  return items.map((item) => {
    const batchSize = item.batchSize == null ? 0 : Number(item.batchSize);
    const runItem = runByItem.get(item.id);
    const preparedQty = round3((runItem?.actualBatches ?? 0) * batchSize);
    // Món VẮNG trên phiếu đếm cũng là thiếu dữ liệu, không phải "đếm được 0". Coi là 0 thì toàn bộ
    // tồn đầu ca của món đó biến thành hao hụt — một con số hụt bịa ra từ một dòng bị bỏ quên.
    const openingQty = openingByItem?.has(item.id) ? openingByItem.get(item.id)! : null;
    const closingQty = closingByItem?.has(item.id) ? closingByItem.get(item.id)! : null;
    const soldQty = round3(soldByItem.get(item.id) ?? 0);

    let varianceQty: number | null = null;
    let note = "";
    if (openingQty == null && closingQty == null) note = "Thiếu số đếm ở cả đầu và cuối ca";
    else if (openingQty == null) note = "Thiếu số đếm đầu ca (phiếu đếm cuối ca trước không có, hoặc không có món này)";
    else if (closingQty == null) note = "Thiếu số đếm cuối ca này (chưa đếm, hoặc phiếu đếm không có món này)";
    else {
      varianceQty = round3(openingQty + preparedQty - soldQty - closingQty);
      note =
        varianceQty > 0
          ? `Hụt ${varianceQty} — đổ đi, rơi vãi hoặc bán không qua POS`
          : varianceQty < 0
            ? `Dư ${Math.abs(varianceQty)} — thường là pha thêm mà không ghi số mẻ, hoặc đếm sai`
            : "Khớp";
    }

    return {
      finishedGoodItemId: item.id,
      code: item.code,
      name: item.name,
      unitLabel: item.unit?.name ?? "-",
      openingQty,
      preparedQty,
      soldQty,
      closingQty,
      varianceQty,
      note,
    };
  });
}

export interface PrepCommitInput extends PrepPreviewInput {
  /** Số mẻ người pha chốt cho từng món. Bỏ món nào ra thì món đó không ghi. */
  items: { finishedGoodItemId: string; actualBatches: number }[];
}

/**
 * Chốt lượt chuẩn bị ca.
 *
 * Tính LẠI đề xuất ở server thay vì tin con số client gửi lên — cùng lý do với `/reorder-suggestions/commit`:
 * nhật ký phải ghi được hệ thống ĐÃ đề xuất gì, lấy theo client thì chỉ số sai lệch tự khớp về 0.
 */
export async function commitPrep(input: PrepCommitInput, actingUserId: string) {
  const suggestion = await suggestPrep(input);
  const byItem = new Map(suggestion.items.map((it) => [it.finishedGoodItemId, it]));
  const actualByItem = new Map(input.items.map((it) => [it.finishedGoodItemId, it.actualBatches]));

  const rows = [...actualByItem.entries()].map(([finishedGoodItemId, actualBatches]) => {
    const s = byItem.get(finishedGoodItemId);
    if (!s) throw new HttpError(400, "Có món không thuộc danh sách chuẩn bị ca");
    return {
      finishedGoodItemId,
      mode: s.mode,
      onHandQty: s.onHandQty,
      demandQty: s.demandQty,
      suggestedQty: s.suggestedQty,
      suggestedBatches: s.suggestedBatches,
      actualBatches,
    };
  });

  return prisma.$transaction(async (tx) => {
    const run = await tx.shiftPrepRun.upsert({
      where: {
        userId_businessDate_shift: {
          userId: input.userId,
          businessDate: parseBusinessDate(input.businessDate),
          shift: input.shift,
        },
      },
      create: {
        userId: input.userId,
        businessDate: parseBusinessDate(input.businessDate),
        shift: input.shift,
        createdById: actingUserId,
      },
      update: {},
    });
    // Ghi đè trọn lượt: chốt lại là sửa lại con số của ca đó, không phải cộng thêm một lượt nữa.
    await tx.shiftPrepRunItem.deleteMany({ where: { shiftPrepRunId: run.id } });
    await tx.shiftPrepRunItem.createMany({ data: rows.map((r) => ({ ...r, shiftPrepRunId: run.id })) });
    return tx.shiftPrepRun.findUniqueOrThrow({ where: { id: run.id }, include: { items: true } });
  });
}

export interface StockCountInput {
  userId: string;
  businessDate: string;
  shift: ShiftCode;
  countedAt?: Date;
  note?: string;
  items: { finishedGoodItemId: string; quantity: number }[];
}

/** Đếm tồn cuối ca. Đếm lại cùng một ca là SỬA, nên ghi đè trọn phiếu. */
export async function saveStockCount(input: StockCountInput, actingUserId: string) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.shiftStockCount.upsert({
      where: {
        userId_businessDate_shift: {
          userId: input.userId,
          businessDate: parseBusinessDate(input.businessDate),
          shift: input.shift,
        },
      },
      create: {
        userId: input.userId,
        businessDate: parseBusinessDate(input.businessDate),
        shift: input.shift,
        countedAt: input.countedAt ?? new Date(),
        note: input.note,
        createdById: actingUserId,
      },
      update: { countedAt: input.countedAt ?? new Date(), note: input.note },
    });
    await tx.shiftStockCountItem.deleteMany({ where: { shiftStockCountId: count.id } });
    await tx.shiftStockCountItem.createMany({
      data: input.items.map((it) => ({ ...it, shiftStockCountId: count.id })),
    });
    return tx.shiftStockCount.findUniqueOrThrow({ where: { id: count.id }, include: { items: true } });
  });
}
