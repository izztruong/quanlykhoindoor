import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";

export const orderScheduleRouter = Router();

/**
 * Thay CẢ lịch bằng danh sách gửi lên, không thêm/bớt từng ngày: giao diện là 7 ô tick nên luôn biết
 * trạng thái đầy đủ, và cách này không có trạng thái trung gian nào để lệch.
 *
 * Cho phép mảng rỗng (bỏ hết ngày gọi) — lúc đó phần gợi ý nói rõ "chưa khai lịch gọi" chứ không đoán.
 */
const orderSchedulePutSchema = z.object({
  // 1 = Thứ 2 … 7 = Chủ nhật (ISO-8601), khớp Deadline.weekday.
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7),
});

// Chỉ cần đăng nhập, giống GET /api/deadlines: trang Order nhanh của quán phải đọc lịch để tính số ngày
// cần phủ. Ghi thì cần ORDER_SCHEDULE.EDIT.
orderScheduleRouter.get("/", async (_req, res) => {
  const items = await prisma.orderScheduleDay.findMany({ orderBy: { weekday: "asc" } });
  res.json({ weekdays: items.map((it) => it.weekday) });
});

orderScheduleRouter.put("/", requirePermission("ORDER_SCHEDULE", "EDIT"), async (req, res) => {
  const { weekdays } = orderSchedulePutSchema.parse(req.body);
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);

  // Xoá rồi chèn trong một transaction: bảng chỉ có 7 dòng nên không cần tính hiệu, và làm cả hai trong
  // một transaction thì không có khoảnh khắc nào lịch rỗng giữa chừng khiến một request song song đọc
  // được trạng thái "chưa khai lịch gọi".
  await prisma.$transaction([
    prisma.orderScheduleDay.deleteMany({}),
    prisma.orderScheduleDay.createMany({ data: unique.map((weekday) => ({ weekday })) }),
  ]);

  res.json({ weekdays: unique });
});
