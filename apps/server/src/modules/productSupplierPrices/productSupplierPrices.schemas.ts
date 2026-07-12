import { z } from "zod";

export const productSupplierPricesPutSchema = z.object({
  supplierId: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      importPrice: z.coerce.number().nonnegative().nullable().optional(),
      exportPrice: z.coerce.number().nonnegative().nullable().optional(),
    }),
  ),
});
