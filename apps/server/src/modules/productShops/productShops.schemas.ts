import { z } from "zod";

export const productShopPutSchema = z.object({
  shopUserId: z.string().min(1),
  items: z.array(z.object({ productId: z.string().min(1), assigned: z.boolean() })).default([]),
  /**
   * Người dùng đã đọc và đồng ý với CẢ HAI danh sách cảnh báo (`willBecomeGlobal` và `hasHistory`).
   * Thiếu cờ này mà lần lưu có hàng như vậy thì server trả 409 — xem chú thích ở route.
   */
  confirmWarnings: z.boolean().optional(),
});
