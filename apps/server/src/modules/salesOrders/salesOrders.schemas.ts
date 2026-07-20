import { z } from "zod";

export const salesOrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

export const salesOrderCreateSchema = z.object({
  warehouseId: z.string().min(1),
  orderDate: z.coerce.date().default(() => new Date()),
  note: z.string().optional(),
  items: z.array(salesOrderItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
  // Temporary: lets Order nhanh opt out of the stock-sufficiency check, since
  // its whole point is to request more than what's currently on hand.
  skipStockCheck: z.boolean().optional().default(false),
});

export const salesOrderStatusSchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED", "SHORT", "COMPLETED", "CANCELLED"]),
});

// "received" is no longer sent by the client - whether a line counts as
// fully received is derived by comparing receivedQuantity to the ordered
// quantity, which also allows receiving more than was ordered.
export const salesOrderReceivingSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        receivedQuantity: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
});

// A dòng đơn hàng can be split across more than one entry here (each with its
// own supplier/price/quantity) — quantities for the same itemId must sum to
// exactly that line's ordered quantity (checked in confirmSalesOrderWithExport).
export const salesOrderConfirmSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        supplierId: z.string().min(1).optional(),
        costPrice: z.coerce.number().nonnegative(),
        // 0 là hợp lệ — nghĩa là không đặt được hàng hoá đó từ nhà cung cấp nào trong đợt này.
        quantity: z.coerce.number().nonnegative(),
        // Theo từng hàng hoá (itemId), không theo từng dòng NCC tách nhỏ — nếu 1 itemId có
        // nhiều dòng, chỉ cần 1 dòng mang note là đủ, các dòng còn lại có thể bỏ trống.
        note: z.string().optional(),
      }),
    )
    .min(1),
});
