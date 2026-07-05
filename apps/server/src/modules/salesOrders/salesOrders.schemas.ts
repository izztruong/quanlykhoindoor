import { z } from "zod";

export const salesOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int("Số lượng phải là số nguyên").positive(),
});

export const salesOrderCreateSchema = z.object({
  warehouseId: z.string().min(1),
  orderDate: z.coerce.date().default(() => new Date()),
  note: z.string().optional(),
  items: z.array(salesOrderItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
});

export const salesOrderStatusSchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "COMPLETED", "CANCELLED"]),
});
