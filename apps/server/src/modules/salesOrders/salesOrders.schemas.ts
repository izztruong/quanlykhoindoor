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

// Đổi trạng thái tay chỉ còn huỷ — hoàn thành đơn phải đi qua PUT /:id/process.
export const salesOrderStatusSchema = z.object({
  status: z.enum(["CANCELLED"]),
});

// Admin xử lý đơn: mỗi hàng hoá một mục, gồm 1..n dòng NCC (mỗi dòng thành 1 dòng phiếu xuất kho).
// itemId = hàng quán đã đặt; productId = hàng admin thêm mới. SL nhận của hàng = tổng SL các dòng.
export const salesOrderProcessSchema = z.object({
  items: z
    .array(
      z
        .object({
          itemId: z.string().min(1).optional(),
          productId: z.string().min(1).optional(),
          // Bỏ trống thì server lấy giờ lưu — giữ bất biến "có SL nhận thì có ngày nhận" mà Check Cost cần.
          receivedAt: z.coerce.date().optional(),
          note: z.string().optional(),
          lines: z
            .array(
              z.object({
                supplierId: z.string().min(1).optional(),
                costPrice: z.coerce.number().nonnegative(),
                // 0 là hợp lệ — không lấy được hàng hoá đó từ NCC nào.
                quantity: z.coerce.number().nonnegative(),
              }),
            )
            .min(1, "Mỗi hàng hoá cần ít nhất 1 dòng nhà cung cấp"),
        })
        .refine((it) => Boolean(it.itemId) !== Boolean(it.productId), {
          message: "Mỗi hàng hoá cần đúng một trong itemId hoặc productId",
        }),
    )
    .min(1),
});

/** Tối đa 5 ảnh chứng từ mỗi dòng hàng — cùng mức với khoản chi chốt ca và phiếu đề xuất chi. */
export const MAX_IMAGES_PER_ORDER_ITEM = 5;

/** Trình duyệt đã nén xuống ~200 KB trước khi gửi, 1,5 MB là trần rộng rãi cho ảnh lọt lưới nén. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const salesOrderItemImageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        contentType: z.enum(IMAGE_CONTENT_TYPES, { message: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" }),
        // Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64,".
        dataBase64: z.string().min(1, "Ảnh rỗng"),
      }),
    )
    .min(1, "Chưa chọn ảnh nào")
    .max(MAX_IMAGES_PER_ORDER_ITEM, `Mỗi hàng hoá tối đa ${MAX_IMAGES_PER_ORDER_ITEM} ảnh`),
});
