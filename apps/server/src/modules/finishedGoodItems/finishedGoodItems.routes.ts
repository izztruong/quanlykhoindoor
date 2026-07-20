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
});

export const finishedGoodItemsRouter = createCrudRouter(prisma.finishedGoodItem, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true },
  writeRoles: ["ADMIN"],
  bulkImportKey: "code",
});
