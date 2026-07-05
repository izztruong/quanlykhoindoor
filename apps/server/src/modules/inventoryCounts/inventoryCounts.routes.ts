import { Router } from "express";
import { prisma } from "../../config/db";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { parseDateRange } from "../../utils/pagination";
import { inventoryCountCreateSchema, inventoryCountItemsSchema, inventoryCountStatusSchema } from "./inventoryCounts.schemas";

export const inventoryCountsRouter = Router();

inventoryCountsRouter.get("/", async (req, res) => {
  const { warehouseId } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const items = await prisma.inventoryCount.findMany({
    where: {
      warehouseId: warehouseId || undefined,
      countDate: from || to ? { gte: from, lte: to } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: { warehouse: true, createdBy: { select: { id: true, name: true } } },
  });
  res.json({ items });
});

inventoryCountsRouter.get("/:id", async (req, res) => {
  const item = await prisma.inventoryCount.findUnique({
    where: { id: req.params.id },
    include: {
      warehouse: true,
      createdBy: { select: { id: true, name: true } },
      items: { include: { product: { include: { unit: true, productGroup: true } } } },
    },
  });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê");
  res.json(item);
});

inventoryCountsRouter.post("/", async (req, res) => {
  const data = inventoryCountCreateSchema.parse(req.body);
  const item = await prisma.inventoryCount.create({
    data: {
      code: generateCode("KK"),
      warehouseId: data.warehouseId,
      countDate: data.countDate,
      note: data.note,
      createdById: req.user?.id,
    },
  });
  res.status(201).json(item);
});

inventoryCountsRouter.put("/:id/items", async (req, res) => {
  const { items } = inventoryCountItemsSchema.parse(req.body);

  await prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findUnique({ where: { id: req.params.id } });
    if (!count) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê");
    if (count.status !== "DRAFT") throw new HttpError(400, "Phiếu đã lưu số liệu hoặc đã huỷ, không thể chỉnh sửa");

    for (const it of items) {
      await tx.inventoryCountItem.upsert({
        where: { inventoryCountId_productId: { inventoryCountId: req.params.id, productId: it.productId } },
        create: { inventoryCountId: req.params.id, productId: it.productId, actualQuantity: it.actualQuantity, note: it.note },
        update: { actualQuantity: it.actualQuantity, note: it.note },
      });
    }

    await tx.inventoryCount.update({ where: { id: req.params.id }, data: { status: "COMPLETED" } });
  });

  const item = await prisma.inventoryCount.findUnique({ where: { id: req.params.id }, include: { items: true } });
  res.json(item);
});

inventoryCountsRouter.delete("/:id/items/:itemId", async (req, res) => {
  const count = await prisma.inventoryCount.findUnique({ where: { id: req.params.id } });
  if (!count) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê");
  if (count.status !== "DRAFT") throw new HttpError(400, "Phiếu đã lưu số liệu hoặc đã huỷ, không thể chỉnh sửa");

  await prisma.inventoryCountItem.delete({ where: { id: req.params.itemId } });
  res.status(204).send();
});

inventoryCountsRouter.patch("/:id/status", async (req, res) => {
  const { status } = inventoryCountStatusSchema.parse(req.body);
  const count = await prisma.inventoryCount.findUnique({ where: { id: req.params.id } });
  if (!count) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê");
  if (count.status === "CANCELLED") throw new HttpError(400, "Phiếu đã được huỷ");

  const updated = await prisma.inventoryCount.update({ where: { id: req.params.id }, data: { status } });
  res.json(updated);
});
