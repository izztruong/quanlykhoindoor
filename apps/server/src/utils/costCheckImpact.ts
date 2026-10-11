import { prisma } from "../config/db";
import { vnDayStartMs } from "./vnTime";

export interface AffectedCostCheck {
  id: string;
  code: string;
}

/** Phiếu kiểm kê quán này là mốc đầu/cuối kỳ trực tiếp của những phiếu Check Cost nào (đang ACTIVE). */
export async function findCostChecksUsingStockCheck(stockCheckId: string): Promise<AffectedCostCheck[]> {
  return prisma.costCheck.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ openingStockCheckId: stockCheckId }, { closingStockCheckId: stockCheckId }],
    },
    select: { id: true, code: true },
  });
}

/**
 * Phiếu huỷ nguyên liệu/điều chuyển không liên kết trực tiếp tới Check Cost — chúng được gộp vào
 * lúc tính theo kiểu "cùng quán + thời điểm nằm trong khoảng [ngày kiểm đầu kỳ, ngày kiểm cuối kỳ]".
 * userIds: 1 giá trị cho phiếu huỷ (createdById), 2 giá trị cho phiếu điều chuyển (from + to).
 */
export async function findCostChecksUsingPeriodRecord(userIds: (string | null | undefined)[], at: Date): Promise<AffectedCostCheck[]> {
  const validUserIds = userIds.filter((id): id is string => Boolean(id));
  if (validUserIds.length === 0) return [];

  return prisma.costCheck.findMany({
    where: {
      status: "ACTIVE",
      userId: { in: validUserIds },
      openingStockCheck: { checkedAt: { lte: at } },
      closingStockCheck: { checkedAt: { gte: at } },
    },
    select: { id: true, code: true },
  });
}

/**
 * Bản gom lô của `findCostChecksUsingPeriodRecord`: nhận nhiều cặp (quán, mốc) và trả danh sách phiếu
 * Check Cost bị ảnh hưởng, **đã dedupe**, bằng ĐÚNG MỘT query.
 *
 * Dùng cho đường nhập Excel (một file có thể là 200 phiếu với 200 mốc khác nhau). Gọi hàm một-mốc
 * trong vòng lặp là 200 round-trip Neon, mà mỗi query lại lọc trên quan hệ nên Prisma dịch thành hai
 * join sang `StockCheck` — không rẻ.
 *
 * Khoảng `[minAt, maxAt]` chỉ để thu hẹp ở DB cho rẻ; phép lọc cuối vẫn là
 * `opening.checkedAt <= at <= closing.checkedAt` cho **từng mốc một**, nên kết quả không rộng hơn
 * khi gọi lẻ từng mốc. Biên `lte`/`gte` giữ y nguyên để khớp hàm một-mốc.
 */
export async function findCostChecksUsingPeriodRecords(
  pairs: { shopUserId: string | null | undefined; at: Date }[],
): Promise<AffectedCostCheck[]> {
  const valid = pairs.filter((p): p is { shopUserId: string; at: Date } => Boolean(p.shopUserId) && Boolean(p.at));
  if (valid.length === 0) return [];

  const shopUserIds = [...new Set(valid.map((p) => p.shopUserId))];
  const times = valid.map((p) => p.at.getTime());
  const minAt = new Date(Math.min(...times));
  const maxAt = new Date(Math.max(...times));

  const candidates = await prisma.costCheck.findMany({
    where: {
      status: "ACTIVE",
      userId: { in: shopUserIds },
      openingStockCheck: { checkedAt: { lte: maxAt } },
      closingStockCheck: { checkedAt: { gte: minAt } },
    },
    select: {
      id: true,
      code: true,
      userId: true,
      openingStockCheck: { select: { checkedAt: true } },
      closingStockCheck: { select: { checkedAt: true } },
    },
  });

  const seen = new Set<string>();
  const result: AffectedCostCheck[] = [];
  for (const cc of candidates) {
    const hit = valid.some(
      (p) =>
        p.shopUserId === cc.userId &&
        cc.openingStockCheck.checkedAt.getTime() <= p.at.getTime() &&
        cc.closingStockCheck.checkedAt.getTime() >= p.at.getTime(),
    );
    if (!hit || seen.has(cc.id)) continue;
    seen.add(cc.id);
    result.push({ id: cc.id, code: cc.code });
  }
  return result;
}

/**
 * Thêm/sửa một mốc công thức hay mốc giá bán có ngày hiệu lực nằm trong kỳ của những phiếu Check Cost
 * nào (đang ACTIVE).
 *
 * Khác hai hàm trên: **không lọc theo quán**. Công thức và giá bán là dữ liệu toàn cục, một mốc mới
 * ảnh hưởng phiếu của mọi quán có kỳ chứa mốc đó.
 *
 * `effectiveFrom` là cột `@db.Date` nên phải quy về 00:00 GIỜ VN trước khi so với `checkedAt` (mốc
 * thật có giờ) — cắt thẳng sẽ lệch 7 tiếng ở hai ngày biên.
 */
export async function findCostChecksUsingEffectiveDate(effectiveFrom: Date): Promise<AffectedCostCheck[]> {
  const at = new Date(vnDayStartMs(effectiveFrom));
  return prisma.costCheck.findMany({
    where: {
      status: "ACTIVE",
      openingStockCheck: { checkedAt: { lte: at } },
      closingStockCheck: { checkedAt: { gte: at } },
    },
    select: { id: true, code: true },
  });
}
