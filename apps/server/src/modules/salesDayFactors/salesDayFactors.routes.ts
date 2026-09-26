import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

/**
 * Hệ số ngày lễ tết. Thuần danh mục nên dùng crudFactory, không tự viết router.
 *
 * `date` nhận "YYYY-MM-DD" rồi ép về giữa trưa UTC — cột là `@db.Date` nên phần giờ bị bỏ, nhưng đi qua
 * 00:00 UTC thì bất kỳ phép đổi múi giờ nào cũng có thể lùi sang ngày hôm trước. Cùng lý do và cùng cách
 * làm với `parseDateOnly` của module posSales.
 */
const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
    .transform((value) => new Date(`${value}T12:00:00.000Z`)),
  // 0 là hợp lệ (đóng cửa cả ngày); giới hạn trên 10 chỉ để chặn gõ nhầm thêm số 0.
  factor: z.coerce.number().min(0).max(10),
  note: z.string().optional(),
});

export const salesDayFactorsRouter = createCrudRouter(prisma.salesDayFactor, {
  createSchema: schema,
  updateSchema: schema.partial(),
  resource: "SALES_DAY_FACTORS",
  // Ngày gần nhất lên đầu: người dùng vào đây để khai lễ sắp tới, không phải để đọc lịch sử.
  orderBy: { date: "desc" },
  // Màn Chuẩn bị ca của quán phải đọc được hệ số mới hiện đúng dự báo — cùng ngoại lệ với khung giờ ca.
  publicRead: true,
});
