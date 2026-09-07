import { z } from "zod";

export const productSupplierPricesPutSchema = z.object({
  supplierId: z.string().min(1),
  items: z.array(
    z
      .object({
        productId: z.string().min(1),
        importPrice: z.coerce.number().nonnegative().nullable().optional(),
        exportPrice: z.coerce.number().nonnegative().nullable().optional(),
        // Đơn vị gọi NCC + hệ số quy đổi sang đơn vị chính của hàng hoá (vd 1 Thùng = 12 Hộp).
        purchaseUnitId: z.string().min(1).nullable().optional(),
        baseUnitsPerPurchaseUnit: z.coerce.number().positive().nullable().optional(),
        // Số lượng đặt tối thiểu, tính theo đơn vị gọi ở trên.
        minQuantity: z.coerce.number().nonnegative().nullable().optional(),
        priority: z.coerce.number().int().min(1).nullable().optional(),
      })
      // Khai đơn vị gọi mà bỏ trống hệ số quy đổi thì phần tổng hợp sẽ chia cho 0, nên chặn ngay
      // ở đây thay vì để ra số lượng đặt vô nghĩa.
      .superRefine((item, ctx) => {
        if (item.purchaseUnitId && !item.baseUnitsPerPurchaseUnit) {
          ctx.addIssue({
            code: "custom",
            path: ["baseUnitsPerPurchaseUnit"],
            message: "Đã chọn đơn vị gọi thì phải nhập hệ số quy đổi lớn hơn 0",
          });
        }
        if (!item.purchaseUnitId && item.baseUnitsPerPurchaseUnit) {
          ctx.addIssue({
            code: "custom",
            path: ["purchaseUnitId"],
            message: "Đã nhập hệ số quy đổi thì phải chọn đơn vị gọi",
          });
        }
      }),
  ),
});
