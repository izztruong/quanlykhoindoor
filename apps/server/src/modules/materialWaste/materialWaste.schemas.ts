import { z } from "zod";

const materialItemSchema = z.object({
  productId: z.string().min(1),
  wholeQuantity: z.coerce.number().nonnegative().optional(),
  looseQuantity: z.coerce.number().nonnegative().optional(),
  note: z.string().optional(),
  // Chỉ có hiệu lực với người có MATERIAL_WASTE.DEDUCT — route tự bỏ qua với người khác.
  deductInCostCheck: z.boolean().optional(),
});

const finishedItemSchema = z.object({
  finishedGoodItemId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  note: z.string().optional(),
  deductInCostCheck: z.boolean().optional(),
});

export const materialWasteCreateSchema = z
  .object({
    wasteAt: z.coerce.date().default(() => new Date()),
    note: z.string().optional(),
    items: z.array(materialItemSchema).default([]),
    finishedItems: z.array(finishedItemSchema).default([]),
  })
  .refine((data) => data.items.length > 0 || data.finishedItems.length > 0, {
    message: "Cần ít nhất 1 dòng nguyên liệu hoặc đồ thành phẩm",
    path: ["items"],
  })
  .refine((data) => data.items.every((it) => it.wholeQuantity != null || it.looseQuantity != null), {
    message: "Mỗi dòng nguyên liệu cần ít nhất 1 trong 2 số lượng (chẵn/lẻ)",
    path: ["items"],
  });

const deductionSchema = z.object({ id: z.string().min(1), deductInCostCheck: z.boolean() });

// Đổi riêng ô tích "trừ trong Check Cost" của từng dòng, không đụng tới số lượng.
export const materialWasteDeductionsSchema = z.object({
  items: z.array(deductionSchema).default([]),
  finishedItems: z.array(deductionSchema).default([]),
});
