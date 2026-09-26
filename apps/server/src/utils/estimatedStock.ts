import { prisma } from "../config/db";
import { declaredStockKey, getLatestDeclaredStock } from "./declaredStock";

/**
 * TỒN NGUYÊN LIỆU ƯỚC TÍNH của một quán tại thời điểm bây giờ.
 *
 *   tồn = tồn khai gần nhất
 *       + Σ SalesOrderItem.receivedQuantity   (hàng đã nhận về sau mốc khai)
 *       − Σ PosSaleHour × FinishedGoodRecipeItem.quantityPerUnit   (đã bán, quy qua công thức)
 *       − Σ MaterialWasteItem                  (đã huỷ)
 *       ∓ Σ MaterialTransferItem               (điều chuyển đi / về)
 *
 * Dùng để ĐIỀN SẴN cột tồn ở Order nhanh (quán chỉ sửa chỗ lệch) và để cảnh báo sắp hết giữa kỳ.
 *
 * **Phiếu kiểm kê tuần vẫn phải giữ** — không phải để biết tồn, mà để kéo sai số tích luỹ về 0 mỗi tuần.
 * Sai số còn lại đến từ BOM lệch thực tế pha chế, rơi vãi không vào phiếu huỷ, và thất thoát.
 *
 * **Mọi con số ở đây là ƯỚC TÍNH và phải được hiện ra là ước tính.** Một con số đoán trông y hệt một con
 * số thật; đó là lý do mỗi dòng mang theo `reasons[]`, số ca thiếu doanh số và số ngày thiếu phiếu huỷ.
 */

export interface EstimatedStockRow {
  productId: string;
  /** Tồn ước tính, đã kẹp không âm. */
  quantity: number;
  /** Mốc khai mà phép tính neo vào. Null = quán chưa từng khai tồn hàng này. */
  anchorAt: Date | null;
  anchorQty: number | null;
  anchorSource: "REORDER_RUN" | "STOCK_CHECK" | "NONE";
  /** Số ngày kể từ mốc khai — sai số tích luỹ theo số này. */
  anchorAgeDays: number | null;
  receivedQty: number;
  soldQty: number;
  wasteQty: number;
  /** Dương = nhận về, âm = chuyển đi. */
  transferQty: number;
  /** Phần huỷ BÙ cho những ngày không có phiếu (mức huỷ bình quân của chính quán đó). */
  wasteFilledQty: number;
  /** Số ngày trong khoảng không có phiếu huỷ nào. */
  daysWithoutWaste: number;
  reasons: string[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface EstimatedStockInput {
  userId: string;
  productIds: string[];
  now?: Date;
}

export async function getEstimatedOnHand(input: EstimatedStockInput): Promise<Map<string, EstimatedStockRow>> {
  const now = input.now ?? new Date();
  const result = new Map<string, EstimatedStockRow>();
  if (input.productIds.length === 0) return result;

  const declared = await getLatestDeclaredStock([input.userId], input.productIds);

  // Mốc sớm nhất trong các mốc khai — chỉ cần nạp chuyển động từ đó trở đi.
  const anchors = input.productIds
    .map((productId) => declared.get(declaredStockKey(input.userId, productId)))
    .filter((a): a is NonNullable<typeof a> => a != null);
  if (anchors.length === 0) {
    for (const productId of input.productIds) {
      result.set(productId, {
        productId,
        quantity: 0,
        anchorAt: null,
        anchorQty: null,
        anchorSource: "NONE",
        anchorAgeDays: null,
        receivedQty: 0,
        soldQty: 0,
        wasteQty: 0,
        transferQty: 0,
        wasteFilledQty: 0,
        daysWithoutWaste: 0,
        reasons: ["Quán chưa từng khai tồn hàng này — không có mốc nào để tính từ đó"],
      });
    }
    return result;
  }
  const earliest = new Date(Math.min(...anchors.map((a) => a.at.getTime())));

  const [received, hours, recipes, wasteItems, wasteHeaders, transfersOut, transfersIn, products] = await Promise.all([
    prisma.salesOrderItem.findMany({
      where: {
        productId: { in: input.productIds },
        receivedAt: { gte: earliest, lte: now },
        salesOrder: { createdById: input.userId },
      },
      select: { productId: true, receivedQuantity: true, receivedAt: true },
    }),
    prisma.posSaleHour.findMany({
      where: { userId: input.userId, soldOn: { gte: earliest } },
      select: { soldOn: true, finishedGoodItemId: true, quantity: true },
    }),
    prisma.finishedGoodRecipeItem.findMany({
      where: { productId: { in: input.productIds } },
      select: { finishedGoodItemId: true, productId: true, quantityPerUnit: true },
    }),
    prisma.materialWasteItem.findMany({
      where: { productId: { in: input.productIds }, materialWaste: { createdById: input.userId, wasteAt: { gte: earliest, lte: now } } },
      select: {
        productId: true,
        wholeQuantity: true,
        looseQuantity: true,
        materialWaste: { select: { wasteAt: true } },
      },
    }),
    // Ngày NÀO quán có ghi phiếu huỷ — mẫu số của mức huỷ bình quân.
    prisma.materialWaste.findMany({
      where: { createdById: input.userId, wasteAt: { gte: earliest, lte: now } },
      select: { wasteAt: true },
    }),
    prisma.materialTransferItem.findMany({
      where: { productId: { in: input.productIds }, materialTransfer: { fromUserId: input.userId, transferAt: { gte: earliest, lte: now } } },
      select: { productId: true, wholeQuantity: true, looseQuantity: true, materialTransfer: { select: { transferAt: true } } },
    }),
    prisma.materialTransferItem.findMany({
      where: { productId: { in: input.productIds }, materialTransfer: { toUserId: input.userId, transferAt: { gte: earliest, lte: now } } },
      select: { productId: true, wholeQuantity: true, looseQuantity: true, materialTransfer: { select: { transferAt: true } } },
    }),
    prisma.product.findMany({
      where: { id: { in: input.productIds } },
      select: { id: true, code: true, name: true, recipeUnitsPerBaseUnit: true },
    }),
  ]);

  const factorById = new Map(
    products.map((p) => {
      const f = Number(p.recipeUnitsPerBaseUnit ?? 0);
      return [p.id, f > 0 ? f : 1];
    }),
  );

  // SL lẻ ở phiếu huỷ / điều chuyển tính theo đơn vị CÔNG THỨC và đã trừ vỏ lúc lưu (utils/tareWeight),
  // nên quy về đơn vị chính chỉ là chia hệ số.
  const toBase = (productId: string, whole: unknown, loose: unknown) =>
    Number(whole ?? 0) + Number(loose ?? 0) / (factorById.get(productId) ?? 1);

  // Nguyên liệu tiêu hao theo doanh số: SL món × định lượng BOM (BOM tính theo đơn vị công thức).
  const recipeByItem = new Map<string, { productId: string; perUnit: number }[]>();
  for (const r of recipes) {
    const list = recipeByItem.get(r.finishedGoodItemId) ?? [];
    list.push({ productId: r.productId, perUnit: Number(r.quantityPerUnit) });
    recipeByItem.set(r.finishedGoodItemId, list);
  }

  const wasteDayKeys = new Set(wasteHeaders.map((w) => dayKey(w.wasteAt)));

  for (const productId of input.productIds) {
    const anchor = declared.get(declaredStockKey(input.userId, productId));
    const reasons: string[] = [];
    if (!anchor) {
      result.set(productId, {
        productId,
        quantity: 0,
        anchorAt: null,
        anchorQty: null,
        anchorSource: "NONE",
        anchorAgeDays: null,
        receivedQty: 0,
        soldQty: 0,
        wasteQty: 0,
        transferQty: 0,
        wasteFilledQty: 0,
        daysWithoutWaste: 0,
        reasons: ["Quán chưa từng khai tồn hàng này — không có mốc nào để tính từ đó"],
      });
      continue;
    }

    const after = (at: Date) => at.getTime() > anchor.at.getTime();

    const receivedQty = round3(
      received.filter((r) => r.productId === productId && r.receivedAt && after(r.receivedAt)).reduce((sum, r) => sum + Number(r.receivedQuantity ?? 0), 0),
    );

    let soldRecipeUnits = 0;
    for (const h of hours) {
      if (!after(h.soldOn)) continue;
      for (const line of recipeByItem.get(h.finishedGoodItemId) ?? []) {
        if (line.productId !== productId) continue;
        soldRecipeUnits += Number(h.quantity) * line.perUnit;
      }
    }
    const soldQty = round3(soldRecipeUnits / (factorById.get(productId) ?? 1));

    const wasteRows = wasteItems.filter((w) => w.productId === productId && after(w.materialWaste.wasteAt));
    const wasteQty = round3(wasteRows.reduce((sum, w) => sum + toBase(productId, w.wholeQuantity, w.looseQuantity), 0));

    const outQty = transfersOut
      .filter((t) => t.productId === productId && after(t.materialTransfer.transferAt))
      .reduce((sum, t) => sum + toBase(productId, t.wholeQuantity, t.looseQuantity), 0);
    const inQty = transfersIn
      .filter((t) => t.productId === productId && after(t.materialTransfer.transferAt))
      .reduce((sum, t) => sum + toBase(productId, t.wholeQuantity, t.looseQuantity), 0);
    const transferQty = round3(inQty - outQty);

    // --- Bù phiếu huỷ thiếu ---
    //
    // Coi huỷ bằng 0 là lệch MỘT CHIỀU và tích luỹ: tồn ước tính luôn cao hơn thực tế → đặt thiếu →
    // quán hết hàng. Nên bù bằng mức huỷ bình quân của CHÍNH QUÁN ĐÓ, lấy trên những ngày CÓ ghi huỷ.
    //
    // Cách này hơi cao hơn thực tế nếu ngày đó thật sự không huỷ gì — nhưng đặt thừa nhẹ hơn hết hàng,
    // nên lệch về phía đó là cố ý. Quán chưa từng ghi huỷ thì bình quân bằng 0, tức tự về quy tắc đơn giản.
    const totalDays = Math.max(0, Math.floor((now.getTime() - anchor.at.getTime()) / 86_400_000));
    const daysWithWaste = new Set<string>();
    for (const key of wasteDayKeys) {
      if (new Date(`${key}T12:00:00.000Z`).getTime() > anchor.at.getTime()) daysWithWaste.add(key);
    }
    const daysWithoutWaste = Math.max(0, totalDays - daysWithWaste.size);
    const avgWastePerDay = daysWithWaste.size > 0 ? wasteQty / daysWithWaste.size : 0;
    // KẸP phần bù không vượt quá lượng huỷ ĐÃ GHI.
    //
    // Không kẹp thì "bình quân trên những ngày có ghi huỷ" thành vô lý khi quán ít ghi: dữ liệu thật có
    // hàng tồn khai 1, đúng MỘT phiếu huỷ 2 trong 68 ngày → bình quân 2/ngày × 67 ngày = bù 134, đủ xoá
    // sạch tồn và bắt đặt lại hàng không cần. Với d ngày có ghi trên D ngày, W/d chỉ là mức hợp lý khi
    // việc ghi huỷ là THÓI QUEN hằng ngày; d/D càng nhỏ thì càng có khả năng quán thật sự không huỷ gì.
    //
    // Kẹp ở mức W nghĩa là: cho phép giả định lượng huỷ chưa ghi nhiều nhất bằng lượng đã ghi (tức tổng
    // huỷ tối đa gấp đôi). Vẫn lệch về phía "tồn thấp hơn" như chủ ý ban đầu — đặt thừa nhẹ hơn hết hàng
    // — nhưng không còn bịa ra một con số lớn hơn cả tồn.
    const wasteFillRaw = avgWastePerDay * daysWithoutWaste;
    const wasteFilledQty = round3(Math.min(wasteFillRaw, wasteQty));
    const wasteFillCapped = wasteFillRaw > wasteQty + 0.001;

    const quantity = round3(
      Math.max(0, anchor.quantity + receivedQty - soldQty - wasteQty - wasteFilledQty + transferQty),
    );
    const ageDays = Math.floor((now.getTime() - anchor.at.getTime()) / 86_400_000);

    reasons.push(
      `Neo vào tồn khai ${anchor.quantity} ngày ${dayKey(anchor.at)} (${anchor.source === "REORDER_RUN" ? "Order nhanh" : "phiếu kiểm kê"}), cách đây ${ageDays} ngày`,
    );
    if (receivedQty > 0) reasons.push(`Cộng ${receivedQty} đã nhận`);
    if (soldQty > 0) reasons.push(`Trừ ${soldQty} tiêu hao theo doanh số POS × công thức`);
    else reasons.push("Chưa có doanh số POS nào sau mốc khai — phần tiêu hao đang tính là 0, con số này sẽ cao hơn thực tế");
    if (wasteQty > 0) reasons.push(`Trừ ${wasteQty} đã huỷ theo phiếu`);
    if (transferQty !== 0) reasons.push(`${transferQty > 0 ? "Cộng" : "Trừ"} ${Math.abs(transferQty)} điều chuyển`);
    if (wasteFilledQty > 0) {
      reasons.push(
        wasteFillCapped
          ? `Trừ thêm ${wasteFilledQty} huỷ BÙ cho ${daysWithoutWaste} ngày không có phiếu — đã KẸP bằng lượng đã ghi (${wasteQty}) vì quán chỉ ghi huỷ ${daysWithWaste.size}/${totalDays} ngày, bình quân ${round3(avgWastePerDay)}/ngày không đáng tin`
          : `Trừ thêm ${wasteFilledQty} huỷ BÙ cho ${daysWithoutWaste} ngày không có phiếu (bình quân ${round3(avgWastePerDay)}/ngày của quán này)`,
      );
    } else if (daysWithoutWaste > 0) {
      reasons.push(`${daysWithoutWaste} ngày không có phiếu huỷ và quán chưa từng ghi huỷ hàng này — đang tính huỷ 0`);
    }
    reasons.push("Đây là số ƯỚC TÍNH, sai số tích luỹ từ mốc khai — phiếu kiểm kê tuần là chỗ kéo nó về 0");

    result.set(productId, {
      productId,
      quantity,
      anchorAt: anchor.at,
      anchorQty: anchor.quantity,
      anchorSource: anchor.source,
      anchorAgeDays: ageDays,
      receivedQty,
      soldQty,
      wasteQty,
      transferQty,
      wasteFilledQty,
      daysWithoutWaste,
      reasons,
    });
  }

  return result;
}
