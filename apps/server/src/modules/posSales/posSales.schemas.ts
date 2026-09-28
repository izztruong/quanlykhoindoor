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

/**
 * Nhập TAY theo DÒNG: mỗi dòng tự mang ngày, vì danh sách trải nhiều ngày (có ô lọc từ ngày → đến ngày)
 * nên không có một ngày dùng chung như bản trước.
 *
 * `upserts` để ghi mới hoặc sửa, `deletes` để xoá. Đổi giờ hay đổi món của một dòng thì gửi khoá cũ vào
 * `deletes` và khoá mới vào `upserts` trong cùng một lần gọi.
 */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD");

const manualRowKey = z.object({
  soldOn: dateOnly,
  hour: z.coerce.number().int().min(0).max(23),
  finishedGoodItemId: z.string().min(1),
});

export const manualRowsSchema = z
  .object({
    userId: z.string().min(1).optional(),
    // SL phải dương: muốn bỏ một dòng thì đưa khoá của nó vào `deletes`, không gửi số 0.
    upserts: z.array(manualRowKey.extend({ quantity: z.coerce.number().positive() })).max(500).default([]),
    deletes: z.array(manualRowKey).max(500).default([]),
  })
  .refine((v) => v.upserts.length > 0 || v.deletes.length > 0, {
    message: "Không có dòng nào để lưu",
  });

/** Danh sách dòng doanh số, lọc theo quán và khoảng ngày. Phân trang lấy từ query qua parsePagination. */
export const posSaleRowsQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  from: dateOnly,
  to: dateOnly,
});
