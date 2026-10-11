import { z } from "zod";

export const transactionFormEnum = z.enum(["CASH", "BANK_TRANSFER", "DEBT", "OTHER"]);
export const transactionStatusEnum = z.enum(["DRAFT", "COMPLETED", "CANCELLED"]);
export const stockImportTypeEnum = z.enum(["PURCHASE", "OTHER"]);
export const stockExportTypeEnum = z.enum(["SALE", "SUPPLIER_RETURN", "TRANSFER_OUT", "DAMAGE", "OTHER"]);

export const stockItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  costPrice: z.coerce.number().nonnegative(),
  note: z.string().optional(),
});

// Export lines each pick their own supplier (a single export can cover
// products normally sourced from different suppliers), unlike an import
// which is one delivery from the one supplier picked on the header.
export const stockExportItemSchema = stockItemSchema.extend({
  supplierId: z.string().min(1).optional(),
});

const baseHeaderSchema = {
  transactionAt: z.coerce.date(),
  form: transactionFormEnum.default("CASH"),
  status: transactionStatusEnum.default("COMPLETED"),
  note: z.string().optional(),
  warehouseId: z.string().min(1),
  supplierId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
};

/**
 * Phiếu nhập kho là đường ghi chính thức cho "hàng về quán" (Check Cost đọc từ đây), nên khác phiếu
 * xuất ở ba chỗ:
 *  - `supplierId` BẮT BUỘC: mỗi phiếu là một chuyến giao từ một NCC. Đó cũng là thứ cho phép dùng
 *    `transactionAt` của phiếu làm mốc kỳ thay vì ngày nhận từng dòng.
 *  - KHÔNG có `customerId`: phiếu nhập không bán cho ai.
 *  - KHÔNG nhận `status`: luôn COMPLETED. Phiếu nháp sẽ không được Check Cost tính mà chẳng có dấu
 *    hiệu gì, nên bỏ hẳn lựa chọn đó thay vì để người dùng tự bẫy mình.
 */
export const stockImportCreateSchema = z.object({
  type: stockImportTypeEnum.default("PURCHASE"),
  transactionAt: z.coerce.date(),
  form: transactionFormEnum.default("CASH"),
  note: z.string().optional(),
  warehouseId: z.string().min(1),
  supplierId: z.string().min(1, "Chọn nhà cung cấp"),
  items: z.array(stockItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
});

export const stockExportCreateSchema = z.object({
  type: stockExportTypeEnum.default("SALE"),
  ...baseHeaderSchema,
  items: z.array(stockExportItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
});

export type StockImportInput = z.infer<typeof stockImportCreateSchema>;
export type StockExportInput = z.infer<typeof stockExportCreateSchema>;

/** Tối đa 5 ảnh chứng từ mỗi phiếu nhập — cùng mức với khoản chi và phiếu đề xuất chi. */
export const MAX_IMAGES_PER_IMPORT = 5;

/** Trình duyệt đã nén xuống ~200 KB trước khi gửi, 1,5 MB là trần rộng rãi cho ảnh lọt lưới nén. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const stockImportImageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        contentType: z.enum(IMAGE_CONTENT_TYPES, { message: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" }),
        // Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64,".
        dataBase64: z.string().min(1, "Ảnh rỗng"),
      }),
    )
    .min(1, "Chưa chọn ảnh nào")
    .max(MAX_IMAGES_PER_IMPORT, `Mỗi phiếu tối đa ${MAX_IMAGES_PER_IMPORT} ảnh`),
});
