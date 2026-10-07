import type { Prisma } from "../../generated/prisma/client";
import { parseDateOnly, vnDateKeyOf } from "../../utils/vnTime";

export { parseDateOnly };

/** Ngày hôm nay theo GIỜ VN, không phải giờ máy chủ (Render chạy UTC: sau 17h VN là đã sang ngày khác). */
export function todayDateKey(): string {
  return vnDateKeyOf(new Date());
}

/** So hai giá tiền ở mức 2 chữ số thập phân — Decimal của Prisma không so được bằng `===`. */
export function samePrice(a: Prisma.Decimal | number | null | undefined, b: Prisma.Decimal | number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a).toFixed(2) === Number(b).toFixed(2);
}

type PriceTx = Pick<Prisma.TransactionClient, "finishedGoodPrice">;

/**
 * Ghi một mốc giá bán cho HÔM NAY, chỉ khi giá đổi thật.
 *
 * Phải gọi TRONG cùng transaction với lệnh cập nhật `FinishedGoodItem.sellingPrice`: cột đó là bản sao
 * giá hiện hành, lệch với bảng mốc là Check Cost tính một giá còn danh mục hiện giá khác.
 *
 * Bỏ qua khi giá không đổi để nhập lại đúng file Excel cũ không sinh ra mấy trăm mốc giá rác.
 */
export async function recordPriceChange(
  tx: PriceTx,
  finishedGoodItemId: string,
  currentPrice: Prisma.Decimal | number | null | undefined,
  nextPrice: number | undefined,
  actingUserId: string | undefined,
): Promise<void> {
  // undefined = payload không nhắc tới giá (PUT một phần) → không phải thay đổi.
  if (nextPrice === undefined) return;
  if (samePrice(currentPrice, nextPrice)) return;

  const effectiveFrom = parseDateOnly(todayDateKey());
  await tx.finishedGoodPrice.upsert({
    where: { finishedGoodItemId_effectiveFrom: { finishedGoodItemId, effectiveFrom } },
    create: { finishedGoodItemId, effectiveFrom, sellingPrice: nextPrice, createdById: actingUserId },
    update: { sellingPrice: nextPrice, createdById: actingUserId },
  });
}
