import { z } from "zod";

/** "YYYY-MM-DD" theo NGÀY KINH DOANH. Không nhận Date để tránh chuỗi ISO bị cắt mất múi giờ. */
const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày kinh doanh phải có dạng YYYY-MM-DD");

const shift = z.enum(["CA1", "CA2", "CA3"]);

const onHandItem = z.object({
  finishedGoodItemId: z.string().min(1),
  quantity: z.coerce.number().nonnegative(),
});

export const prepPreviewSchema = z.object({
  /** Quán được đề xuất. Bỏ trống = chính mình; khai quán khác đòi DATA.SCOPE_ALL. */
  userId: z.string().min(1).optional(),
  businessDate,
  shift,
  /** Tồn đầu ca gõ tay, đè lên số suy từ phiếu đếm ca trước. */
  onHandFinished: z.array(onHandItem).optional(),
});

export const prepCommitSchema = prepPreviewSchema.extend({
  items: z
    .array(
      z.object({
        finishedGoodItemId: z.string().min(1),
        // Số mẻ nên là số nguyên không âm: không pha được nửa mẻ, và 0 nghĩa là ca này không pha món đó.
        actualBatches: z.coerce.number().int().min(0),
      }),
    )
    .min(1, "Phải có ít nhất một món"),
});

export const stockCountSchema = z.object({
  userId: z.string().min(1).optional(),
  businessDate,
  shift,
  /** Giờ đếm thật. Bỏ trống = bây giờ. Nhận ISO đầy đủ, KHÔNG cắt chuỗi (xem lib/dateRange bên web). */
  countedAt: z.coerce.date().optional(),
  note: z.string().optional(),
  items: z.array(onHandItem).min(1, "Phải đếm ít nhất một món"),
});

export const varianceQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  businessDate,
  shift,
});
