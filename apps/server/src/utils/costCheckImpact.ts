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
