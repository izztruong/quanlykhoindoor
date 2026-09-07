import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { productSupplierPricesPutSchema } from "./productSupplierPrices.schemas";

export const productSupplierPricesRouter = Router();

const priceInclude = {
  product: { include: { unit: true, productGroup: true } },
  supplier: true,
  purchaseUnit: true,
};

// GET /?supplierId=X returns just that supplier's price list (for the price-list
// admin page, and for the stock-import product picker). No supplierId returns
// every price row (for the stock-export line-level "which suppliers sell this
// product" lookup). Whole router is admin-only, mounted the same way as
// stock-imports/stock-exports — only admins ever touch this data.
productSupplierPricesRouter.get("/", async (req, res) => {
  const supplierId = (req.query.supplierId as string) || undefined;
  const items = await prisma.productSupplierPrice.findMany({
    where: { supplierId },
    include: priceInclude,
  });
  res.json({ items });
});

productSupplierPricesRouter.put("/", async (req, res) => {
  const { supplierId, items } = productSupplierPricesPutSchema.parse(req.body);

  // Same fix as reorder-thresholds: the page submits every product every
  // save, so hundreds of one-row-at-a-time deletes/upserts inside a single
  // interactive transaction blew past Prisma's 5s timeout over Neon. Batch
  // the delete side into one query and run everything in one non-interactive
  // transaction (single connection) instead of one round trip per row.
  const toDelete = items.filter((it) => it.importPrice == null || it.exportPrice == null);
  const toUpsert = items.filter((it) => it.importPrice != null && it.exportPrice != null);

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (toDelete.length > 0) {
    operations.push(
      prisma.productSupplierPrice.deleteMany({
        where: { supplierId, productId: { in: toDelete.map((it) => it.productId) } },
      }),
    );
  }
  for (const it of toUpsert) {
    // Đơn vị gọi đi liền hệ số quy đổi: bỏ chọn đơn vị thì xoá luôn hệ số, tránh để lại một hệ
    // số mồ côi khiến phần tổng hợp đặt NCC quy đổi theo con số không còn đơn vị nào ứng với nó.
    const purchaseUnitId = it.purchaseUnitId ?? null;
    const packaging = {
      purchaseUnitId,
      baseUnitsPerPurchaseUnit: purchaseUnitId ? (it.baseUnitsPerPurchaseUnit ?? null) : null,
      minQuantity: it.minQuantity ?? null,
      priority: it.priority ?? 1,
    };
    operations.push(
      prisma.productSupplierPrice.upsert({
        where: { productId_supplierId: { productId: it.productId, supplierId } },
        create: { supplierId, productId: it.productId, importPrice: it.importPrice!, exportPrice: it.exportPrice!, ...packaging },
        update: { importPrice: it.importPrice!, exportPrice: it.exportPrice!, ...packaging },
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const result = await prisma.productSupplierPrice.findMany({ where: { supplierId }, include: priceInclude });
  res.json({ items: result });
});
