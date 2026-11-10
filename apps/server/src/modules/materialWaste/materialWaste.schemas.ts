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

/** Tối đa 5 ảnh mỗi phiếu huỷ — cùng mức với khoản chi và phiếu nhập kho. */
export const MAX_IMAGES_PER_WASTE = 5;

/** Trình duyệt/app đã nén xuống ~200 KB trước khi gửi, 1,5 MB là trần rộng rãi cho ảnh lọt lưới nén. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const materialWasteImageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        contentType: z.enum(IMAGE_CONTENT_TYPES, { message: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" }),
        // Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64,".
        dataBase64: z.string().min(1, "Ảnh rỗng"),
      }),
    )
    .min(1, "Chưa chọn ảnh nào")
    .max(MAX_IMAGES_PER_WASTE, `Mỗi phiếu huỷ tối đa ${MAX_IMAGES_PER_WASTE} ảnh`),
});
