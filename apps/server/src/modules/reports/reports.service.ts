import { prisma } from "../../config/db";
import type { SalesOrderStatus } from "../../generated/prisma/client";

export interface ReportFilter {
  warehouseId?: string;
  productId?: string;
  productGroupId?: string;
  /** Filters by the stock voucher's own code (e.g. "PX2607...") — used by the detail reports. */
  code?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

type StockItemDelegate = {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
};

function buildItemWhere(headerField: "stockImport" | "stockExport", filter: ReportFilter) {
  return {
    productId: filter.productId || undefined,
    product: filter.productGroupId ? { productGroupId: filter.productGroupId } : undefined,
    [headerField]: {
      status: "COMPLETED",
      warehouseId: filter.warehouseId || undefined,
      code: filter.code ? { contains: filter.code, mode: "insensitive" } : undefined,
      transactionAt: filter.from || filter.to ? { gte: filter.from, lte: filter.to } : undefined,
    },
  };
}

async function getDetail(delegate: StockItemDelegate, headerField: "stockImport" | "stockExport", filter: ReportFilter) {
  const where = buildItemWhere(headerField, filter);
  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: { [headerField]: { transactionAt: "desc" } },
      skip: filter.skip,
      take: filter.take,
      include: {
        [headerField]: { include: { warehouse: true, supplier: true, customer: true } },
        product: { include: { unit: true, productGroup: true } },
      },
    }),
    delegate.count({ where }),
  ]);

  const items = rows.map((row, index) => ({
    stt: filter.skip + index + 1,
    id: row.id,
    header: row[headerField],
    product: row.product,
    productGroup: row.product.productGroup,
    unit: row.product.unit,
    quantity: Number(row.quantity),
    costPrice: Number(row.costPrice),
    costAmount: Number(row.costAmount),
    note: row.note,
  }));

  return { items, total };
}

interface SummaryRow {
  product: any;
  productGroup: any;
  unit: any;
  warehouse: any;
  quantity: number;
  costAmount: number;
}

async function getSummary(delegate: StockItemDelegate, headerField: "stockImport" | "stockExport", filter: ReportFilter) {
  const where = buildItemWhere(headerField, filter);
  const rows = await delegate.findMany({
    where,
    include: {
      [headerField]: { include: { warehouse: true } },
      product: { include: { unit: true, productGroup: true } },
    },
  });

  const map = new Map<string, SummaryRow>();
  for (const row of rows) {
    const warehouse = row[headerField].warehouse;
    const key = `${row.productId}|${warehouse.id}`;
    const quantity = Number(row.quantity);
    const costAmount = Number(row.costAmount);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.costAmount += costAmount;
    } else {
      map.set(key, { product: row.product, productGroup: row.product.productGroup, unit: row.product.unit, warehouse, quantity, costAmount });
    }
  }

  const all = Array.from(map.values()).map((r, index) => ({
    stt: index + 1,
    product: r.product,
    productGroup: r.productGroup,
    unit: r.unit,
    warehouse: r.warehouse,
    quantity: r.quantity,
    costPrice: r.quantity ? r.costAmount / r.quantity : 0,
    costAmount: r.costAmount,
  }));

  const total = all.length;
  const paged = all.slice(filter.skip, filter.skip + filter.take).map((row, index) => ({ ...row, stt: filter.skip + index + 1 }));
  return { items: paged, total };
}

export const getExportDetail = (filter: ReportFilter) => getDetail(prisma.stockExportItem, "stockExport", filter);
export const getImportDetail = (filter: ReportFilter) => getDetail(prisma.stockImportItem, "stockImport", filter);
export const getExportSummary = (filter: ReportFilter) => getSummary(prisma.stockExportItem, "stockExport", filter);
export const getImportSummary = (filter: ReportFilter) => getSummary(prisma.stockImportItem, "stockImport", filter);

interface InventoryCountFilter {
  warehouseId: string;
  periodStart: Date;
  periodEnd: Date;
  productId?: string;
  productGroupId?: string;
  inventoryCountId?: string;
}

export async function getInventoryCountReport(filter: InventoryCountFilter) {
  const products = await prisma.product.findMany({
    where: {
      id: filter.productId || undefined,
      productGroupId: filter.productGroupId || undefined,
    },
    include: { unit: true, productGroup: true },
    orderBy: { name: "asc" },
  });
  const productIds = products.map((p) => p.id);

  const sumBy = async (delegate: StockItemDelegate, headerField: "stockImport" | "stockExport", transactionAt: any) =>
    (delegate as any).groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        [headerField]: { warehouseId: filter.warehouseId, status: "COMPLETED", transactionAt },
      },
      _sum: { quantity: true },
    }) as Promise<{ productId: string; _sum: { quantity: unknown } }[]>;

  // systemQty/openingQty are pure bookkeeping — cumulative imports/exports only,
  // never influenced by a physical count. That independence is what makes the
  // Thừa/Thiếu comparison against actualQty meaningful.
  //
  // actualQty, when no specific inventoryCountId is requested, is instead
  // *estimated*: anchored on the most recent completed physical count up to
  // periodEnd (even one that falls inside the period), plus movements since
  // that count. If the latest count predates the period entirely, it tells us
  // nothing new about this period, so actualQty just falls back to systemQty.
  const [openingImports, openingExports, periodImports, periodExports, latestCounts, importRows, exportRows, actualItems] =
    await Promise.all([
      sumBy(prisma.stockImportItem, "stockImport", { lt: filter.periodStart }),
      sumBy(prisma.stockExportItem, "stockExport", { lt: filter.periodStart }),
      sumBy(prisma.stockImportItem, "stockImport", { gte: filter.periodStart, lte: filter.periodEnd }),
      sumBy(prisma.stockExportItem, "stockExport", { gte: filter.periodStart, lte: filter.periodEnd }),
      prisma.inventoryCountItem.findMany({
        where: {
          productId: { in: productIds },
          inventoryCount: { warehouseId: filter.warehouseId, status: "COMPLETED", countDate: { lt: filter.periodEnd } },
        },
        select: { productId: true, actualQuantity: true, inventoryCount: { select: { countDate: true } } },
        orderBy: { inventoryCount: { countDate: "desc" } },
      }),
      prisma.stockImportItem.findMany({
        where: {
          productId: { in: productIds },
          stockImport: { warehouseId: filter.warehouseId, status: "COMPLETED", transactionAt: { lte: filter.periodEnd } },
        },
        select: { productId: true, quantity: true, stockImport: { select: { transactionAt: true } } },
      }),
      prisma.stockExportItem.findMany({
        where: {
          productId: { in: productIds },
          stockExport: { warehouseId: filter.warehouseId, status: "COMPLETED", transactionAt: { lte: filter.periodEnd } },
        },
        select: { productId: true, quantity: true, stockExport: { select: { transactionAt: true } } },
      }),
      filter.inventoryCountId
        ? prisma.inventoryCountItem.findMany({ where: { inventoryCountId: filter.inventoryCountId, productId: { in: productIds } } })
        : Promise.resolve([] as { productId: string; actualQuantity: unknown }[]),
    ]);

  const toMap = (rows: { productId: string; _sum: { quantity: unknown } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.productId, Number(r._sum.quantity ?? 0));
    return m;
  };

  const openingImportMap = toMap(openingImports);
  const openingExportMap = toMap(openingExports);
  const periodImportMap = toMap(periodImports);
  const periodExportMap = toMap(periodExports);

  // Rows are ordered by countDate desc, so the first hit per product is its latest count.
  const latestCountMap = new Map<string, { countDate: Date; actualQuantity: number }>();
  for (const row of latestCounts) {
    if (!latestCountMap.has(row.productId)) {
      latestCountMap.set(row.productId, { countDate: row.inventoryCount.countDate, actualQuantity: Number(row.actualQuantity) });
    }
  }

  type MovementRow = { productId: string; quantity: unknown; stockImport?: { transactionAt: Date }; stockExport?: { transactionAt: Date } };

  // Grouped once up front so movementsSince (called per product below) filters only the rows
  // for that one product instead of re-scanning the full import/export arrays every time —
  // O(products + movements) instead of O(products × movements).
  function groupByProductId(rows: MovementRow[]) {
    const map = new Map<string, MovementRow[]>();
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row);
      map.set(row.productId, list);
    }
    return map;
  }
  const importRowsByProduct = groupByProductId(importRows);
  const exportRowsByProduct = groupByProductId(exportRows);

  function movementsSince(rowsByProduct: Map<string, MovementRow[]>, productId: string, afterExclusive: Date) {
    const rows = rowsByProduct.get(productId) ?? [];
    return rows
      .filter((r) => (r.stockImport ?? r.stockExport)!.transactionAt > afterExclusive)
      .reduce((sum, r) => sum + Number(r.quantity), 0);
  }

  const actualMap = new Map(actualItems.map((a) => [a.productId, Number(a.actualQuantity)]));

  const items = products.map((product, index) => {
    const opening = (openingImportMap.get(product.id) ?? 0) - (openingExportMap.get(product.id) ?? 0);
    const imported = periodImportMap.get(product.id) ?? 0;
    const exported = periodExportMap.get(product.id) ?? 0;
    const systemQty = opening + imported - exported;

    let estimatedActualQty = systemQty;
    const latestCount = latestCountMap.get(product.id);
    if (latestCount && latestCount.countDate >= filter.periodStart) {
      estimatedActualQty =
        latestCount.actualQuantity +
        movementsSince(importRowsByProduct, product.id, latestCount.countDate) -
        movementsSince(exportRowsByProduct, product.id, latestCount.countDate);
    }

    const hasActual = actualMap.has(product.id);
    const actualQty = hasActual ? actualMap.get(product.id)! : estimatedActualQty;

    return {
      stt: index + 1,
      product: { id: product.id, code: product.code, name: product.name },
      productGroup: product.productGroup,
      unit: product.unit,
      openingQty: opening,
      importedQty: imported,
      exportedQty: exported,
      systemQty,
      actualQty,
      surplusQty: Math.max(actualQty - systemQty, 0),
      shortageQty: Math.max(systemQty - actualQty, 0),
    };
  });

  return { items, total: items.length };
}

/**
 * Tổng hợp đặt hàng nhà cung cấp ("bot" gộp đơn).
 *
 * Gộp số lượng cùng một hàng hoá qua mọi đơn hàng trong kỳ, chọn NCC ưu tiên nhất rồi quy đổi
 * sang đơn vị gọi của NCC đó. Hai lần làm tròn lên, theo đúng thứ tự:
 *   1. Lên số nguyên đơn vị gọi — không mua được nửa thùng.
 *   2. Lên mức tối thiểu NCC quy định, nếu bước 1 vẫn chưa đạt.
 * Hàng chưa khai đơn vị gọi thì giữ nguyên đơn vị chính và bỏ qua bước 1 (hàng cân ký gọi lẻ được).
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
