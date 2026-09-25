import { z } from "zod";

const MODES = ["THRESHOLD", "FIXED", "COVERAGE", "OFF"] as const;

/**
 * Một dòng định lượng. Cột nào bắt buộc phụ thuộc `mode`, nên ràng buộc ép ở đây chứ không ở DB:
 * đổi chế độ KHÔNG được xoá con số của chế độ cũ (người dùng còn bật lại), nên mọi cột đều nullable
 * ở tầng Prisma và chỉ cột của chế độ đang chọn bị đòi.
 */
const thresholdItemSchema = z
  .object({
    productId: z.string().min(1),
    // Bỏ trống = THRESHOLD, để payload cũ (chưa biết tới mode) vẫn chạy y như trước.
    mode: z.enum(MODES).default("THRESHOLD"),
    minQuantity: z.coerce.number().nonnegative().nullable().optional(),
    maxQuantity: z.coerce.number().nonnegative().nullable().optional(),
    fixedQuantity: z.coerce.number().nonnegative().nullable().optional(),
    coverDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
  })
  .refine((data) => data.minQuantity == null || data.maxQuantity == null || data.maxQuantity >= data.minQuantity, {
    message: "Định lượng tối đa phải lớn hơn hoặc bằng định lượng tối thiểu",
    path: ["maxQuantity"],
  })
  .refine((data) => data.mode !== "FIXED" || (data.fixedQuantity != null && data.fixedQuantity > 0), {
    message: "Chế độ gọi cố định cần SL mỗi lần gọi lớn hơn 0",
    path: ["fixedQuantity"],
  })
  .refine((data) => data.mode !== "COVERAGE" || data.coverDays != null, {
    message: "Chế độ đủ dùng N ngày cần khai số ngày cần phủ",
    path: ["coverDays"],
  });

export const reorderThresholdsPutSchema = z.object({
  userId: z.string().min(1),
  items: z.array(thresholdItemSchema),
});
