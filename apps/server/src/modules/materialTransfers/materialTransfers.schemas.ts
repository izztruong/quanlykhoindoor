import { z } from "zod";

export const materialTransferCreateSchema = z
  .object({
    fromUserId: z.string().min(1),
    toUserId: z.string().min(1),
    transferAt: z.coerce.date().default(() => new Date()),
    note: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          wholeQuantity: z.coerce.number().nonnegative().optional(),
          looseQuantity: z.coerce.number().nonnegative().optional(),
          supplierId: z.string().min(1).optional(),
          costPrice: z.coerce.number().nonnegative().optional(),
          note: z.string().optional(),
        }),
      )
      .min(1, "Cần ít nhất 1 dòng nguyên liệu"),
  })
  .refine((data) => data.fromUserId !== data.toUserId, {
    message: "Quán gửi và quán nhận phải khác nhau",
    path: ["toUserId"],
  })
  .refine((data) => data.items.every((it) => it.wholeQuantity != null || it.looseQuantity != null), {
    message: "Mỗi dòng cần ít nhất 1 trong 2 số lượng (chẵn/lẻ)",
    path: ["items"],
  });

/**
 * Nhập nhiều phiếu điều chuyển từ một file Excel. Mỗi phần tử dùng ĐÚNG `materialTransferCreateSchema`
 * nên hai `.refine` ở trên tự áp cho từng phiếu: quán gửi ≠ quán nhận, và mỗi dòng phải có ít nhất một
 * trong hai số lượng.
 *
 * Trần 200 phiếu — cùng mức với phiếu nhập kho; file lớn hơn thì chia ra chứ đừng để transaction chạm
 * timeout của Neon.
 */
export const materialTransferBulkSchema = z.object({
  items: z.array(materialTransferCreateSchema).min(1, "File không có phiếu nào").max(200, "Một lần nhập tối đa 200 phiếu"),
  /** Người dùng đã xem danh sách phiếu trùng ở bước xem trước và vẫn muốn ghi. */
  confirmDuplicates: z.boolean().optional().default(false),
});
