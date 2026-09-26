import { prisma } from "../config/db";

/**
 * TỒN QUÁN KHAI GẦN NHẤT cho từng (quán × hàng hoá) — chỗ duy nhất trong dự án trả lời câu hỏi này.
 *
 * Hai nguồn, lấy bản MỚI HƠN chứ không ưu tiên cứng một nguồn:
 *   - `ReorderRunItem.onHandQty` — quán gõ lúc chạy gợi ý đặt hàng.
 *   - `StockCheckItem` của phiếu kiểm kê quán.
 *
 * Vì sao không ưu tiên cứng lượt gợi ý: một lượt từ tháng trước kém tin hơn phiếu kiểm hôm qua. Vì sao
 * không ưu tiên cứng phiếu kiểm: quán chạy Order nhanh mỗi lần gọi đồ, dày hơn nhịp kiểm tuần.
 *
 * Luôn trả kèm `at` để bên gọi hiện được số đó CŨ BAO NHIÊU. Một con số tồn ba tuần trước trông y hệt
 * một con số hôm nay, và mọi kết luận dựng trên nó ("còn đủ 20 ngày") sẽ vô nghĩa mà không ai biết.
 */

export interface DeclaredStock {
  quantity: number;
  at: Date;
  source: "REORDER_RUN" | "STOCK_CHECK";
}

/** Khoá của map trả về: `${userId}|${productId}`. */
export function declaredStockKey(userId: string, productId: string): string {
  return `${userId}|${productId}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 1 đơn vị chính = bao nhiêu recipeUnit. Để trống nghĩa là công thức dùng thẳng đơn vị chính. */
function recipeFactor(recipeUnitsPerBaseUnit: unknown): number {
  const factor = Number(recipeUnitsPerBaseUnit ?? 0);
  return factor > 0 ? factor : 1;
}

export async function getLatestDeclaredStock(
  userIds: string[],
  productIds: string[],
): Promise<Map<string, DeclaredStock>> {
  const result = new Map<string, DeclaredStock>();
  if (userIds.length === 0 || productIds.length === 0) return result;

  const [runItems, checkItems, products] = await Promise.all([
    prisma.reorderRunItem.findMany({
      where: { productId: { in: productIds }, reorderRun: { userId: { in: userIds } } },
      select: { productId: true, onHandQty: true, reorderRun: { select: { userId: true, createdAt: true } } },
      orderBy: { reorderRun: { createdAt: "desc" } },
    }),
    prisma.stockCheckItem.findMany({
      where: { productId: { in: productIds }, stockCheck: { createdById: { in: userIds } } },
      select: {
        productId: true,
        wholeQuantity: true,
        looseQuantity: true,
        stockCheck: { select: { createdById: true, checkedAt: true } },
      },
      orderBy: { stockCheck: { checkedAt: "desc" } },
    }),
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, recipeUnitsPerBaseUnit: true } }),
  ]);

  const factorById = new Map(products.map((p) => [p.id, recipeFactor(p.recipeUnitsPerBaseUnit)]));

  // Đã orderBy desc nên chỉ nhận giá trị ĐẦU TIÊN gặp được cho mỗi khoá.
  const latestRun = new Map<string, DeclaredStock>();
  for (const it of runItems) {
    const key = declaredStockKey(it.reorderRun.userId, it.productId);
    if (!latestRun.has(key)) {
      latestRun.set(key, { quantity: round3(Number(it.onHandQty)), at: it.reorderRun.createdAt, source: "REORDER_RUN" });
    }
  }

  const latestCheck = new Map<string, DeclaredStock>();
  for (const it of checkItems) {
    const key = declaredStockKey(it.stockCheck.createdById!, it.productId);
    if (latestCheck.has(key)) continue;
    // looseQuantity theo đơn vị công thức và ĐÃ trừ vỏ lúc lưu (utils/tareWeight), nên chỉ cần quy đổi.
    const factor = factorById.get(it.productId) ?? 1;
    const quantity = Number(it.wholeQuantity ?? 0) + Number(it.looseQuantity ?? 0) / factor;
    latestCheck.set(key, { quantity: round3(quantity), at: it.stockCheck.checkedAt, source: "STOCK_CHECK" });
  }

  for (const userId of userIds) {
    for (const productId of productIds) {
      const key = declaredStockKey(userId, productId);
      const run = latestRun.get(key);
      const check = latestCheck.get(key);
      const pick = run && check ? (run.at.getTime() >= check.at.getTime() ? run : check) : (run ?? check);
      if (pick) result.set(key, pick);
    }
  }
  return result;
}
