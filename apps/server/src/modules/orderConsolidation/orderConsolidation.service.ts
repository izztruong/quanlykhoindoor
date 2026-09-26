import { prisma } from "../../config/db";
import type { SalesOrderStatus } from "../../generated/prisma/client";
import { nextFreeTransferDay, pickPrioritySupplier } from "../../utils/orderCadence";

/**
 * Gom đơn để khỏi mất phí ship.
 *
 * Ba con số của bài toán:
 *   - NCC miễn ship khi đơn đạt `Supplier.freeShipThreshold` (thường 1 triệu).
 *   - Phí ship tính theo **TỪNG QUÁN**: ba quán đặt lẻ cùng một NCC là ba lần ship.
 *   - Chuyển hàng giữa các quán vào **Thứ 3 / Thứ 7 miễn phí**.
 *
 * Nên khi tổng của cả chuỗi đủ ngưỡng mà từng quán không đủ, cách rẻ nhất là dồn về MỘT quán cho vượt
 * ngưỡng rồi chuyển đi — một lần ship thay vì ba.
 *
 * **Chỉ tính hàng KHÔNG công nợ.** Hàng công nợ trả sau 2 tháng nên không chịu sức ép tiền mặt, không
 * đáng kéo thêm rủi ro vận chuyển vào; và gộp chung hai loại vào một ngưỡng sẽ cho ra con số "đã đạt
 * miễn ship" sai.
 *
 * **Chỉ admin đọc được** vì mọi con số đây đều suy từ giá nhập, mà quán không có quyền xem bảng giá NCC.
 */

/** Trạng thái còn có nghĩa với việc đi đặt NCC — phần đã xác nhận thì đã gọi rồi, gom nữa là muộn. */
const OPEN_STATUSES: SalesOrderStatus[] = ["DRAFT", "PENDING_CONFIRM"];

export interface ShopAmount {
  userId: string;
  userName: string;
  amount: number;
  /** Mã các đơn góp vào, để người duyệt mở ra đối chiếu. */
  orderCodes: string[];
  /** Đã tự đạt ngưỡng miễn ship, không cần gom. */
  reachesThreshold: boolean;
  /** Còn thiếu bao nhiêu tiền nữa mới miễn ship. 0 khi đã đạt. */
  shortfall: number;
}

export interface SupplierConsolidation {
  supplierId: string;
  supplierName: string;
  /** Null = NCC chưa khai chính sách miễn ship, nên không kết luận được gì. */
  freeShipThreshold: number | null;
  shops: ShopAmount[];
  /** Tổng tiền hàng không công nợ của MỌI quán tới NCC này. */
  totalAmount: number;
  /** Số quán tự đạt ngưỡng. */
  shopsReaching: number;
  /**
   * Có nên gom hay không: tổng chuỗi đủ ngưỡng nhưng ít nhất hai quán chưa tự đạt.
   * Một quán chưa đạt thì không gom được với ai — phải đợi hoặc chịu ship.
   */
  shouldConsolidate: boolean;
  /** Quán nhận hàng về (nhiều tiền nhất) khi gom. Null khi không đề xuất gom. */
  consolidateIntoUserId: string | null;
  consolidateIntoUserName: string | null;
  /** Số lần ship tiết kiệm được nếu gom: số quán chưa tự đạt, trừ quán đứng ra nhận. */
  shipmentsSaved: number;
  reasons: string[];
}

export interface OrderConsolidationReport {
  /** Ngày chuyển miễn phí gần nhất — mọi đề xuất gom đều neo vào mốc này. */
  nextTransferWeekday: number;
  nextTransferDaysAway: number;
  suppliers: SupplierConsolidation[];
}

function round0(value: number): number {
  return Math.round(value);
}

export async function getOrderConsolidationReport(now: Date = new Date()): Promise<OrderConsolidationReport> {
  const items = await prisma.salesOrderItem.findMany({
    where: { salesOrder: { status: { in: OPEN_STATUSES } } },
    select: {
      productId: true,
      quantity: true,
      salesOrder: { select: { code: true, createdById: true, createdBy: { select: { name: true } } } },
    },
  });

  const productIds = [...new Set(items.map((it) => it.productId))];
  if (productIds.length === 0) {
    const next = nextFreeTransferDay(now);
    return { nextTransferWeekday: next.weekday, nextTransferDaysAway: next.daysAway, suppliers: [] };
  }

  const prices = await prisma.productSupplierPrice.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      supplierId: true,
      priority: true,
      importPrice: true,
      hasCredit: true,
      supplier: { select: { id: true, name: true, freeShipThreshold: true } },
    },
  });

  const pricesByProduct = new Map<string, typeof prices>();
  for (const price of prices) {
    const list = pricesByProduct.get(price.productId) ?? [];
    list.push(price);
    pricesByProduct.set(price.productId, list);
  }

  // NCC ưu tiên của từng hàng hoá — cùng phép chọn với Tổng hợp đặt NCC, nên tiền gom ở đây đúng là tiền
  // sẽ trả cho NCC đó.
  const bestByProduct = new Map<string, (typeof prices)[number]>();
  for (const [productId, list] of pricesByProduct) {
    const { supplier } = pickPrioritySupplier(list.map((p) => ({ ...p, supplierName: p.supplier.name })));
    if (supplier) bestByProduct.set(productId, list.find((p) => p.supplierId === supplier.supplierId)!);
  }

  // Cộng tiền theo (NCC × quán). Bỏ qua hàng có công nợ và hàng chưa khai NCC.
  interface Bucket {
    amount: number;
    orderCodes: Set<string>;
    userName: string;
  }
  const buckets = new Map<string, Map<string, Bucket>>();
  const supplierInfo = new Map<string, { name: string; freeShipThreshold: number | null }>();

  for (const item of items) {
    const best = bestByProduct.get(item.productId);
    if (!best || best.hasCredit) continue;
    const userId = item.salesOrder.createdById;
    if (!userId) continue;

    supplierInfo.set(best.supplierId, {
      name: best.supplier.name,
      freeShipThreshold: best.supplier.freeShipThreshold == null ? null : Number(best.supplier.freeShipThreshold),
    });

    const byShop = buckets.get(best.supplierId) ?? new Map<string, Bucket>();
    const bucket = byShop.get(userId) ?? { amount: 0, orderCodes: new Set<string>(), userName: item.salesOrder.createdBy?.name ?? "?" };
    bucket.amount += Number(item.quantity) * Number(best.importPrice);
    bucket.orderCodes.add(item.salesOrder.code);
    byShop.set(userId, bucket);
    buckets.set(best.supplierId, byShop);
  }

  const next = nextFreeTransferDay(now);

  const suppliers: SupplierConsolidation[] = [...buckets.entries()].map(([supplierId, byShop]) => {
    const info = supplierInfo.get(supplierId)!;
    const threshold = info.freeShipThreshold;

    const shops: ShopAmount[] = [...byShop.entries()]
      .map(([userId, bucket]) => {
        const amount = round0(bucket.amount);
        const reaches = threshold != null && amount >= threshold;
        return {
          userId,
          userName: bucket.userName,
          amount,
          orderCodes: [...bucket.orderCodes].sort((a, b) => a.localeCompare(b)),
          reachesThreshold: reaches,
          shortfall: threshold != null && !reaches ? round0(threshold - amount) : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const totalAmount = round0(shops.reduce((sum, s) => sum + s.amount, 0));
    const shopsReaching = shops.filter((s) => s.reachesThreshold).length;
    const shopsBelow = shops.filter((s) => !s.reachesThreshold);
    // Gom được khi tổng chuỗi đủ ngưỡng và có TỪ HAI quán chưa tự đạt: dồn hai phần lẻ vào nhau mới vượt
    // được ngưỡng. Một quán lẻ thì không có ai để gom cùng.
    const shouldConsolidate = threshold != null && totalAmount >= threshold && shopsBelow.length >= 2;
    const host = shouldConsolidate ? shopsBelow[0]! : null;

    const reasons: string[] = [];
    if (threshold == null) {
      reasons.push("NCC này chưa khai ngưỡng miễn ship — khai ở Danh mục › Nhà cung cấp mới tính được");
    } else {
      reasons.push(`Ngưỡng miễn ship ${threshold.toLocaleString("vi-VN")} đ cho mỗi quán`);
      for (const shop of shops) {
        reasons.push(
          shop.reachesThreshold
            ? `${shop.userName}: ${shop.amount.toLocaleString("vi-VN")} đ — đã đủ, miễn ship`
            : `${shop.userName}: ${shop.amount.toLocaleString("vi-VN")} đ — còn thiếu ${shop.shortfall.toLocaleString("vi-VN")} đ`,
        );
      }
      if (shouldConsolidate && host) {
        reasons.push(
          `Tổng cả chuỗi ${totalAmount.toLocaleString("vi-VN")} đ đã vượt ngưỡng: gom về ${host.userName} cho một lần ship, rồi chuyển phần của ${shopsBelow.length - 1} quán còn lại`,
        );
        reasons.push(
          next.daysAway === 0
            ? "Hôm nay đúng ngày chuyển miễn phí — chuyển được ngay"
            : `Ngày chuyển miễn phí gần nhất còn ${next.daysAway} ngày`,
        );
        // Giới hạn phải nói ra: chưa kiểm được quán nhận có cầm cự nổi tới ngày chuyển hay không.
        reasons.push(
          "CHƯA kiểm được quán nhận có đủ hàng dùng tới ngày chuyển hay không (cần tồn nguyên liệu ước tính hàng ngày) — tiết kiệm ship mà để quán hết hàng thì lỗ hơn",
        );
      } else if (threshold != null && totalAmount < threshold) {
        reasons.push(`Tổng cả chuỗi ${totalAmount.toLocaleString("vi-VN")} đ vẫn chưa đủ ngưỡng — gom cũng không miễn được`);
      } else if (shopsBelow.length === 1) {
        reasons.push(`Chỉ ${shopsBelow[0]!.userName} chưa đủ ngưỡng — không có quán nào để gom cùng`);
      } else if (shopsBelow.length === 0) {
        reasons.push("Mọi quán đều đã tự đạt ngưỡng — không cần gom");
      }
    }

    return {
      supplierId,
      supplierName: info.name,
      freeShipThreshold: threshold,
      shops,
      totalAmount,
      shopsReaching,
      shouldConsolidate,
      consolidateIntoUserId: host?.userId ?? null,
      consolidateIntoUserName: host?.userName ?? null,
      shipmentsSaved: shouldConsolidate ? shopsBelow.length - 1 : 0,
      reasons,
    };
  });

  // NCC gom được lên trước, rồi NCC có quán còn thiếu, rồi theo tên.
  suppliers.sort(
    (a, b) =>
      Number(b.shouldConsolidate) - Number(a.shouldConsolidate) ||
      b.shops.filter((s) => !s.reachesThreshold).length - a.shops.filter((s) => !s.reachesThreshold).length ||
      a.supplierName.localeCompare(b.supplierName),
  );

  return { nextTransferWeekday: next.weekday, nextTransferDaysAway: next.daysAway, suppliers };
}
