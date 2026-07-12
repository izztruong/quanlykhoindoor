import { z } from "zod";

export const reorderThresholdsPutSchema = z.object({
  userId: z.string().min(1),
  items: z.array(
    z
      .object({
        productId: z.string().min(1),
        minQuantity: z.coerce.number().nonnegative().nullable().optional(),
        maxQuantity: z.coerce.number().nonnegative().nullable().optional(),
      })
      .refine((data) => data.minQuantity == null || data.maxQuantity == null || data.maxQuantity >= data.minQuantity, {
        message: "Định lượng tối đa phải lớn hơn hoặc bằng định lượng tối thiểu",
        path: ["maxQuantity"],
      }),
  ),
});
