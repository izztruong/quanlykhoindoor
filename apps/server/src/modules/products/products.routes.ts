import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  productGroupId: z.string().min(1),
  costPrice: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
  // Quy đổi cho công thức Check Cost: 1 đơn vị chính = recipeUnitsPerBaseUnit recipeUnit (vd 1 Hộp = 1000 Gram).
  recipeUnitId: z.string().optional(),
  recipeUnitsPerBaseUnit: z.coerce.number().positive().optional(),
  // Dùng để gộp chi phí Check Cost — 5 giá trị cố định.
  type: z.enum(["NVL", "COC_TAKE", "BANH", "DUNG_CU", "KHAC"]).default("NVL"),
});

export const productsRouter = createCrudRouter(prisma.product, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true, productGroup: true, recipeUnit: true },
  writeRoles: ["ADMIN"],
  bulkImportKey: "code",
  filterFields: ["productGroupId", "type"],
});
