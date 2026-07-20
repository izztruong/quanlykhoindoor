import { z } from "zod";

export const recipeUpdateSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantityPerUnit: z.coerce.number().positive(),
    }),
  ),
});
