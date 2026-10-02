import { z } from "zod";

export const otherExpenseCreateSchema = z.object({
  // Chỉ có ngày, không có giờ — cột trong DB là DATE (xem chú thích ở model OtherExpense).
  spentAt: z.coerce.date(),
  // Bắt buộc ở MỌI đường ghi, kể cả nhập Excel: cột trong DB nullable chỉ để chứa dòng ghi trước
  // khi có trường này. Có hợp lệ hay không thì assertShop ở routes mới quyết (phải là tài khoản
  // thuộc vai trò "là quán"), đây chỉ chặn bỏ trống.
  shopId: z.string({ message: "Vui lòng chọn quán chi" }).trim().min(1, "Vui lòng chọn quán chi"),
  content: z.string().trim().min(1, "Nội dung chi không được để trống"),
  unit: z.string().trim().optional(),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0"),
  unitPrice: z.coerce.number().nonnegative("Đơn giá không được âm"),
  note: z.string().optional(),
});

// Cùng quy ước payload với bulk-import của crudFactory: { items: [...] }.
export const otherExpenseBulkImportSchema = z.object({
  items: z.array(otherExpenseCreateSchema).min(1, "File không có dòng nào để nhập"),
});

export type OtherExpenseInput = z.infer<typeof otherExpenseCreateSchema>;

/** Tối đa 5 ảnh mỗi khoản chi — đủ cho hóa đơn nhiều trang mà không ai đẩy lên hàng chục tấm. */
export const MAX_IMAGES_PER_EXPENSE = 5;

/** Trình duyệt đã nén xuống ~200 KB trước khi gửi, 1,5 MB là trần rộng rãi cho ảnh lọt lưới nén. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const otherExpenseImageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        contentType: z.enum(IMAGE_CONTENT_TYPES, { message: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" }),
        // Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64,".
        dataBase64: z.string().min(1, "Ảnh rỗng"),
      }),
    )
    .min(1, "Chưa chọn ảnh nào")
    .max(MAX_IMAGES_PER_EXPENSE, `Mỗi khoản chi tối đa ${MAX_IMAGES_PER_EXPENSE} ảnh`),
});
