import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { can, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { reorderThresholdsPutSchema } from "./reorderThresholds.schemas";

export const reorderThresholdsRouter = Router();

const thresholdInclude = { product: { include: { unit: true, productGroup: true } } };

reorderThresholdsRouter.get("/", async (req, res) => {
  const requestedUserId = (req.query.userId as string) || undefined;
  if (requestedUserId && requestedUserId !== req.user!.id && !can(req.user, "REORDER_THRESHOLDS", "VIEW")) {
    throw new HttpError(403, "Không có quyền xem định lượng của tài khoản khác");
  }
  const userId = requestedUserId || req.user!.id;

  const items = await prisma.productReorderThreshold.findMany({
    where: { userId },
    include: thresholdInclude,
  });
  res.json({ items });
});

reorderThresholdsRouter.put("/", requirePermission("REORDER_THRESHOLDS", "EDIT"), async (req, res) => {
  const { userId, items } = reorderThresholdsPutSchema.parse(req.body);

  // The page always submits every product in the list, so a save with
  // mostly-untouched rows means hundreds of individual deletes/upserts - one
  // round trip apiece blew past Prisma's 5s transaction timeout over Neon's
  // higher latency. Batch the (common, large) delete side into a single
  // query and send everything else as one non-interactive transaction so it
  // runs on one connection instead of one per row.
  // Dòng bị XOÁ = dòng không mang cấu hình nào dùng được: chế độ THRESHOLD mà thiếu min hoặc max.
  // Giữ đúng thói quen cũ "để trống hai ô là gỡ hàng khỏi danh sách". Các chế độ khác thì luôn giữ —
  // FIXED/COVERAGE đã được Zod bắt phải có con số của mình, còn OFF là một lựa chọn tường minh chứ
  // không phải dòng rỗng.
  const isBlankThreshold = (it: (typeof items)[number]) =>
    it.mode === "THRESHOLD" && (it.minQuantity == null || it.maxQuantity == null);
  const toDelete = items.filter(isBlankThreshold);
  const toUpsert = items.filter((it) => !isBlankThreshold(it));

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (toDelete.length > 0) {
    operations.push(
      prisma.productReorderThreshold.deleteMany({
        where: { userId, productId: { in: toDelete.map((it) => it.productId) } },
      }),
    );
  }
  for (const it of toUpsert) {
    // Ghi cả 4 cột kể cả khi chế độ hiện tại không dùng tới: trang này luôn gửi nguyên bảng, nên
    // những ô người dùng đã xoá trên giao diện phải thành null trong DB, không được giữ giá trị cũ.
    const values = {
      mode: it.mode,
      minQuantity: it.minQuantity ?? null,
      maxQuantity: it.maxQuantity ?? null,
      fixedQuantity: it.fixedQuantity ?? null,
      coverDays: it.coverDays ?? null,
    };
    operations.push(
      prisma.productReorderThreshold.upsert({
        where: { userId_productId: { userId, productId: it.productId } },
        create: { userId, productId: it.productId, ...values },
        update: values,
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const result = await prisma.productReorderThreshold.findMany({ where: { userId }, include: thresholdInclude });
  res.json({ items: result });
});
