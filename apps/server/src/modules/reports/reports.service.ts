import { prisma } from "../../config/db";

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
  const rows = await delegate.findMany({
    where,
    orderBy: { [headerField]: { transactionAt: "desc" } },
    include: {
      [headerField]: { include: { warehouse: true, supplier: true, customer: true } },
      product: { include: { unit: true, productGroup: true } },
    },
  });

  const total = rows.length;
  const paged = rows.slice(filter.skip, filter.skip + filter.take).map((row, index) => ({
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

  return { items: paged, total };
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

  function movementsSince(rows: MovementRow[], productId: string, afterExclusive: Date) {
    return rows
      .filter((r) => r.productId === productId)
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
        movementsSince(importRows, product.id, latestCount.countDate) -
        movementsSince(exportRows, product.id, latestCount.countDate);
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
