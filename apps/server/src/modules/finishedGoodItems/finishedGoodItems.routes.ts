import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  // TRA/DAV dùng tách doanh thu/chi phí trong Check Cost; THANH_PHAM là vật tư/đồ pha
  // sẵn cần kiểm kê vật lý (không tính doanh thu). Giá bán dùng tính doanh thu.
  category: z.enum(["TRA", "DAV", "THANH_PHAM"]).optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),

  // Ba cột cho phần Chuẩn bị ca. Đều nullable để form gỡ được giá trị đã khai (CatalogPage gửi null khi
  // ô để trống, nhờ cờ clearable) — khai xong không gỡ được là lỗi đã gặp với shelfLifeDays.
  prepared: z.boolean().optional(),
  batchSize: z.coerce.number().positive().nullable().optional(),
  // Chặn trên 2160 giờ (90 ngày): quá đó thì người dùng đang gõ nhầm đơn vị ngày thành giờ.
  shelfLifeHours: z.coerce.number().int().positive().max(2160).nullable().optional(),
});

export const finishedGoodItemsRouter = createCrudRouter(prisma.finishedGoodItem, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true },
  resource: "FINISHED_GOODS",
  publicRead: true,
  bulkImportKey: "code",
});
