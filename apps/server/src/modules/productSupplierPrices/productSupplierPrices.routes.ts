import { Router } from "express";
import { prisma } from "../../config/db";
import { productSupplierPricesPutSchema } from "./productSupplierPrices.schemas";

export const productSupplierPricesRouter = Router();

const priceInclude = {
  product: { include: { unit: true, productGroup: true } },
  supplier: true,
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

  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      if (it.importPrice == null || it.exportPrice == null) {
        await tx.productSupplierPrice.deleteMany({ where: { supplierId, productId: it.productId } });
      } else {
        await tx.productSupplierPrice.upsert({
          where: { productId_supplierId: { productId: it.productId, supplierId } },
          create: { supplierId, productId: it.productId, importPrice: it.importPrice, exportPrice: it.exportPrice },
          update: { importPrice: it.importPrice, exportPrice: it.exportPrice },
        });
      }
    }
  });

  const result = await prisma.productSupplierPrice.findMany({ where: { supplierId }, include: priceInclude });
  res.json({ items: result });
});
