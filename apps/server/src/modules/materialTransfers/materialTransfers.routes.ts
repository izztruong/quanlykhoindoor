import { Router } from "express";
import { prisma } from "../../config/db";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecord } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
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
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = { transferAt: from || to ? { gte: from, lte: to } : undefined };

  const [items, total] = await Promise.all([
    prisma.materialTransfer.findMany({ where, orderBy: { transferAt: "desc" }, skip, take, include: listInclude }),
    prisma.materialTransfer.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

materialTransfersRouter.get("/:id", async (req, res) => {
  const item = await prisma.materialTransfer.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu điều chuyển");
  res.json(item);
});

materialTransfersRouter.post("/", async (req, res) => {
  const data = materialTransferCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

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
      data: items.map((it) => ({
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

// Router đã admin-only toàn bộ (mounted ở app.ts). Phiếu điều chuyển không liên kết trực tiếp tới
// Check Cost — tìm phiếu bị ảnh hưởng dựa trên CẢ quán gửi lẫn quán nhận (mỗi bên đều có thể đã
// dùng phiếu này khi tính Check Cost của họ) + thời điểm điều chuyển TRƯỚC khi sửa.
materialTransfersRouter.put("/:id", async (req, res) => {
  const id = req.params.id as string;
  const data = materialTransferCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const existing = await prisma.materialTransfer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu điều chuyển");

  const affectedCostChecks = await findCostChecksUsingPeriodRecord([existing.fromUserId, existing.toUserId], existing.transferAt);

  const item = await prisma.$transaction(async (tx) => {
    await tx.materialTransferItem.deleteMany({ where: { materialTransferId: id } });

    await tx.materialTransfer.update({
      where: { id },
      data: { fromUserId: data.fromUserId, toUserId: data.toUserId, transferAt: data.transferAt, note: data.note },
    });

    await tx.materialTransferItem.createMany({
      data: items.map((it) => ({
        materialTransferId: id,
        productId: it.productId,
        wholeQuantity: it.wholeQuantity,
        looseQuantity: it.looseQuantity,
        supplierId: it.supplierId,
        costPrice: it.costPrice,
        note: it.note,
      })),
    });

    return tx.materialTransfer.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});
