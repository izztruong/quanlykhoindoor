import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  // Đơn từ ngưỡng này trở lên thì NCC miễn ship. Null = NCC không có chính sách đó. Ship tính theo TỪNG
  // QUÁN nên ngưỡng áp cho mỗi (quán × NCC) — xem màn gợi ý gom đơn của admin.
  freeShipThreshold: z.coerce.number().nonnegative().nullable().optional(),
});

export const suppliersRouter = createCrudRouter(prisma.supplier, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name", "phone"],
  resource: "SUPPLIERS",
  publicRead: true,
  bulkImportKey: "code",
});
