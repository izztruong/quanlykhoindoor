import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const suppliersRouter = createCrudRouter(prisma.supplier, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name", "phone"],
});
