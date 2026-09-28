import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { normalizePosName, suggestFinishedGoods } from "./posItemMappings.service";

export const posItemMappingsRouter = Router();

const mappingsPutSchema = z.object({
  items: z
    .array(
      z.object({
        posNameRaw: z.string().min(1),
        // null = cố ý bỏ qua tên này (phí ship, voucher…). Phải nhận null tường minh chứ không cho
        // bỏ trống trường: bỏ trống dễ là lỗi client, còn null là một lựa chọn người dùng đã bấm.
        finishedGoodItemId: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});

posItemMappingsRouter.get("/", requirePermission("POS_ITEM_MAPPING", "VIEW"), async (_req, res) => {
  const items = await prisma.posItemMapping.findMany({
    orderBy: { posNameRaw: "asc" },
    include: { finishedGoodItem: { select: { id: true, code: true, name: true } } },
  });
  res.json({ items });
});

/**
 * Gợi ý món cho một danh sách tên POS chưa ánh xạ. Nhận nhiều tên một lượt vì trang ánh xạ luôn cần
 * gợi ý cho cả bảng — gọi từng dòng thì với vài trăm món là vài trăm request.
 */
posItemMappingsRouter.post("/suggest", requirePermission("POS_ITEM_MAPPING", "VIEW"), async (req, res) => {
  const { posNames } = z.object({ posNames: z.array(z.string().min(1)).min(1).max(1000) }).parse(req.body);
  const finishedGoods = await prisma.finishedGoodItem.findMany({ select: { id: true, code: true, name: true } });

  const items = posNames.map((posNameRaw) => ({
    posNameRaw,
    suggestions: suggestFinishedGoods(posNameRaw, finishedGoods),
  }));
  res.json({ items });
});

posItemMappingsRouter.put("/", requirePermission("POS_ITEM_MAPPING", "EDIT"), async (req, res) => {
  const { items } = mappingsPutSchema.parse(req.body);

  const finishedGoodIds = [...new Set(items.map((it) => it.finishedGoodItemId).filter((id): id is string => id !== null))];
  if (finishedGoodIds.length > 0) {
    const found = await prisma.finishedGoodItem.findMany({ where: { id: { in: finishedGoodIds } }, select: { id: true } });
    if (found.length !== finishedGoodIds.length) throw new HttpError(400, "Có đồ thành phẩm không tồn tại");
  }

  // Tên đã chuẩn hoá là khoá, nên hai dòng khác nhau về dấu/hoa thường sẽ đụng nhau — dòng sau thắng,
  // giống cách bulk-import của danh mục xử lý mã trùng trong cùng một file.
  const byNormalized = new Map(
    items.map((it) => [normalizePosName(it.posNameRaw), it] as const),
  );

  const operations = [...byNormalized.entries()].map(([posName, it]) =>
    prisma.posItemMapping.upsert({
      where: { posName },
      create: { posName, posNameRaw: it.posNameRaw.trim(), finishedGoodItemId: it.finishedGoodItemId },
      update: { posNameRaw: it.posNameRaw.trim(), finishedGoodItemId: it.finishedGoodItemId },
    }),
  );
  // Gộp một transaction không tương tác: hàng trăm dòng mỗi dòng một round trip là vượt timeout mặc
  // định khi chạy qua Neon (xem chú thích tương tự ở reorderThresholds).
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const result = await prisma.posItemMapping.findMany({
    orderBy: { posNameRaw: "asc" },
    include: { finishedGoodItem: { select: { id: true, code: true, name: true } } },
  });
  res.json({ items: result });
});

posItemMappingsRouter.delete("/:id", requirePermission("POS_ITEM_MAPPING", "EDIT"), async (req, res) => {
  const existing = await prisma.posItemMapping.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy ánh xạ");
  await prisma.posItemMapping.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
