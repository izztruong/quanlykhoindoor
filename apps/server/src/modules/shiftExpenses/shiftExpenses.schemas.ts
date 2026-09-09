import { z } from "zod";

export const shiftExpenseCreateSchema = z.object({
  // Chỉ có ngày, không có giờ — cột trong DB là DATE (xem chú thích ở model ShiftExpense).
  spentAt: z.coerce.date(),
  // Bắt buộc khai, không lấy theo mặc định của cột: để sót thì cả sổ dồn hết vào NVL mà không ai biết.
  type: z.enum(["MATERIAL", "OTHER"], { message: "Loại chi phải là NVL hoặc Khác" }),
  content: z.string().trim().min(1, "Nội dung chi không được để trống"),
  unit: z.string().trim().optional(),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0"),
  unitPrice: z.coerce.number().nonnegative("Đơn giá không được âm"),
  note: z.string().optional(),
});

// Cùng quy ước payload với bulk-import của crudFactory: { items: [...] }.
export const shiftExpenseBulkImportSchema = z.object({
  items: z.array(shiftExpenseCreateSchema).min(1, "File không có dòng nào để nhập"),
});

export type ShiftExpenseInput = z.infer<typeof shiftExpenseCreateSchema>;
