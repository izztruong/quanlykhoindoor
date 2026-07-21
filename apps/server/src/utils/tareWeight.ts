import { prisma } from "../config/db";

/**
 * SL lẻ nhập vào lúc kiểm kê/huỷ/điều chuyển được coi là cân cả vỏ — với mỗi hàng hoá có khai
 * báo tareWeight, trừ số đó đi (không cho âm) trước khi lưu. Hàng hoá không khai báo tareWeight
 * giữ nguyên như cũ.
 */
export async function subtractTareWeight<T extends { productId: string; looseQuantity?: number }>(items: T[]): Promise<T[]> {
  const productIds = [...new Set(items.map((it) => it.productId))];
  if (productIds.length === 0) return items;

  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, tareWeight: true } });
  const tareById = new Map(products.map((p) => [p.id, p.tareWeight != null ? Number(p.tareWeight) : 0]));

  return items.map((it) => {
    const tare = tareById.get(it.productId) ?? 0;
    if (!tare || it.looseQuantity == null) return it;
    return { ...it, looseQuantity: Math.max(0, it.looseQuantity - tare) };
  });
}
