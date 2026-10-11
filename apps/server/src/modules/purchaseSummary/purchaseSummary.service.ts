import { prisma } from "../../config/db";
import type { SalesOrderStatus } from "../../generated/prisma/client";

/**
 * Tổng hợp đặt NCC — gộp SL ĐẶT trên các đơn hàng theo hàng hoá rồi quy ra số cần mua theo bảng
 * giá NCC (quy cách đóng gói, SL tối thiểu). Tách khỏi module `reports` cũ khi nhóm báo cáo Kiểm
 * toán bị bỏ: đây là chức năng duy nhất còn sống ở đó, và nó không liên quan gì tới nhập/xuất kho.
 *
 * Đường API giữ nguyên `/api/reports/purchase-summary` để web không phải sửa.
 */
export interface PurchaseSummaryFilter {
  from?: Date;
  to?: Date;
  /** Quán đã đặt đơn — SalesOrder.createdById. Bỏ trống là gộp mọi quán. */
  createdById?: string;
  statuses: SalesOrderStatus[];
  skip: number;
  take: number;
}

export async function getPurchaseSummary(filter: PurchaseSummaryFilter) {
  const grouped = await prisma.salesOrderItem.groupBy({
    by: ["productId"],
    where: {
      salesOrder: {
        status: { in: filter.statuses },
        createdById: filter.createdById || undefined,
        orderDate: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
      },
    },
    _sum: { quantity: true },
  });

  const orderedByProductId = new Map(grouped.map((g) => [g.productId, Number(g._sum.quantity ?? 0)]));
  const productIds = grouped.map((g) => g.productId);
  if (productIds.length === 0) return { items: [], total: 0 };

  const [products, prices] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { unit: true, productGroup: true },
    }),
    prisma.productSupplierPrice.findMany({
      where: { productId: { in: productIds } },
      include: { supplier: true, purchaseUnit: true },
    }),
  ]);

  // NCC ưu tiên nhất cho từng hàng hoá: priority nhỏ nhất, hoà thì giá nhập rẻ hơn, rồi tên NCC
  // để kết quả không đổi thứ tự giữa các lần chạy khi hai NCC trùng cả hai tiêu chí trên.
  const bestByProductId = new Map<string, (typeof prices)[number]>();
  for (const price of prices) {
    const current = bestByProductId.get(price.productId);
    if (
      !current ||
      price.priority < current.priority ||
      (price.priority === current.priority && Number(price.importPrice) < Number(current.importPrice)) ||
      (price.priority === current.priority &&
        Number(price.importPrice) === Number(current.importPrice) &&
        price.supplier.name.localeCompare(current.supplier.name) < 0)
    ) {
      bestByProductId.set(price.productId, price);
    }
  }

  const rows = products.map((product) => {
    const orderedBaseQty = orderedByProductId.get(product.id) ?? 0;
    const best = bestByProductId.get(product.id);
    const packSize = Number(best?.baseUnitsPerPurchaseUnit ?? 0);
    const hasPurchaseUnit = Boolean(best?.purchaseUnit && packSize > 0);
    const minQuantity = best?.minQuantity == null ? null : Number(best.minQuantity);

    // Số lượng phải đặt, tính theo đơn vị gọi khi có khai, ngược lại theo đơn vị chính.
    const rawQty = hasPurchaseUnit ? orderedBaseQty / packSize : orderedBaseQty;
    const packedQty = hasPurchaseUnit ? Math.ceil(rawQty) : rawQty;
    const purchaseQty = minQuantity != null ? Math.max(packedQty, minQuantity) : packedQty;
    const finalBaseQty = hasPurchaseUnit ? purchaseQty * packSize : purchaseQty;

    const importPrice = best ? Number(best.importPrice) : 0;
    return {
      supplier: best?.supplier ?? null,
      product: { id: product.id, code: product.code, name: product.name },
      productGroup: product.productGroup,
      unit: product.unit,
      purchaseUnit: hasPurchaseUnit ? best!.purchaseUnit : null,
      baseUnitsPerPurchaseUnit: hasPurchaseUnit ? packSize : null,
      orderedBaseQty,
      minQuantity,
      purchaseQty,
      finalBaseQty,
      roundedUpToPack: hasPurchaseUnit && packedQty > rawQty,
      raisedToMinimum: purchaseQty > packedQty,
      importPrice,
      amount: finalBaseQty * importPrice,
    };
  });

  // Hàng chưa có NCC nào xếp xuống cuối, nhưng vẫn phải hiện để admin biết mà bổ sung bảng giá.
  rows.sort(
    (a, b) =>
      Number(Boolean(b.supplier)) - Number(Boolean(a.supplier)) ||
      (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "") ||
      a.product.name.localeCompare(b.product.name),
  );

  const total = rows.length;
  const items = rows.slice(filter.skip, filter.skip + filter.take).map((row, index) => ({ ...row, stt: filter.skip + index + 1 }));
  return { items, total };
}
