import { z } from "zod";

export const salesOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

export const salesOrderCreateSchema = z.object({
  orderDate: z.coerce.date().default(() => new Date()),
  note: z.string().optional(),
  items: z.array(salesOrderItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
});

// Đơn hàng chỉ còn là đề xuất: đặt rồi huỷ, không có "hoàn thành".
export const salesOrderStatusSchema = z.object({
  status: z.enum(["CANCELLED"]),
});

/**
 * Ô tích "Đã xử lý" — chỉ để admin biết đơn nào đã làm, không nhập SL, không sinh phiếu nào. Hàng
 * thực nhận ghi ở phiếu nhập kho của quán.
 */
export const salesOrderProcessedSchema = z.object({
  processed: z.boolean(),
});
