import { z } from "zod";

/**
 * Một ô doanh số đã gộp theo giờ. Trình duyệt đọc file Excel (có giờ từng đơn) rồi gộp về mức giờ
 * trước khi gửi — cùng cách chia việc với các màn nhập Excel khác trong dự án (ExcelJS chạy ở web),
 * và gộp trước giúp payload nhỏ đi hàng chục lần với file 2 tháng.
 */
const posSaleRowSchema = z.object({
  // Ngày theo lịch, dạng YYYY-MM-DD. Nhận chuỗi chứ không nhận Date: chuỗi ngày thuần không có múi
  // giờ nên không thể bị trừ đi 7 tiếng trên đường truyền — đúng bài học đã ghi trong CLAUDE.md.
  soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD"),
  hour: z.coerce.number().int().min(0).max(23),
  posName: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

export const posSalesImportSchema = z.object({
  // Quán bán. Bỏ trống = chính mình; khai quán khác cần DATA.SCOPE_ALL.
  userId: z.string().min(1).optional(),
  rows: z.array(posSaleRowSchema).min(1, "File không có dòng nào đọc được"),
});

export const posSalesDeleteDaySchema = z.object({
  userId: z.string().min(1).optional(),
  soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type PosSalesImportInput = z.infer<typeof posSalesImportSchema>;
export type PosSaleRow = z.infer<typeof posSaleRowSchema>;

export const posSalesByShiftSchema = z.object({
  userId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
