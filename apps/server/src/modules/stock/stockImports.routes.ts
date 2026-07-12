import { Router } from "express";
import { prisma } from "../../config/db";
import { generateCode } from "../../utils/codeGenerator";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { HttpError } from "../../utils/httpError";
import { stockImportCreateSchema } from "./stockTransaction.schemas";

export const stockImportsRouter = Router();

const detailInclude = {
  warehouse: true,
  supplier: true,
  customer: true,
  items: { include: { product: { include: { unit: true, productGroup: true } } } },
};

stockImportsRouter.get("/", async (req, res) => {
  const { warehouseId, status, type } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouseId: warehouseId || undefined,
    status: (status || undefined) as any,
    type: (type || undefined) as any,
    transactionAt: from || to ? { gte: from, lte: to } : undefined,
  };

  const [items, total] = await Promise.all([
    prisma.stockImport.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      skip,
      take,
      include: detailInclude,
    }),
    prisma.stockImport.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

stockImportsRouter.get("/:id", async (req, res) => {
  const item = await prisma.stockImport.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu nhập kho");
  res.json(item);
});

stockImportsRouter.post("/", async (req, res) => {
  const data = stockImportCreateSchema.parse(req.body);

  if (data.supplierId) {
    const prices = await prisma.productSupplierPrice.findMany({
      where: { supplierId: data.supplierId, productId: { in: data.items.map((it) => it.productId) } },
      include: { product: true },
    });
    const pricedProductIds = new Set(prices.map((p) => p.productId));
    const missing = data.items.filter((it) => !pricedProductIds.has(it.productId));
    if (missing.length > 0) {
      throw new HttpError(400, "Có hàng hoá chưa được thiết lập giá cho nhà cung cấp này");
    }
  }

  const item = await prisma.stockImport.create({
    data: {
      code: generateCode("PN"),
      type: data.type,
      transactionAt: data.transactionAt,
      form: data.form,
      status: data.status,
      note: data.note,
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      customerId: data.customerId,
      createdById: req.user?.id,
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          costPrice: it.costPrice,
          costAmount: it.quantity * it.costPrice,
          note: it.note,
        })),
      },
    },
    include: detailInclude,
  });

  res.status(201).json(item);
});
