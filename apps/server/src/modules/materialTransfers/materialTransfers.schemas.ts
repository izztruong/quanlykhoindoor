import { z } from "zod";

export const materialTransferCreateSchema = z
  .object({
    fromUserId: z.string().min(1),
    toUserId: z.string().min(1),
    transferAt: z.coerce.date().default(() => new Date()),
    note: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          wholeQuantity: z.coerce.number().nonnegative().optional(),
          looseQuantity: z.coerce.number().nonnegative().optional(),
          supplierId: z.string().min(1).optional(),
          costPrice: z.coerce.number().nonnegative().optional(),
          note: z.string().optional(),
        }),
      )
      .min(1, "Cần ít nhất 1 dòng nguyên liệu"),
  })
  .refine((data) => data.fromUserId !== data.toUserId, {
    message: "Quán gửi và quán nhận phải khác nhau",
    path: ["toUserId"],
  })
  .refine((data) => data.items.every((it) => it.wholeQuantity != null || it.looseQuantity != null), {
    message: "Mỗi dòng cần ít nhất 1 trong 2 số lượng (chẵn/lẻ)",
    path: ["items"],
  });
