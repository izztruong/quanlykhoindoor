import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const productGroupsRouter = createCrudRouter(prisma.productGroup, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name"],
  bulkImportKey: "code",
});
