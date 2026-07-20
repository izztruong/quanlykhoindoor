import { Router } from "express";
import { prisma } from "../../config/db";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { parseDateRange } from "../../utils/pagination";
import { materialTransferCreateSchema } from "./materialTransfers.schemas";

// Mounted under requireRole("ADMIN") in app.ts — chỉ admin tạo/xem, không có bước quán nhận xác nhận.
export const materialTransfersRouter = Router();

const listInclude = {
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

const detailInclude = {
  ...listInclude,
  items: { include: { product: { include: { unit: true, recipeUnit: true } }, supplier: true } },
};

materialTransfersRouter.get("/", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const items = await prisma.materialTransfer.findMany({
    where: { transferAt: from || to ? { gte: from, lte: to } : undefined },
    orderBy: { transferAt: "desc" },
    include: listInclude,
  });
  res.json({ items });
});

materialTransfersRouter.get("/:id", async (req, res) => {
  const item = await prisma.materialTransfer.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu điều chuyển");
  res.json(item);
});

materialTransfersRouter.post("/", async (req, res) => {
  const data = materialTransferCreateSchema.parse(req.body);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.materialTransfer.create({
      data: {
        code: generateCode("DC"),
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        transferAt: data.transferAt,
        note: data.note,
        createdById: req.user?.id,
      },
    });

    await tx.materialTransferItem.createMany({
      data: data.items.map((it) => ({
        materialTransferId: created.id,
        productId: it.productId,
        wholeQuantity: it.wholeQuantity,
        looseQuantity: it.looseQuantity,
        supplierId: it.supplierId,
        costPrice: it.costPrice,
        note: it.note,
      })),
    });

    return tx.materialTransfer.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  res.status(201).json(item);
});
