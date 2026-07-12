import { Router } from "express";
import { prisma } from "../../config/db";
import { generateCode } from "../../utils/codeGenerator";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { HttpError } from "../../utils/httpError";
import { stockExportCreateSchema } from "./stockTransaction.schemas";

export const stockExportsRouter = Router();

const detailInclude = {
  warehouse: true,
  supplier: true,
  customer: true,
  salesOrder: true,
  items: { include: { product: { include: { unit: true, productGroup: true } }, supplier: true } },
};

stockExportsRouter.get("/", async (req, res) => {
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
    prisma.stockExport.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      skip,
      take,
      include: detailInclude,
    }),
    prisma.stockExport.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

stockExportsRouter.get("/:id", async (req, res) => {
  const item = await prisma.stockExport.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu xuất kho");
  res.json(item);
});

stockExportsRouter.post("/", async (req, res) => {
  const data = stockExportCreateSchema.parse(req.body);

  const lineSuppliers = data.items.filter((it): it is typeof it & { supplierId: string } => Boolean(it.supplierId));
  if (lineSuppliers.length > 0) {
    const prices = await prisma.productSupplierPrice.findMany({
      where: {
        OR: lineSuppliers.map((it) => ({ productId: it.productId, supplierId: it.supplierId })),
      },
    });
    const pricedPairs = new Set(prices.map((p) => `${p.productId}:${p.supplierId}`));
    const missing = lineSuppliers.filter((it) => !pricedPairs.has(`${it.productId}:${it.supplierId}`));
    if (missing.length > 0) {
      throw new HttpError(400, "Có hàng hoá chưa được thiết lập giá cho nhà cung cấp đã chọn ở dòng đó");
    }
  }

  const item = await prisma.stockExport.create({
    data: {
      code: generateCode("PX"),
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
          supplierId: it.supplierId,
        })),
      },
    },
    include: detailInclude,
  });

  res.status(201).json(item);
});
