import { Router } from "express";
import { prisma } from "../../config/db";
import { requireRole } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { reorderThresholdsPutSchema } from "./reorderThresholds.schemas";

export const reorderThresholdsRouter = Router();

const thresholdInclude = { product: { include: { unit: true, productGroup: true } } };

reorderThresholdsRouter.get("/", async (req, res) => {
  const requestedUserId = (req.query.userId as string) || undefined;
  if (requestedUserId && requestedUserId !== req.user!.id && req.user!.role !== "ADMIN") {
    throw new HttpError(403, "Không có quyền xem định lượng của tài khoản khác");
  }
  const userId = requestedUserId || req.user!.id;

  const items = await prisma.productReorderThreshold.findMany({
    where: { userId },
    include: thresholdInclude,
  });
  res.json({ items });
});

reorderThresholdsRouter.put("/", requireRole("ADMIN"), async (req, res) => {
  const { userId, items } = reorderThresholdsPutSchema.parse(req.body);

  await prisma.$transaction(async (tx) => {
    for (const it of items) {
      if (it.minQuantity == null || it.maxQuantity == null) {
        await tx.productReorderThreshold.deleteMany({ where: { userId, productId: it.productId } });
      } else {
        await tx.productReorderThreshold.upsert({
          where: { userId_productId: { userId, productId: it.productId } },
          create: { userId, productId: it.productId, minQuantity: it.minQuantity, maxQuantity: it.maxQuantity },
          update: { minQuantity: it.minQuantity, maxQuantity: it.maxQuantity },
        });
      }
    }
  });

  const result = await prisma.productReorderThreshold.findMany({ where: { userId }, include: thresholdInclude });
  res.json({ items: result });
});
