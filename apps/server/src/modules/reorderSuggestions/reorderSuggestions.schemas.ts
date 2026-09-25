import { z } from "zod";

/**
 * Tồn quán khai cho một hàng hoá. Cố ý cho phép bỏ trống (không gửi dòng) thay vì gửi 0: "chưa đếm"
 * và "đếm được 0" là hai chuyện khác nhau — hàng chưa đếm thì THRESHOLD/COVERAGE không được đề xuất
 * bừa, còn đếm được 0 thì phải đặt.
 */
const onHandSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
});

export const reorderPreviewSchema = z.object({
  // Bỏ trống = chính mình. Khai quán khác cần DATA.SCOPE_ALL, chặn ở route.
  userId: z.string().min(1).optional(),
  onHand: z.array(onHandSchema).default([]),
  // Số ngày cần phủ, tính TỪ LÚC NHẬN ĐƯỢC HÀNG. Chỉ dùng cho chế độ COVERAGE.
  // Bỏ trống thì server tự tính từ lịch gọi đồ (khoảng cách tới ngày gọi kế tiếp) — đó là đường chạy
  // thường ngày; ô trên trang chỉ để sửa tay khi cần.
  coverDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const reorderCommitSchema = reorderPreviewSchema.extend({
  warehouseId: z.string().min(1),
  note: z.string().optional(),
  // SL cuối cùng sau khi người dùng sửa tay. Dòng nào không gửi thì không vào đơn.
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1, "Cần ít nhất 1 hàng hoá"),
});

export type ReorderPreviewInput = z.infer<typeof reorderPreviewSchema>;
export type ReorderCommitInput = z.infer<typeof reorderCommitSchema>;
