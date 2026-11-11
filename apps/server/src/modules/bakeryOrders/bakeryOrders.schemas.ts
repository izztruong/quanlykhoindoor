import { z } from "zod";

/**
 * Ngày giao là STRING "YYYY-MM-DD", không `z.coerce.date()` — cùng lý do như `bakerySales.schemas.ts`:
 * một ngày trần đi qua đường truyền dưới dạng chuỗi thì không thể bị trừ mất 7 tiếng.
 */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

const STATUSES = ["ORDERED", "CONFIRMED", "IN_TRANSIT", "COMPLETED", "CANCELLED"] as const;

/** Mỗi hàng hoá một dòng — cột có `@@unique([bakeryOrderId, productId])`, chặn sớm để trả lỗi tiếng Việt. */
function uniqueProducts<T extends { productId: string }>(items: T[]) {
  return new Set(items.map((it) => it.productId)).size === items.length;
}

export const bakeryOrderCreateSchema = z.object({
  /** Bỏ trống = chính mình (quán tự đặt). Đặt hộ quán khác cần DATA.SCOPE_ALL. */
  shopUserId: z.string().min(1).optional(),
  supplierId: z.string().min(1, "Chọn tiệm bánh"),
  deliveryOn: dateOnly,
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        orderedQty: z.coerce.number().positive("Số lượng đặt phải lớn hơn 0"),
        note: z.string().optional(),
      }),
    )
    .min(1, "Cần ít nhất 1 dòng bánh")
    .refine(uniqueProducts, "Mỗi loại bánh chỉ được một dòng"),
});

/**
 * Số lượng của MỘT bước (xác nhận / lấy hàng / nhận hàng). Phải gửi đủ mọi dòng của đơn, mỗi dòng một
 * lần — server so với danh sách dòng thật và từ chối nếu thiếu hoặc thừa, để không có dòng nào lặng
 * lẽ giữ cột rỗng.
 */
const stepItems = z
  .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().nonnegative("Số lượng không được âm") }))
  .min(1)
  .refine(uniqueProducts, "Mỗi loại bánh chỉ được một dòng");

export const bakeryOrderStepSchema = z.object({ items: stepItems });

export const bakeryOrderReceiveSchema = z.object({
  items: stepItems,
  /** Có CẢ GIỜ — thành mốc kỳ Check Cost của phiếu nhập tự sinh. Bỏ trống = lúc bấm. */
  receivedAt: z.coerce.date().optional(),
});

/** Admin sửa đơn ĐÃ HOÀN THÀNH: SL nhận và ngày nhận — ngày bắt buộc, vì đó là thứ hay phải chữa nhất. */
export const bakeryOrderReceivedEditSchema = z.object({
  items: stepItems,
  receivedAt: z.coerce.date(),
});

/** Ô lọc để trống gửi "" — coi như không lọc. */
const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

export const bakeryOrderListQuerySchema = z.object({
  status: blankAsUndefined(z.enum(STATUSES)),
  shopUserId: blankAsUndefined(z.string()),
  supplierId: blankAsUndefined(z.string()),
  from: blankAsUndefined(dateOnly),
  to: blankAsUndefined(dateOnly),
});
