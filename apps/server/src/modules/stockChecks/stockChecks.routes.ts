import { Router } from "express";
import { prisma } from "../../config/db";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { parseDateRange } from "../../utils/pagination";
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
  const items = await prisma.stockCheck.findMany({
    where: {
      checkedAt: from || to ? { gte: from, lte: to } : undefined,
      // Staff only ever see their own phiếu kiểm; admins see everything, optionally
      // narrowed to one quán via ?createdById= (used by the Check Cost picker).
      createdById: req.user?.role === "ADMIN" ? createdById || undefined : req.user?.id,
    },
    orderBy: { checkedAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json({ items });
});

stockChecksRouter.get("/:id", async (req, res) => {
  const item = await prisma.stockCheck.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu kiểm");
  assertOwnership(item, req.user);
  res.json(item);
});

stockChecksRouter.post("/", async (req, res) => {
  const data = stockCheckCreateSchema.parse(req.body);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.stockCheck.create({
      data: {
        code: generateCode("KT"),
        checkedAt: data.checkedAt,
        note: data.note,
        createdById: req.user?.id,
      },
    });

    if (data.items.length > 0) {
      await tx.stockCheckItem.createMany({
        data: data.items.map((it) => ({
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
