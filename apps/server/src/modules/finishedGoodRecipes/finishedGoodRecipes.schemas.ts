import { z } from "zod";

/** "YYYY-MM-DD" — cột `effectiveFrom` là `@db.Date` nên chỉ nhận ngày, không nhận mốc có giờ. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hiệu lực phải có dạng YYYY-MM-DD");

export const recipeUpdateSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantityPerUnit: z.coerce.number().positive(),
    }),
  ),
  /**
   * Ngày công thức này bắt đầu có hiệu lực. CỐ Ý optional để bản app mobile đang chạy — nó không gửi
   * trường này — vẫn lưu được công thức bình thường; thiếu thì server tự quyết (xem `resolveEffectiveFrom`).
   */
  effectiveFrom: dateOnlySchema.optional(),
  /**
   * Cho phép ghi đè mốc đã tồn tại. Thiếu cờ này mà mốc đã có thì trả 409 — ghi đè im lặng là xoá
   * sạch một phiên bản lịch sử, và người dùng thường chỉ muốn tạo mốc MỚI.
   */
  overwrite: z.coerce.boolean().optional(),
});
