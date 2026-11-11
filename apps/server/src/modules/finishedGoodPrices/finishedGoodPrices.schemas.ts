import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hiệu lực phải có dạng YYYY-MM-DD");

export const priceMilestoneSchema = z.object({
  effectiveFrom: dateOnlySchema,
  sellingPrice: z.coerce.number().nonnegative(),
  /**
   * Quán được khai giá RIÊNG. Bỏ trống / null = mốc giá CHUNG, áp cho mọi quán chưa có giá riêng.
   *
   * Để OPTIONAL có chủ ý: bản mobile đã phát hành không gửi trường này, bắt buộc là app cũ hỏng.
   */
  shopUserId: z.string().min(1).nullable().optional(),
});

/** Payload của hai đường ghi đồ thành phẩm mà module này tiếp quản để giữ lịch sử giá đồng bộ. */
export const finishedGoodItemSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  category: z.enum(["TRA", "DAV", "THANH_PHAM"]).optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
  // PHẢI giữ khớp `finishedGoodItems.routes.ts`: route PUT /:id và bulk-import của đồ thành phẩm đi qua
  // schema NÀY chứ không qua schema bên đó, nên trường nào chỉ thêm ở bên kia sẽ bị Zod gạt lặng lẽ —
  // trả 200 mà không lưu (đã xảy ra với chính trường này lúc mới thêm).
  // `.nullish()`: giao diện gửi `null` để gỡ VAT đã khai về chưa khai.
  vatPercent: z.coerce.number().min(0).max(999.99).nullish(),
});

export const finishedGoodItemBulkSchema = z.object({ items: z.array(finishedGoodItemSchema).min(1) });
