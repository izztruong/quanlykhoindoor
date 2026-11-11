import { prisma } from "../config/db";
import type { FinishedGoodCategory } from "../generated/prisma/client";
import { vnDayStartMs } from "./vnTime";

interface Milestone {
  /** true = mốc RIÊNG của quán đang hỏi; false = mốc chung. Chỉ dùng lúc trộn ở mergeTimeline. */
  own: boolean;
  /** 00:00 giờ VN của `effectiveFrom`, quy ra mốc UTC thật. */
  fromMs: number;
  sellingPrice: number;
}

interface ItemPrices {
  category: FinishedGoodCategory | null;
  /** Giảm dần theo `fromMs` — phân giải là mốc đầu tiên thoả. */
  milestones: Milestone[];
  /** Giá hiện hành trên danh mục, dùng khi không mốc nào phủ được thời điểm cần tra. */
  fallback: number;
}

/**
 * Trộn mốc RIÊNG của quán với mốc CHUNG thành một dòng thời gian duy nhất, vẫn giảm dần theo `fromMs`.
 *
 * Luật: **thay cả dòng thời gian, có đắp bù phần trước mốc riêng đầu tiên.** Từ mốc riêng đầu tiên
 * trở đi quán đi theo đường riêng và KHÔNG tự nhận mốc chung mới nữa; phần trước đó vẫn dùng mốc chung.
 *
 * Hai luật ngây thơ đều sai, và sai tốn kém:
 * - *Trộn theo từng mốc* (lấy mốc mới nhất ≤ t của cả hai): quán khai riêng từ 1/3, sau đó giá CHUNG
 *   đổi ngày 1/6 → quán MẤT LẶNG LẼ giá riêng của mình.
 * - *Thay hẳn* (có mốc riêng thì bỏ hết mốc chung): trước 1/3 quán không còn mốc nào → doanh thu rơi
 *   về `fallback` và mọi Check Cost kỳ trước lệch toàn bộ.
 *
 * Vì danh sách ghép vẫn giảm dần, toàn bộ phép phân giải cũ dùng lại được nguyên vẹn.
 */
function mergeTimeline<T extends { fromMs: number; own: boolean }>(rows: T[]): T[] {
  const ownRows = rows.filter((r) => r.own);
  if (ownRows.length === 0) return rows.filter((r) => !r.own);
  const earliestOwnMs = Math.min(...ownRows.map((r) => r.fromMs));
  return [...ownRows, ...rows.filter((r) => !r.own && r.fromMs < earliestOwnMs)];
}

/**
 * Lịch sử giá bán của một TẬP đồ thành phẩm, nạp bằng một query rồi phân giải trong memory — cùng khuôn
 * và cùng lý do như `RecipeHistory` (xem `recipeVersions.ts`).
 *
 * Doanh thu Check Cost tra giá theo từng ô giờ POS, nên không thể query từng lượt.
 */
export class PriceHistory {
  private readonly dayCache = new Map<string, number>();

  private constructor(private readonly byItem: Map<string, ItemPrices>) {}

  /**
   * `shopUserId` = phân giải theo giá RIÊNG của quán đó, lùi về giá CHUNG ở phần trước mốc riêng đầu
   * tiên. Bỏ trống = chỉ dùng giá chung.
   *
   * Quán gắn ở `load`, không phải ở từng lời gọi — nhờ vậy `priceAt`/`priceOnDay`/`category`/
   * `itemsWithoutMilestone` không đổi một chữ nào, cả tính năng gói trong hàm này.
   */
  static async load(finishedGoodItemIds: Iterable<string>, shopUserId?: string | null): Promise<PriceHistory> {
    const ids = [...new Set(finishedGoodItemIds)];
    if (ids.length === 0) return new PriceHistory(new Map());

    const items = await prisma.finishedGoodItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        category: true,
        sellingPrice: true,
        prices: {
          // Lấy cả mốc chung lẫn mốc của đúng quán này trong một query; phân giải ở dưới.
          where: shopUserId ? { OR: [{ shopUserId: null }, { shopUserId }] } : { shopUserId: null },
          select: { effectiveFrom: true, sellingPrice: true, shopUserId: true },
          orderBy: { effectiveFrom: "desc" },
        },
      },
    });

    const byItem = new Map<string, ItemPrices>(
      items.map((item) => [
        item.id,
        {
          category: item.category,
          milestones: mergeTimeline(
            item.prices.map((p) => ({
              fromMs: vnDayStartMs(p.effectiveFrom),
              sellingPrice: Number(p.sellingPrice),
              own: p.shopUserId != null,
            })),
          ),
          fallback: Number(item.sellingPrice ?? 0),
        },
      ]),
    );
    return new PriceHistory(byItem);
  }

  category(itemId: string): FinishedGoodCategory | null {
    return this.byItem.get(itemId)?.category ?? null;
  }

  /**
   * Giá bán có hiệu lực tại mốc đó. Không mốc nào phủ được (món khai giá sau thời điểm cần tra) thì
   * lùi về giá hiện hành trên danh mục — khác `RecipeHistory` cố ý trả 0, vì ở đây trả 0 sẽ làm doanh
   * thu biến mất và doanh thu là mẫu số của mọi tỷ lệ % trong Check Cost.
   */
  priceAt(itemId: string, atMs: number): number {
    const entry = this.byItem.get(itemId);
    if (!entry) return 0;
    for (const m of entry.milestones) if (m.fromMs <= atMs) return m.sellingPrice;
    return entry.fallback;
  }

  /** Bản có đệm cho ô giờ POS: mốc giá mịn theo NGÀY nên mọi ô giờ cùng ngày ra cùng một giá. */
  priceOnDay(itemId: string, dayKey: string, dayStartMs: number): number {
    const key = `${itemId}|${dayKey}`;
    const cached = this.dayCache.get(key);
    if (cached !== undefined) return cached;
    const price = this.priceAt(itemId, dayStartMs);
    this.dayCache.set(key, price);
    return price;
  }

  /** Món không có mốc giá nào ≤ mốc bán — doanh thu đang dùng giá hiện hành, nên cảnh báo. */
  itemsWithoutMilestone(itemIds: Iterable<string>, atMs: number): string[] {
    const out: string[] = [];
    for (const id of new Set(itemIds)) {
      const entry = this.byItem.get(id);
      if (!entry) continue;
      if (!entry.milestones.some((m) => m.fromMs <= atMs)) out.push(id);
    }
    return out;
  }
}
