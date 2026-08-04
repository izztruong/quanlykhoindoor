import { Router } from "express";
import { prisma } from "../../config/db";
import type { AuthUser } from "../../middleware/auth";
import { requireRole } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingStockCheck } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import { stockCheckCreateSchema } from "./stockChecks.schemas";

export const stockChecksRouter = Router();

const detailInclude = {
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true } } } },
  finishedItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

function assertOwnership(check: { createdById: string | null }, user?: AuthUser) {
  if (user?.role !== "ADMIN" && check.createdById !== user?.id) {
    throw new HttpError(403, "Bạn không có quyền truy cập phiếu kiểm này");
  }
}

stockChecksRouter.get("/", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { createdById } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = {
    checkedAt: from || to ? { gte: from, lte: to } : undefined,
    // Staff only ever see their own phiếu kiểm; admins see everything, optionally
    // narrowed to one quán via ?createdById= (used by the Check Cost picker).
    createdById: req.user?.role === "ADMIN" ? createdById || undefined : req.user?.id,
  };

  const [items, total] = await Promise.all([
    prisma.stockCheck.findMany({
      where,
      orderBy: { checkedAt: "desc" },
      skip,
      take,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.stockCheck.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

stockChecksRouter.get("/:id", async (req, res) => {
  const item = await prisma.stockCheck.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu kiểm");
  assertOwnership(item, req.user);
  res.json(item);
});

stockChecksRouter.post("/", async (req, res) => {
  const data = stockCheckCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.stockCheck.create({
      data: {
        code: generateCode("KT"),
        checkedAt: data.checkedAt,
        note: data.note,
        createdById: req.user?.id,
      },
    });

    if (items.length > 0) {
      await tx.stockCheckItem.createMany({
        data: items.map((it) => ({
          stockCheckId: created.id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          note: it.note,
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.stockCheckFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          stockCheckId: created.id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
        })),
      });
    }

    return tx.stockCheck.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  res.status(201).json(item);
});

// Chỉ admin được sửa — phiếu này vốn là "log bất biến" (xem ghi chú trên model StockCheck),
// cho phép sửa để chữa lỗi nhập liệu, nhưng phiếu Check Cost nào đã dùng phiếu này làm mốc thì
// SỐ LIỆU CỦA PHIẾU ĐÓ KHÔNG TỰ CẬP NHẬT LẠI (Check Cost chốt cứng lúc tạo) — trả về danh sách
// các phiếu Check Cost bị ảnh hưởng để frontend báo cho admin tự tạo lại nếu cần.
stockChecksRouter.put("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = req.params.id as string;
  const data = stockCheckCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const existing = await prisma.stockCheck.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu kiểm");

  const affectedCostChecks = await findCostChecksUsingStockCheck(id);

  const item = await prisma.$transaction(async (tx) => {
    await tx.stockCheckItem.deleteMany({ where: { stockCheckId: id } });
    await tx.stockCheckFinishedItem.deleteMany({ where: { stockCheckId: id } });

    await tx.stockCheck.update({
      where: { id },
      data: { checkedAt: data.checkedAt, note: data.note },
    });

    if (items.length > 0) {
      await tx.stockCheckItem.createMany({
        data: items.map((it) => ({
          stockCheckId: id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          note: it.note,
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.stockCheckFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          stockCheckId: id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
        })),
      });
    }

    return tx.stockCheck.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});
