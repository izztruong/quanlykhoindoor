import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hiệu lực phải có dạng YYYY-MM-DD");

export const priceMilestoneSchema = z.object({
  effectiveFrom: dateOnlySchema,
  sellingPrice: z.coerce.number().nonnegative(),
});

/** Payload của hai đường ghi đồ thành phẩm mà module này tiếp quản để giữ lịch sử giá đồng bộ. */
export const finishedGoodItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  category: z.enum(["TRA", "DAV", "THANH_PHAM"]).optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
});

export const finishedGoodItemBulkSchema = z.object({ items: z.array(finishedGoodItemSchema).min(1) });
