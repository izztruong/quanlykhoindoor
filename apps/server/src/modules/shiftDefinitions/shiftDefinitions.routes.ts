import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";

export const shiftDefinitionsRouter = Router();

const CODES = ["CA1", "CA2", "CA3"] as const;

/**
 * Giờ nhận bằng HAI SỐ NGUYÊN (giờ, phút) chứ không phải một chuỗi thời gian — cùng lý do đã ghi ở
 * model Deadline: mốc giờ đi qua ô `datetime-local` rồi lưu lại sẽ bị trừ dần phần lệch múi giờ mỗi
 * lần lưu, tức "22:00" tụt thành 15:00 rồi 08:00.
 */
const shiftUpsertSchema = z.object({
  code: z.enum(CODES),
  name: z.string().min(1, "Cần tên ca"),
  startHour: z.coerce.number().int().min(0).max(23),
  startMinute: z.coerce.number().int().min(0).max(59),
  endHour: z.coerce.number().int().min(0).max(23),
  endMinute: z.coerce.number().int().min(0).max(59),
});

// Chỉ cần đăng nhập, giống GET /api/deadlines: form chuẩn bị ca và màn nhập doanh số của quán phải
// đọc được khung giờ mới hiện đúng tên ca. Ghi thì cần SHIFT_DEFINITIONS.EDIT.
shiftDefinitionsRouter.get("/", async (_req, res) => {
  const items = await prisma.shiftDefinition.findMany({ orderBy: { code: "asc" } });
  res.json({ items });
});

/**
 * Upsert theo `code` thay vì POST/PUT tách riêng: đúng ba ca cố định, cột `code` là unique, nên không
 * có khái niệm "thêm ca mới" — admin chỉ đang sửa ba dòng có sẵn. Giống hệt cách bảng Deadline làm.
 *
 * KHÔNG kiểm tra ba ca có phủ kín 24 giờ hay có chồng nhau: quán đóng cửa ban đêm nên khoảng trống là
 * bình thường, và `endHour < startHour` là ca qua nửa đêm chứ không phải lỗi nhập.
 */
shiftDefinitionsRouter.put("/", requirePermission("SHIFT_DEFINITIONS", "EDIT"), async (req, res) => {
  const data = shiftUpsertSchema.parse(req.body);
  const values = {
    name: data.name,
    startHour: data.startHour,
    startMinute: data.startMinute,
    endHour: data.endHour,
    endMinute: data.endMinute,
  };

  const item = await prisma.shiftDefinition.upsert({
    where: { code: data.code },
    create: { code: data.code, ...values },
    update: values,
  });
  res.json(item);
});
