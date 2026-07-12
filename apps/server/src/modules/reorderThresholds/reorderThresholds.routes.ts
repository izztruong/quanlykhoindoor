import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
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

  // The page always submits every product in the list, so a save with
  // mostly-untouched rows means hundreds of individual deletes/upserts - one
  // round trip apiece blew past Prisma's 5s transaction timeout over Neon's
  // higher latency. Batch the (common, large) delete side into a single
  // query and send everything else as one non-interactive transaction so it
  // runs on one connection instead of one per row.
  const toDelete = items.filter((it) => it.minQuantity == null || it.maxQuantity == null);
  const toUpsert = items.filter((it) => it.minQuantity != null && it.maxQuantity != null);

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (toDelete.length > 0) {
    operations.push(
      prisma.productReorderThreshold.deleteMany({
        where: { userId, productId: { in: toDelete.map((it) => it.productId) } },
      }),
    );
  }
  for (const it of toUpsert) {
    operations.push(
      prisma.productReorderThreshold.upsert({
        where: { userId_productId: { userId, productId: it.productId } },
        create: { userId, productId: it.productId, minQuantity: it.minQuantity!, maxQuantity: it.maxQuantity! },
        update: { minQuantity: it.minQuantity!, maxQuantity: it.maxQuantity! },
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const result = await prisma.productReorderThreshold.findMany({ where: { userId }, include: thresholdInclude });
  res.json({ items: result });
});
