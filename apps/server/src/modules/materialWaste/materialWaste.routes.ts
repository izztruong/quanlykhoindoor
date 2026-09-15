import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecord } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import { materialWasteCreateSchema } from "./materialWaste.schemas";

export const materialWasteRouter = Router();

const detailInclude = {
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true, recipeUnit: true } } } },
  finishedItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

materialWasteRouter.get("/", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = {
    wasteAt: from || to ? { gte: from, lte: to } : undefined,
    // Phạm vi SELF chỉ thấy phiếu huỷ của mình; ALL thấy hết.
    createdById: ownerWhere(req.user),
  };

  const [items, total] = await Promise.all([
    prisma.materialWaste.findMany({
      where,
      orderBy: { wasteAt: "desc" },
      skip,
      take,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.materialWaste.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

materialWasteRouter.get("/:id", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const item = await prisma.materialWaste.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(item, req.user, "Không tìm thấy phiếu huỷ");
  res.json(item);
});

materialWasteRouter.post("/", requirePermission("MATERIAL_WASTE"), async (req, res) => {
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

// Cần MATERIAL_WASTE.EDIT — vai trò "Quán" mặc định không có. Phiếu huỷ không liên kết trực tiếp tới Check Cost (được gộp theo kỳ lúc
// tính), nên tìm phiếu Check Cost bị ảnh hưởng dựa trên quán + thời điểm huỷ TRƯỚC khi sửa —
// số liệu các phiếu đó không tự cập nhật lại, trả về danh sách để frontend báo cho admin.
materialWasteRouter.put("/:id", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const id = req.params.id as string;
  const data = materialWasteCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const existing = await prisma.materialWaste.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(existing, req.user, "Không tìm thấy phiếu huỷ");

  const affectedCostChecks = await findCostChecksUsingPeriodRecord([existing.createdById], existing.wasteAt);

  const item = await prisma.$transaction(async (tx) => {
    await tx.materialWasteItem.deleteMany({ where: { materialWasteId: id } });
    await tx.materialWasteFinishedItem.deleteMany({ where: { materialWasteId: id } });

    await tx.materialWaste.update({ where: { id }, data: { wasteAt: data.wasteAt, note: data.note } });

    if (items.length > 0) {
      await tx.materialWasteItem.createMany({
        data: items.map((it) => ({
          materialWasteId: id,
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
          materialWasteId: id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
        })),
      });
    }

    return tx.materialWaste.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});
