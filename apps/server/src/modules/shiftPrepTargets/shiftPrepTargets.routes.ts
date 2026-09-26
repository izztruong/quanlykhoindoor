import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { can, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { shiftPrepTargetsPutSchema } from "./shiftPrepTargets.schemas";

export const shiftPrepTargetsRouter = Router();

const targetInclude = { finishedGoodItem: { include: { unit: true } } };

/**
 * Mức chuẩn bị theo quán × món × ca — bản song số của `reorderThresholds`, kể cả cơ chế PUT cả danh sách.
 *
 * GET mở cho người đã đăng nhập đọc CHÍNH MÌNH (giống `reorderThresholds`): màn Chuẩn bị ca của quán phải
 * đọc được mức của mình mới hiện đúng đề xuất. Đọc của quán khác thì cần quyền.
 */
shiftPrepTargetsRouter.get("/", async (req, res) => {
  const requestedUserId = (req.query.userId as string) || undefined;
  if (requestedUserId && requestedUserId !== req.user!.id && !can(req.user, "SHIFT_PREP_TARGETS", "VIEW")) {
    throw new HttpError(403, "Không có quyền xem mức chuẩn bị của tài khoản khác");
  }
  const userId = requestedUserId || req.user!.id;
  const items = await prisma.shiftPrepTarget.findMany({ where: { userId }, include: targetInclude });
  res.json({ items });
});

shiftPrepTargetsRouter.put("/", requirePermission("SHIFT_PREP_TARGETS", "EDIT"), async (req, res) => {
  const { userId, items } = shiftPrepTargetsPutSchema.parse(req.body);

  // Cùng cách gộp ghi như reorderThresholds: trang gửi nguyên bảng (món × 3 ca) nên vài trăm dòng một
  // lượt là chuyện thường, và mỗi dòng một round trip qua Neon sẽ vượt hạn 5 giây mặc định.
  //
  // Dòng bị XOÁ = chế độ TARGET_LEVEL mà mức mục tiêu để trống. Zod đã chặn trường hợp này nên thực tế
  // không xảy ra, nhưng giữ nhánh xoá để "gỡ khỏi danh sách" vẫn làm được khi client gửi mode khác.
  const operations: Prisma.PrismaPromise<unknown>[] = [];
  for (const it of items) {
    const values = { mode: it.mode, targetLevel: it.targetLevel ?? null };
    operations.push(
      prisma.shiftPrepTarget.upsert({
        where: {
          userId_finishedGoodItemId_shift: { userId, finishedGoodItemId: it.finishedGoodItemId, shift: it.shift },
        },
        create: { userId, finishedGoodItemId: it.finishedGoodItemId, shift: it.shift, ...values },
        update: values,
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const result = await prisma.shiftPrepTarget.findMany({ where: { userId }, include: targetInclude });
  res.json({ items: result });
});

/** Gỡ hẳn một (món × ca) khỏi danh sách — trở về mặc định TARGET_LEVEL chưa khai. */
shiftPrepTargetsRouter.delete("/", requirePermission("SHIFT_PREP_TARGETS", "EDIT"), async (req, res) => {
  const { userId, finishedGoodItemId, shift } = req.query as Record<string, string>;
  if (!userId || !finishedGoodItemId || !shift) throw new HttpError(400, "Thiếu userId / finishedGoodItemId / shift");
  await prisma.shiftPrepTarget.deleteMany({ where: { userId, finishedGoodItemId, shift: shift as "CA1" | "CA2" | "CA3" } });
  res.status(204).end();
});
