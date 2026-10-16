import { z } from "zod";

export const finishedGoodMenuPutSchema = z.object({
  shopUserId: z.string().min(1),
  items: z
    .array(
      z.object({
        finishedGoodItemId: z.string().min(1),
        assigned: z.boolean(),
      }),
    )
    .default([]),
  /**
   * Người dùng đã đọc và đồng ý với danh sách món sẽ chuyển thành "mọi quán".
   *
   * Thiếu cờ này mà lần lưu có món như vậy thì server trả 409 kèm `willBecomeGlobal` để giao diện
   * hỏi lại — xem chú thích ở route.
   */
  confirmGlobal: z.boolean().optional(),
});
