import { z } from "zod";

export const inventoryCountCreateSchema = z.object({
  warehouseId: z.string().min(1),
  countDate: z.coerce.date(),
  note: z.string().optional(),
});

export const inventoryCountItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        actualQuantity: z.coerce.number().nonnegative(),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

export const inventoryCountStatusSchema = z.object({
  status: z.literal("CANCELLED"),
});
