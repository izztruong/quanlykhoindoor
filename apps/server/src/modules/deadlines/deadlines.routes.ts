import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";

export const deadlinesRouter = Router();

const KINDS = ["SALES_ORDER", "STOCK_CHECK_WEEKLY", "STOCK_CHECK_MONTHLY"] as const;

const deadlineUpsertSchema = z.object({
  kind: z.enum(KINDS),
  // 1 = Thứ 2 … 7 = Chủ nhật. Cả hai chỉ có nghĩa với phiếu kiểm tuần.
  weekday: z.coerce.number().int().min(1).max(7).nullable().optional(),
  periodWeekday: z.coerce.number().int().min(1).max(7).nullable().optional(),
  graceDays: z.coerce.number().int().min(0).max(31).default(0),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
});

// Cả nhân viên cũng đọc được: form tạo đơn/phiếu sau này có thể hiện nhắc "hạn nộp 22:00".
// Ghi cần DEADLINES.EDIT, chặn ở từng route bên dưới.
deadlinesRouter.get("/", async (_req, res) => {
  const items = await prisma.deadline.findMany();
  res.json({ items });
});

/**
 * Upsert theo `kind` thay vì POST/PUT tách riêng: mỗi loại chỉ có đúng một dòng (cột `kind` là
 * unique), nên không có khái niệm "thêm dòng mới" — admin chỉ đang sửa 3 quy tắc cố định.
 */
deadlinesRouter.put("/", requirePermission("DEADLINES", "EDIT"), async (req, res) => {
  const data = deadlineUpsertSchema.parse(req.body);
  // Chỉ phiếu kiểm tuần mới cần thứ; hai loại kia lưu null cho khỏi hiểu nhầm là có ý nghĩa.
  const isWeekly = data.kind === "STOCK_CHECK_WEEKLY";
  const values = {
    weekday: isWeekly ? (data.weekday ?? null) : null,
    periodWeekday: isWeekly ? (data.periodWeekday ?? null) : null,
    graceDays: data.graceDays,
    hour: data.hour,
    minute: data.minute,
  };

  const item = await prisma.deadline.upsert({
    where: { kind: data.kind },
    create: { kind: data.kind, ...values },
    update: values,
  });
  res.json(item);
});
