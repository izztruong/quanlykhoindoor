import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  productGroupId: z.string().min(1),
  costPrice: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
});

export const productsRouter = createCrudRouter(prisma.product, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true, productGroup: true },
  writeRoles: ["ADMIN"],
  bulkImportKey: "code",
});
