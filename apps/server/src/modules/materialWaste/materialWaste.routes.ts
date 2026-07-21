import { Router } from "express";
import { prisma } from "../../config/db";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { parseDateRange } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import { materialWasteCreateSchema } from "./materialWaste.schemas";

export const materialWasteRouter = Router();

const detailInclude = {
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true, recipeUnit: true } } } },
  finishedItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

function assertOwnership(waste: { createdById: string | null }, user?: AuthUser) {
  if (user?.role !== "ADMIN" && waste.createdById !== user?.id) {
    throw new HttpError(403, "Bạn không có quyền truy cập phiếu huỷ này");
  }
}

materialWasteRouter.get("/", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const items = await prisma.materialWaste.findMany({
    where: {
      wasteAt: from || to ? { gte: from, lte: to } : undefined,
      // Staff only ever see their own phiếu huỷ; admins see everything.
      createdById: req.user?.role === "ADMIN" ? undefined : req.user?.id,
    },
    orderBy: { wasteAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json({ items });
});

materialWasteRouter.get("/:id", async (req, res) => {
  const item = await prisma.materialWaste.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwnership(item, req.user);
  res.json(item);
});

materialWasteRouter.post("/", async (req, res) => {
  const data = materialWasteCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.materialWaste.create({
      data: { code: generateCode("PH"), wasteAt: data.wasteAt, note: data.note, createdById: req.user?.id },
    });

    if (items.length > 0) {
      await tx.materialWasteItem.createMany({
        data: items.map((it) => ({
          materialWasteId: created.id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          note: it.note,
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.materialWasteFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          materialWasteId: created.id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
        })),
      });
    }

    return tx.materialWaste.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  res.status(201).json(item);
});
