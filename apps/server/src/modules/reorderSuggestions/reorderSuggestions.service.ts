import { prisma } from "../../config/db";
import { type DailyUsageSource, Prisma, type ReorderMode } from "../../generated/prisma/client";
import { formatNumber } from "../../utils/formatNumber";
import { WEEKDAY_LABELS, daysUntilNextOrderDay } from "../../utils/orderSchedule";
import type { ReorderPreviewInput } from "./reorderSuggestions.schemas";

/**
 * Cửa sổ suy mức dùng từ lịch sử nhận hàng khi quán chưa có phiếu Check Cost. 60 ngày là đánh đổi:
 * ngắn hơn thì một đợt đặt bù làm lệch hẳn, dài hơn thì không theo kịp quán đang lớn lên.
 */
const RECEIVED_WINDOW_DAYS = 60;

export interface DailyUsageInfo {
  /** Mức dùng mỗi ngày theo ĐƠN VỊ CHÍNH của hàng hoá. Null khi không đủ dữ liệu. */
  dailyUsage: number | null;
  source: DailyUsageSource;
  /** Câu giải thích nguồn, ghép thẳng vào reasons[] của dòng gợi ý. */
  detail: string;
}

/**
 * Hàng đã đặt nhưng chưa nhận. Phải trừ khỏi lượng cần đặt, nếu không agent sẽ đề xuất đặt lại đúng
 * lượng đó lần nữa — chuyện chắc chắn xảy ra khi thời gian chờ dài hơn nhịp gọi (cà phê chờ 4–5 ngày,
 * gọi 3–4 ngày một lần nên luôn có một đơn đang trên đường về).
 */
export interface InTransitInfo {
  quantity: number;
  /** Mã các đơn góp vào, để nói rõ trong `reasons[]` — con số tự nhiên nhỏ đi mà không giải thích sẽ bị cho là lỗi. */
  orderCodes: string[];
}

export interface SuggestionRow {
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  productGroupName: string;
  active: boolean;
  mode: ReorderMode;
  minQuantity: number | null;
  maxQuantity: number | null;
  fixedQuantity: number | null;
  coverDays: number | null;
  shelfLifeDays: number | null;
  leadDays: number | null;
  /** Hàng đã đặt chưa nhận, đã trừ vào `suggestedQty`. */
  inTransitQty: number;
  /** Null = quán chưa khai tồn cho hàng này. */
  onHandQty: number | null;
  dailyUsage: number | null;
  usageSource: DailyUsageSource;
  suggestedQty: number;
  /** Lý do ra con số đó, bằng tiếng Việt — người duyệt phải đọc được mà không cần hỏi ai. */
  reasons: string[];
}

/** Làm tròn về đúng độ chính xác của cột Decimal(18,3) để số hiển thị và số lưu không lệch nhau. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 1 đơn vị chính = bao nhiêu recipeUnit. Để trống nghĩa là công thức dùng thẳng đơn vị chính. */
function recipeFactor(recipeUnitsPerBaseUnit: unknown): number {
  const factor = Number(recipeUnitsPerBaseUnit ?? 0);
  return factor > 0 ? factor : 1;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

/**
 * Mức dùng mỗi ngày của từng hàng hoá, theo thứ tự tin cậy giảm dần:
 *
 *  1. `COST_CHECK` — `actualUsed` của phiếu Check Cost ACTIVE gần nhất. Đây là con số đã trừ huỷ và
 *     điều chuyển, tính từ hai phiếu kiểm kê thật, nên đáng tin nhất trong hệ thống.
 *  2. `RECEIVED` — suy từ SL đã nhận trong `RECEIVED_WINDOW_DAYS` ngày, cộng/trừ điều chuyển hai
 *     chiều. Chỉ đúng khi mức tồn dao động quanh một mức: nhận ≈ dùng.
 *  3. `NONE` — không đoán. COVERAGE sẽ không đề xuất và nói rõ lý do.
 *
 * Cố ý KHÔNG trộn hai nguồn với nhau: trộn xong thì không ai giải thích được con số ở đâu ra, mà
 * giải thích được là điều kiện để người duyệt tin.
 */
export async function getDailyUsage(userId: string, productIds: string[]): Promise<Map<string, DailyUsageInfo>> {
  const result = new Map<string, DailyUsageInfo>();
  if (productIds.length === 0) return result;

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, recipeUnitsPerBaseUnit: true },
  });
  const factorByProduct = new Map(products.map((p) => [p.id, recipeFactor(p.recipeUnitsPerBaseUnit)]));

  // ---- Nguồn 1: phiếu Check Cost gần nhất -------------------------------------------------
  const costCheck = await prisma.costCheck.findFirst({
    // Phiếu cũ có thể chưa có snapshot (nó chỉ được backfill khi ai đó mở chi tiết phiếu — xem
    // costChecks.routes.ts), nên phải lọc ngay trong truy vấn thay vì lấy phiếu mới nhất rồi bỏ cuộc
    // nếu nó rỗng. DbNull là null của chính cột Json, khác JsonNull là giá trị JSON `null`.
    where: { userId, status: "ACTIVE", reportSnapshot: { not: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    include: { openingStockCheck: true, closingStockCheck: true },
  });

  if (costCheck?.reportSnapshot) {
    const periodDays = daysBetween(costCheck.openingStockCheck.checkedAt, costCheck.closingStockCheck.checkedAt);
    // Kỳ 0 ngày (hoặc âm, nếu ai đó chọn hai phiếu ngược thứ tự) thì phép chia vô nghĩa — bỏ qua
    // nguồn này thay vì trả về Infinity.
    if (periodDays > 0) {
      const snapshot = costCheck.reportSnapshot as { rows?: { productId: string; actualUsed: number }[] };
      for (const row of snapshot.rows ?? []) {
        const factor = factorByProduct.get(row.productId);
        if (factor === undefined) continue;
        // actualUsed tính theo recipeUnit (vd gam) → chia factor để về đơn vị chính (vd hộp).
        // Âm nghĩa là số liệu kỳ đó có vấn đề (kiểm kê sai, thiếu phiếu nhận) — coi như 0 thay vì
        // để một con số âm chảy vào công thức đặt hàng.
        const perDay = Math.max(0, Number(row.actualUsed ?? 0) / factor) / periodDays;
        result.set(row.productId, {
          dailyUsage: perDay,
          source: "COST_CHECK",
          detail: `Mức dùng ${formatNumber(round3(perDay))}/ngày theo Check Cost ${costCheck.code}`,
        });
      }
    }
  }

  // ---- Nguồn 2: lịch sử nhận hàng ----------------------------------------------------------
  const missing = productIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    const since = new Date(Date.now() - RECEIVED_WINDOW_DAYS * 86_400_000);

    const [received, transferIn, transferOut] = await Promise.all([
      prisma.salesOrderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { in: missing },
          receivedAt: { gte: since },
          salesOrder: { createdById: userId },
        },
        _sum: { receivedQuantity: true },
      }),
      prisma.materialTransferItem.findMany({
        where: { productId: { in: missing }, materialTransfer: { toUserId: userId, transferAt: { gte: since } } },
        select: { productId: true, wholeQuantity: true, looseQuantity: true },
      }),
      prisma.materialTransferItem.findMany({
        where: { productId: { in: missing }, materialTransfer: { fromUserId: userId, transferAt: { gte: since } } },
        select: { productId: true, wholeQuantity: true, looseQuantity: true },
      }),
    ]);

    const receivedByProduct = new Map(received.map((r) => [r.productId, Number(r._sum.receivedQuantity ?? 0)]));

    // Điều chuyển ghi theo whole + loose trong recipeUnit (xem utils/tareWeight và cách
    // costChecks.service dùng toRecipeUnit) → quy về đơn vị chính để cộng được với SL đã nhận.
    const sumTransfers = (items: { productId: string; wholeQuantity: unknown; looseQuantity: unknown }[]) => {
      const byProduct = new Map<string, number>();
      for (const item of items) {
        const factor = factorByProduct.get(item.productId) ?? 1;
        const inRecipeUnit = Number(item.wholeQuantity ?? 0) * factor + Number(item.looseQuantity ?? 0);
        byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + inRecipeUnit / factor);
      }
      return byProduct;
    };
    const inByProduct = sumTransfers(transferIn);
    const outByProduct = sumTransfers(transferOut);

    for (const productId of missing) {
      const total =
        (receivedByProduct.get(productId) ?? 0) + (inByProduct.get(productId) ?? 0) - (outByProduct.get(productId) ?? 0);
      if (total <= 0) {
        result.set(productId, {
          dailyUsage: null,
          source: "NONE",
          detail: `Chưa có dữ liệu tiêu thụ trong ${RECEIVED_WINDOW_DAYS} ngày`,
        });
        continue;
      }
      const perDay = total / RECEIVED_WINDOW_DAYS;
      result.set(productId, {
        dailyUsage: perDay,
        source: "RECEIVED",
        detail: `Mức dùng ${formatNumber(round3(perDay))}/ngày suy từ SL đã nhận ${RECEIVED_WINDOW_DAYS} ngày`,
      });
    }
  }

  return result;
}

/**
 * Hàng đã đặt nhưng chưa nhận, theo từng hàng hoá.
 *
 * Tính cả đơn `DRAFT`: không tính thì chạy lại gợi ý ngay sau khi vừa tạo đơn sẽ đề xuất đặt thêm lần
 * nữa. **KHÔNG** tính phần thiếu của đơn `SHORT`: đơn `SHORT` vẫn nhận tiếp được, nhưng nó thường nghĩa
 * là kho không cấp đủ — coi phần thiếu là "đang về" rồi nó không về thật thì quán hết hàng, mà đặt thiếu
 * tệ hơn đặt thừa với hàng không hỏng. Đổi quyết định này chỉ là sửa danh sách trạng thái dưới đây.
 */
export async function getInTransit(userId: string, productIds: string[]): Promise<Map<string, InTransitInfo>> {
  const result = new Map<string, InTransitInfo>();
  if (productIds.length === 0) return result;

  const items = await prisma.salesOrderItem.findMany({
    where: {
      productId: { in: productIds },
      salesOrder: { createdById: userId, status: { in: ["DRAFT", "PENDING_CONFIRM", "CONFIRMED"] } },
    },
    select: {
      productId: true,
      quantity: true,
      receivedQuantity: true,
      salesOrder: { select: { code: true } },
    },
  });

  for (const item of items) {
    const remaining = Number(item.quantity) - Number(item.receivedQuantity ?? 0);
    // Nhận nhiều hơn đặt là chuyện hợp lệ trong luồng nhận hàng, nên phần còn lại có thể âm — kẹp về 0
    // thay vì để nó cộng ngược làm tăng lượng cần đặt.
    if (remaining <= 0) continue;
    const current = result.get(item.productId) ?? { quantity: 0, orderCodes: [] };
    current.quantity += remaining;
    if (!current.orderCodes.includes(item.salesOrder.code)) current.orderCodes.push(item.salesOrder.code);
    result.set(item.productId, current);
  }
  return result;
}

/**
 * Tính SL cần đặt cho từng hàng hoá đã được thiết lập định lượng của một quán.
 *
 * Chỉ trả về hàng hoá có dòng `ProductReorderThreshold` — giống hệt phạm vi của trang Order nhanh
 * hiện tại, để bật chức năng này không làm danh sách của quán phình ra.
 */
export async function buildSuggestions(input: ReorderPreviewInput & { userId: string }): Promise<SuggestionRow[]> {
  const thresholds = await prisma.productReorderThreshold.findMany({
    where: { userId: input.userId },
    include: { product: { include: { unit: true, productGroup: true } } },
  });
  if (thresholds.length === 0) return [];

  const productIds = thresholds.map((t) => t.productId);
  const onHandByProduct = new Map(input.onHand.map((it) => [it.productId, it.quantity]));
  const [usageByProduct, inTransitByProduct, orderScheduleDays] = await Promise.all([
    getDailyUsage(input.userId, productIds),
    getInTransit(input.userId, productIds),
    prisma.orderScheduleDay.findMany({ select: { weekday: true } }),
  ]);

  // Số ngày một đơn phải phủ = khoảng cách tới ngày gọi kế tiếp. Không phụ thuộc thời gian chờ hàng
  // (lô này về D + chờ, lô sau về D' + chờ — chờ triệt tiêu), nên tính được một lần cho mọi hàng hoá.
  const orderWeekdays = orderScheduleDays.map((d) => d.weekday);
  const scheduleDays = daysUntilNextOrderDay(new Date(), orderWeekdays);
  const scheduleNote =
    scheduleDays == null
      ? null
      : `Phủ ${scheduleDays} ngày tới lần gọi kế tiếp (lịch gọi: ${orderWeekdays
          .slice()
          .sort((a, b) => a - b)
          .map((w) => WEEKDAY_LABELS[w])
          .join(", ")})`;

  const rows = thresholds.map((threshold) => {
    const product = threshold.product;
    const usage = usageByProduct.get(threshold.productId) ?? {
      dailyUsage: null,
      source: "NONE" as DailyUsageSource,
      detail: "Chưa có dữ liệu tiêu thụ",
    };
    const onHandQty = onHandByProduct.get(threshold.productId) ?? null;

    const min = threshold.minQuantity == null ? null : Number(threshold.minQuantity);
    const max = threshold.maxQuantity == null ? null : Number(threshold.maxQuantity);
    const fixed = threshold.fixedQuantity == null ? null : Number(threshold.fixedQuantity);

    const row: SuggestionRow = {
      productId: threshold.productId,
      code: product.code,
      name: product.name,
      unitLabel: product.unit?.name ?? "-",
      productGroupName: product.productGroup?.name ?? "Chưa phân nhóm",
      active: product.active,
      mode: threshold.mode,
      minQuantity: min,
      maxQuantity: max,
      fixedQuantity: fixed,
      coverDays: threshold.coverDays,
      shelfLifeDays: product.shelfLifeDays,
      leadDays: product.leadDays,
      inTransitQty: inTransitByProduct.get(threshold.productId)?.quantity ?? 0,
      onHandQty,
      dailyUsage: usage.dailyUsage,
      usageSource: usage.source,
      suggestedQty: 0,
      reasons: [],
    };

    // Hàng đã ngừng dùng vẫn hiện (để quán thấy mà gỡ khỏi định lượng) nhưng không bao giờ đề xuất.
    if (!product.active) {
      row.reasons.push("Hàng hoá đã ngừng dùng — không đề xuất");
      return row;
    }

    // Chỉ COVERAGE trừ hàng đang về. THRESHOLD và FIXED cố ý KHÔNG trừ: hai chế độ đó định nghĩa là
    // "đặt đúng lượng này", đổi số của chúng là đổi thói quen đặt hàng của mọi quán mà không ai yêu cầu.
    // Nhưng vẫn nói ra để người duyệt tự quyết có nên sửa cột SL đặt hay không.
    const inTransitNote = inTransitByProduct.get(threshold.productId);
    if (inTransitNote && threshold.mode !== "COVERAGE") {
      row.reasons.push(
        `Đang có ${formatNumber(inTransitNote.quantity)} đã đặt chưa nhận (${inTransitNote.orderCodes.join(", ")}) — chế độ này không tự trừ`,
      );
    }

    switch (threshold.mode) {
      case "OFF":
        row.reasons.push("Đang tắt đề xuất cho hàng hoá này");
        return row;

      // Không nhìn tồn là CHỦ Ý: hàng gọi cố định thì kỳ nào cũng gọi đúng lượng đó, và nhờ vậy nó
      // hiện sẵn ngay cả khi quán chưa kịp đếm tồn.
      case "FIXED": {
        if (fixed == null || fixed <= 0) {
          row.reasons.push("Chưa khai SL gọi cố định");
          return row;
        }
        row.suggestedQty = round3(fixed);
        row.reasons.push(`Gọi cố định ${formatNumber(fixed)} ${row.unitLabel}`);
        return row;
      }

      case "THRESHOLD": {
        if (min == null || max == null) {
          row.reasons.push("Chưa khai định lượng tối thiểu / tối đa");
          return row;
        }
        if (onHandQty == null) {
          row.reasons.push("Chưa nhập tồn hiện tại");
          return row;
        }
        if (onHandQty >= min) {
          row.reasons.push(`Tồn ${formatNumber(onHandQty)} ≥ tối thiểu ${formatNumber(min)} — chưa cần đặt`);
          return row;
        }
        // Lượng cố định max − min, KHÔNG bù theo tồn thực. Giữ đúng công thức của Order nhanh đang
        // chạy (xem chú thích ở apps/web/.../orders/quick/page.tsx) — đổi ở đây là đổi thói quen đặt
        // hàng của mọi quán mà không ai yêu cầu.
        row.suggestedQty = round3(max - min);
        row.reasons.push(`Tồn ${formatNumber(onHandQty)} < tối thiểu ${formatNumber(min)}`);
        row.reasons.push(`Đặt bù cố định tối đa − tối thiểu = ${formatNumber(round3(max - min))}`);
        return row;
      }

      case "COVERAGE": {
        // Ưu tiên: khai riêng cho hàng hoá → số người dùng gõ trên trang → số tự tính từ lịch gọi.
        // Lịch gọi đứng cuối nhưng là đường chạy thường ngày: hai kỳ trong tuần dài khác nhau (CN→T5 là
        // 4 ngày, T5→CN là 3) nên khai cứng một con số theo hàng hoá sẽ sai một trong hai kỳ.
        const requestedDays = threshold.coverDays ?? input.coverDays ?? scheduleDays;
        if (requestedDays == null) {
          row.reasons.push("Chưa khai lịch gọi đồ và cũng chưa khai số ngày cần phủ");
          return row;
        }
        if (onHandQty == null) {
          row.reasons.push("Chưa nhập tồn hiện tại");
          return row;
        }
        if (usage.dailyUsage == null) {
          // Không đoán: một con số đoán trông y hệt con số thật, và đó là cách nhanh nhất để mất
          // lòng tin vào toàn bộ phần gợi ý.
          row.reasons.push(usage.detail);
          row.reasons.push("Không đủ dữ liệu để tính theo số ngày dùng");
          return row;
        }

        // Kẹp theo hạn dùng: đặt đủ 7 ngày nhưng hàng chỉ để được 3 thì phần thừa là để đổ đi.
        const effectiveDays =
          product.shelfLifeDays != null ? Math.min(requestedDays, product.shelfLifeDays) : requestedDays;
        // Chờ hàng theo TỪNG HÀNG HOÁ: lượng tiêu thụ từ lúc đặt tới lúc hàng về phải lấy từ tồn đang
        // có, nên cũng phải mua. Cà phê chờ 5 ngày thì mỗi đơn phải cõng thêm 5 ngày tiêu thụ.
        const leadDays = product.leadDays ?? 0;
        const totalDays = effectiveDays + leadDays;
        const inTransit = inTransitByProduct.get(threshold.productId);
        const need = usage.dailyUsage * totalDays - onHandQty - (inTransit?.quantity ?? 0);

        row.reasons.push(usage.detail);
        if (threshold.coverDays == null && input.coverDays == null && scheduleNote) row.reasons.push(scheduleNote);
        if (product.shelfLifeDays != null && effectiveDays < requestedDays) {
          row.reasons.push(`Kẹp còn ${effectiveDays} ngày vì hàng chỉ dùng được ${product.shelfLifeDays} ngày`);
        }
        row.reasons.push(
          leadDays > 0
            ? `Cần phủ ${effectiveDays} ngày + ${leadDays} ngày chờ hàng = ${totalDays} ngày, trừ tồn ${formatNumber(onHandQty)}`
            : `Cần phủ ${effectiveDays} ngày, trừ tồn ${formatNumber(onHandQty)}`,
        );
        if (inTransit) {
          row.reasons.push(
            `Trừ ${formatNumber(inTransit.quantity)} đã đặt chưa nhận (${inTransit.orderCodes.join(", ")})`,
          );
        }
        if (need <= 0) {
          row.reasons.push(inTransit ? "Tồn cộng hàng đang về đã đủ — chưa cần đặt" : "Tồn đã đủ — chưa cần đặt");
          return row;
        }
        row.suggestedQty = round3(need);
        return row;
      }
    }
  });

  return rows.sort(
    (a, b) => a.productGroupName.localeCompare(b.productGroupName) || a.name.localeCompare(b.name),
  );
}

export interface OrderScheduleInfo {
  /** 1 = Thứ 2 … 7 = Chủ nhật. Rỗng nghĩa là chưa khai lịch. */
  orderWeekdays: number[];
  /** Số ngày tới lần gọi kế tiếp, null khi chưa khai lịch. */
  daysUntilNextOrder: number | null;
}

/**
 * Lịch gọi và số ngày phủ tự tính, trả kèm `preview` để giao diện hiện đúng con số server đã dùng.
 *
 * Cố ý KHÔNG để web tự tính: web tính thì có hai bản cùng logic, và bản của web dùng giờ máy người dùng
 * chứ không phải hằng UTC+7 — tối Chủ nhật ở VN có thể thành Thứ 2 nếu máy đặt sai múi giờ.
 */
export async function getOrderScheduleInfo(now: Date = new Date()): Promise<OrderScheduleInfo> {
  const days = await prisma.orderScheduleDay.findMany({ select: { weekday: true }, orderBy: { weekday: "asc" } });
  const orderWeekdays = days.map((d) => d.weekday);
  return { orderWeekdays, daysUntilNextOrder: daysUntilNextOrderDay(now, orderWeekdays) };
}
