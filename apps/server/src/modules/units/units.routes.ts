import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const unitsRouter = createCrudRouter(prisma.unit, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name"],
  bulkImportKey: "code",
});
