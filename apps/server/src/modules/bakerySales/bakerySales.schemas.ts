import { z } from "zod";

/**
 * Ngày là STRING "YYYY-MM-DD", không `z.coerce.date()` — cùng lý do như `posSales.schemas.ts`: một
 * ngày trần đi qua đường truyền dưới dạng chuỗi thì không thể bị trừ mất 7 tiếng.
 */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

/**
 * Khoá một ô bánh bán ra. Đúng bộ `@@unique([bakeryUserId, shopUserId, soldOn, finishedGoodItemId])`.
 *
 * `shopUserId` để **nullable TƯỜNG MINH, không optional**: `null` nghĩa là BÁN NGOÀI — một lựa chọn
 * có ý thức của người nhập, không phải trường bị bỏ quên. Để `.optional()` thì gõ thiếu cũng thành
 * bán ngoài mà không ai biết.
 */
const bakerySaleRowKey = z.object({
  shopUserId: z.string().min(1).nullable(),
  soldOn: dateOnly,
  finishedGoodItemId: z.string().min(1),
});

export const bakerySaleRowsSchema = z
  .object({
    bakeryUserId: z.string().min(1).optional(),
    // SL phải dương: muốn bỏ một dòng thì đưa khoá của nó vào `deletes`, không gửi số 0.
    upserts: z.array(bakerySaleRowKey.extend({ quantity: z.coerce.number().positive() })).max(500).default([]),
    deletes: z.array(bakerySaleRowKey).max(500).default([]),
  })
  .refine((v) => v.upserts.length > 0 || v.deletes.length > 0, { message: "Không có dòng nào để lưu" });

/** Danh sách dòng bánh bán ra, lọc theo tiệm bánh và khoảng ngày. Phân trang lấy từ `parsePagination`. */
export const bakerySaleRowsQuerySchema = z.object({
  bakeryUserId: z.string().min(1).optional(),
  from: dateOnly,
  to: dateOnly,
});

export const bakerySaleDeleteDaySchema = z.object({
  bakeryUserId: z.string().min(1).optional(),
  soldOn: dateOnly,
});
