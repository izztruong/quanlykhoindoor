import { z } from "zod";

export const costCheckCreateSchema = z.object({
  userId: z.string().min(1),
  openingStockCheckId: z.string().min(1),
  closingStockCheckId: z.string().min(1),
  note: z.string().optional(),
  discountTra: z.coerce.number().nonnegative().optional(),
  discountDav: z.coerce.number().nonnegative().optional(),
  soldItems: z
    .array(
      z.object({
        finishedGoodItemId: z.string().min(1),
        quantitySold: z.coerce.number().nonnegative(),
      }),
    )
    .min(1, "Cần ít nhất 1 dòng đồ thành phẩm/món đã bán"),
});
