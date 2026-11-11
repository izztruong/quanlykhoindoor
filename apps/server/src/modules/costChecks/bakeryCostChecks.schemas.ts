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
  /**
   * Cộng VAT vào giá vốn và giá bán khi tính phiếu, theo `vatPercent` của từng hàng hoá/món.
   *
   * `.default(false)` chứ không bắt buộc: app mobile bản cũ không gửi trường này, và `false` đúng
   * bằng cách những phiếu đó vẫn luôn được tính — không có đường sai im lặng nào ở đây.
   * Giá trị được chốt cứng vào `CostCheck.useVat` lúc tạo.
   */
  useVat: z.boolean().optional().default(false),
});
