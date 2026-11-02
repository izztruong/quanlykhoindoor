import { prisma } from "../config/db";

/**
 * SL lẻ nhập vào lúc kiểm kê/huỷ/điều chuyển được coi là cân cả vỏ — với mỗi hàng hoá có khai
 * báo tareWeight, trừ số đó đi (không cho âm) trước khi lưu. Hàng hoá không khai báo tareWeight
 * giữ nguyên như cũ.
 *
 * Gọi ở đường TẠO (POST, nhập Excel). PUT phải dùng `subtractTareWeightOnChanged` — xem lý do ở đó.
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

/**
 * Bản cho PUT: chỉ trừ vỏ ở dòng có SL lẻ ĐỔI so với phiếu cũ, dòng không đụng tới giữ nguyên.
 *
 * DB lưu lượng TỊNH và form sửa nạp nguyên số đó, nên trừ cả phiếu là mỗi lần mở–lưu số teo đi một
 * tare (tới 0 thì dừng, mất dữ liệu không báo lỗi — đã xảy ra thật). Cộng bù tare ở form sửa cũng
 * không chữa được: tare đổi về sau thì phiếu cũ bị cộng bằng tare mới.
 *
 * "Không đổi" so theo GIÁ TRỊ, vì payload không mang id dòng và phiếu huỷ/điều chuyển cho một hàng
 * nằm ở nhiều dòng: dòng mới khớp một dòng cũ cùng hàng, cùng SL lẻ (làm tròn theo `Decimal(18,3)`
 * của cột) thì giữ nguyên, mỗi dòng cũ chỉ khớp được một lần. App cũ cộng bù vỏ ở form sửa điều
 * chuyển nên gửi tịnh + vỏ — không khớp, bị trừ, về đúng số tịnh.
 */
export async function subtractTareWeightOnChanged<T extends { productId: string; looseQuantity?: number }>(
  items: T[],
  previous: { productId: string; looseQuantity: unknown }[],
): Promise<T[]> {
  const key = (productId: string, loose: unknown) => `${productId}|${Math.round(Number(loose) * 1000)}`;
  const remaining = new Map<string, number>();
  for (const it of previous) {
    if (it.looseQuantity == null) continue;
    const k = key(it.productId, it.looseQuantity);
    remaining.set(k, (remaining.get(k) ?? 0) + 1);
  }

  const unchanged = items.map((it) => {
    if (it.looseQuantity == null) return false;
    const k = key(it.productId, it.looseQuantity);
    const count = remaining.get(k) ?? 0;
    if (count === 0) return false;
    remaining.set(k, count - 1);
    return true;
  });

  const adjusted = await subtractTareWeight(items);
  return items.map((it, i) => (unchanged[i] ? it : adjusted[i]));
}
