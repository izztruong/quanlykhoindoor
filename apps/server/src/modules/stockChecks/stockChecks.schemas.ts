import { z } from "zod";

const materialItemSchema = z.object({
  productId: z.string().min(1),
  wholeQuantity: z.coerce.number().nonnegative().optional(),
  looseQuantity: z.coerce.number().nonnegative().optional(),
  // Đơn giá chốt lúc kiểm — wholePrice theo đơn vị chính, loosePrice theo đơn vị công thức.
  wholePrice: z.coerce.number().nonnegative().optional(),
  loosePrice: z.coerce.number().nonnegative().optional(),
  note: z.string().optional(),
});

const finishedItemSchema = z.object({
  finishedGoodItemId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
  price: z.coerce.number().nonnegative().optional(),
  note: z.string().optional(),
});

export const stockCheckCreateSchema = z
  .object({
    checkedAt: z.coerce.date().default(() => new Date()),
    note: z.string().optional(),
    items: z.array(materialItemSchema).default([]),
    finishedItems: z.array(finishedItemSchema).default([]),
  })
  .refine((data) => data.items.length > 0 || data.finishedItems.length > 0, {
    message: "Cần ít nhất 1 dòng nguyên liệu hoặc đồ thành phẩm",
    path: ["items"],
  });
