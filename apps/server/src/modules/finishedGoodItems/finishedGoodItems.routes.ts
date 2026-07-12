import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
});

export const finishedGoodItemsRouter = createCrudRouter(prisma.finishedGoodItem, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true },
  writeRoles: ["ADMIN"],
  bulkImportKey: "code",
});
