import { prisma } from "../config/db";
import type { FinishedGoodCategory } from "../generated/prisma/client";
import { vnDayStartMs } from "./vnTime";

interface Milestone {
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
 * Lịch sử giá bán của một TẬP đồ thành phẩm, nạp bằng một query rồi phân giải trong memory — cùng khuôn
 * và cùng lý do như `RecipeHistory` (xem `recipeVersions.ts`).
 *
 * Doanh thu Check Cost tra giá theo từng ô giờ POS, nên không thể query từng lượt.
 */
export class PriceHistory {
  private readonly dayCache = new Map<string, number>();

  private constructor(private readonly byItem: Map<string, ItemPrices>) {}

  static async load(finishedGoodItemIds: Iterable<string>): Promise<PriceHistory> {
    const ids = [...new Set(finishedGoodItemIds)];
    if (ids.length === 0) return new PriceHistory(new Map());

    const items = await prisma.finishedGoodItem.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        category: true,
        sellingPrice: true,
        prices: { select: { effectiveFrom: true, sellingPrice: true }, orderBy: { effectiveFrom: "desc" } },
      },
    });

    const byItem = new Map<string, ItemPrices>(
      items.map((item) => [
        item.id,
        {
          category: item.category,
          milestones: item.prices.map((p) => ({ fromMs: vnDayStartMs(p.effectiveFrom), sellingPrice: Number(p.sellingPrice) })),
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
