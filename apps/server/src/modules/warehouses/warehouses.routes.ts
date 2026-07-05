import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
});

export const warehousesRouter = createCrudRouter(prisma.warehouse, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name"],
  writeRoles: ["ADMIN"],
});
