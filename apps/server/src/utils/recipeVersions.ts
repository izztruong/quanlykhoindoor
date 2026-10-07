import { prisma } from "../config/db";
import { vnDayStartMs } from "./vnTime";

export interface RecipeLine {
  productId: string;
  quantityPerUnit: number;
}

interface Version {
  /** 00:00 giờ VN của `effectiveFrom`, tính ra mốc UTC thật để so với mọi mốc khác. */
  fromMs: number;
  lines: RecipeLine[];
  byProduct: Map<string, number>;
}

/**
 * Lịch sử công thức (BOM) của một TẬP đồ thành phẩm, nạp bằng ĐÚNG MỘT query rồi phân giải trong
 * memory.
 *
 * Vì sao không tra từng lượt qua DB: một phiếu Check Cost có ~100 món × ~30 ngày × ~15 ô giờ, tức
 * khoảng 45.000 mốc cần phân giải. Query từng mốc là chết; nạp hết trước thì mỗi mốc chỉ còn là một
 * lượt quét qua vài version.
 *
 * Phân giải = version MỚI NHẤT có `effectiveFrom <= mốc cần tra`. Không có version nào thoả thì trả
 * rỗng/0 — **cố ý không lùi về công thức mới nhất**: món khai công thức sau mốc cần tra thì đúng là
 * lúc đó nó chưa có định mức nào, lấy định mức tương lai áp vào quá khứ chính là lỗi đang đi sửa.
 */
export class RecipeHistory {
  /** Đệm theo (món, ngày) cho `quantityOnDay`. */
  private readonly dayCache = new Map<string, Version | null>();

  private constructor(private readonly byItem: Map<string, Version[]>) {}

  /** `byItem` giữ danh sách version theo thứ tự GIẢM DẦN (mới nhất trước). */
  static async load(finishedGoodItemIds: Iterable<string>): Promise<RecipeHistory> {
    const ids = [...new Set(finishedGoodItemIds)];
    if (ids.length === 0) return new RecipeHistory(new Map());

    const rows = await prisma.finishedGoodRecipeVersion.findMany({
      where: { finishedGoodItemId: { in: ids } },
      orderBy: { effectiveFrom: "desc" },
      select: {
        finishedGoodItemId: true,
        effectiveFrom: true,
        items: { select: { productId: true, quantityPerUnit: true } },
      },
    });

    const byItem = new Map<string, Version[]>();
    for (const row of rows) {
      const lines = row.items.map((it) => ({ productId: it.productId, quantityPerUnit: Number(it.quantityPerUnit) }));
      const list = byItem.get(row.finishedGoodItemId) ?? [];
      list.push({
        fromMs: vnDayStartMs(row.effectiveFrom),
        lines,
        byProduct: new Map(lines.map((l) => [l.productId, l.quantityPerUnit])),
      });
      byItem.set(row.finishedGoodItemId, list);
    }
    return new RecipeHistory(byItem);
  }

  /** null = tại mốc đó món chưa có công thức nào. */
  private resolve(itemId: string, atMs: number): Version | null {
    const list = this.byItem.get(itemId);
    if (!list) return null;
    // Danh sách giảm dần nên version đầu tiên thoả chính là version mới nhất còn hiệu lực.
    for (const v of list) if (v.fromMs <= atMs) return v;
    return null;
  }

  /** Trọn bộ dòng công thức có hiệu lực tại mốc đó; `[]` khi chưa có công thức nào. */
  linesAt(itemId: string, atMs: number): RecipeLine[] {
    return this.resolve(itemId, atMs)?.lines ?? [];
  }

  /**
   * Định lượng của một nguyên liệu trong công thức tại mốc đó. `0` khi version tại mốc đó không có
   * dòng nguyên liệu này — thay cho `recipeByKey.get(...)` trả `undefined` ở bản cũ.
   */
  quantityAt(itemId: string, productId: string, atMs: number): number {
    return this.resolve(itemId, atMs)?.byProduct.get(productId) ?? 0;
  }

  /**
   * Bản dành cho ô giờ POS, có đệm.
   *
   * `effectiveFrom` chỉ mịn tới NGÀY nên mọi ô giờ trong cùng một ngày lịch VN phân giải ra cùng một
   * version — đệm theo (món, ngày) là CHÍNH XÁC, không phải xấp xỉ. Nhờ vậy ~45.000 lượt phân giải
   * của một phiếu còn khoảng ~3.000.
   */
  quantityOnDay(itemId: string, productId: string, dayKey: string, dayStartMs: number): number {
    const key = `${itemId}|${dayKey}`;
    let version = this.dayCache.get(key);
    if (version === undefined) {
      version = this.resolve(itemId, dayStartMs);
      this.dayCache.set(key, version);
    }
    return version?.byProduct.get(productId) ?? 0;
  }

  /**
   * Mọi `productId` của những version CÓ HIỆU LỰC ở đâu đó trong `[fromMs, toMs]`.
   *
   * Quyết định DANH SÁCH DÒNG nguyên liệu xuất hiện trong báo cáo Check Cost. Phải là hợp của các
   * version **giao với kỳ**, không phải một trong hai cực:
   * - chỉ lấy version tại cuối kỳ → mất dòng nguyên liệu bị bỏ giữa kỳ, dù nó đã được dùng thật;
   * - lấy mọi version từng tồn tại → sống lại nguyên liệu đã bỏ từ năm ngoái.
   *
   * Version thứ j (danh sách giảm dần) có hiệu lực trong `[list[j].fromMs, list[j-1].fromMs)`, nên nó
   * giao với kỳ khi đã có hiệu lực trước cuối kỳ VÀ chưa bị version mới hơn che hết trước đầu kỳ.
   */
  productIdsInWindow(fromMs: number, toMs: number): Set<string> {
    const out = new Set<string>();
    for (const list of this.byItem.values()) {
      for (let j = 0; j < list.length; j++) {
        if (list[j]!.fromMs > toMs) continue;
        const supersededAtMs = j === 0 ? Number.POSITIVE_INFINITY : list[j - 1]!.fromMs;
        if (supersededAtMs <= fromMs) continue;
        for (const line of list[j]!.lines) out.add(line.productId);
      }
    }
    return out;
  }
}
