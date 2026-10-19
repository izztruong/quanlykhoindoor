import { z } from "zod";

/**
 * Khuôn `costCheckCreateSchema` nhưng **không có `discountTra`/`discountDav`**: hai ô giảm giá đó
 * thuộc doanh thu bán lẻ của quán, tiệm bánh bán theo giá xuất nên không có khái niệm đó.
 */
export const bakeryCostCheckCreateSchema = z.object({
  userId: z.string().min(1),
  openingStockCheckId: z.string().min(1),
  closingStockCheckId: z.string().min(1),
  note: z.string().optional(),
});
