import { z } from "zod";

export const costCheckCreateSchema = z.object({
  userId: z.string().min(1),
  openingStockCheckId: z.string().min(1),
  closingStockCheckId: z.string().min(1),
  note: z.string().optional(),
  discountTra: z.coerce.number().nonnegative().optional(),
  discountDav: z.coerce.number().nonnegative().optional(),
  /**
   * Cộng VAT vào giá vốn và giá bán khi tính phiếu, theo `vatPercent` của từng hàng hoá/món.
   *
   * `.default(false)` chứ không bắt buộc: app mobile bản cũ không gửi trường này, và `false` đúng
   * bằng cách những phiếu đó vẫn luôn được tính — không có đường sai im lặng nào ở đây, khác hẳn
   * `soldItems` bên dưới. Giá trị được chốt cứng vào `CostCheck.useVat` lúc tạo.
   */
  useVat: z.boolean().optional().default(false),
  /**
   * SL món đã bán giờ lấy tự động từ doanh số POS, không còn gõ tay.
   *
   * Vẫn khai trường này để BẮT LỖI TO TIẾNG thay vì sai im lặng: app mobile không deploy cùng lúc với
   * server, bản cũ vẫn gửi `soldItems`. Nếu server lặng lẽ bỏ qua thì người dùng gõ 80 dòng, lưu
   * thành công, mà phiếu lại mang số POS khác hẳn số họ vừa nhập — không ai phát hiện ra.
   */
  soldItems: z
    .array(z.object({ finishedGoodItemId: z.string().min(1), quantitySold: z.coerce.number().nonnegative() }))
    .optional()
    .refine((items) => !items || items.length === 0, {
      message: "Bản app cũ: SL đã bán giờ lấy tự động từ doanh số POS. Vui lòng cập nhật ứng dụng.",
    }),
});

/** Query của route xem trước doanh số POS sẽ dùng cho một kỳ. */
export const costCheckPosPreviewSchema = z.object({
  userId: z.string().min(1),
  openingStockCheckId: z.string().min(1),
  closingStockCheckId: z.string().min(1),
});

export const costCheckStatusSchema = z.object({
  status: z.enum(["ACTIVE", "CANCELLED"]),
});
