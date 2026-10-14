import { z } from "zod";

export const transactionFormEnum = z.enum(["CASH", "BANK_TRANSFER", "DEBT", "OTHER"]);
export const stockImportTypeEnum = z.enum(["PURCHASE", "OTHER"]);

export const stockItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  costPrice: z.coerce.number().nonnegative(),
  note: z.string().optional(),
});

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

export type StockImportInput = z.infer<typeof stockImportCreateSchema>;

/**
 * Nhập nhiều phiếu từ một file Excel. Mỗi phần tử dùng ĐÚNG `stockImportCreateSchema` nên mọi chốt
 * của `POST /` tự có (NCC bắt buộc, ít nhất 1 dòng hàng, không nhận `status`) — cùng quy ước payload
 * `{ items }` với bulk-import của `crudFactory`.
 *
 * Trần 200 phiếu: 200 phiếu × ~20 dòng vẫn vào gọn một `createMany`, còn file lớn hơn thì nên chia
 * ra chứ đừng để transaction chạm timeout của Neon. Tiền lệ `.max(500)` ở `posSales.schemas.ts`.
 */
export const stockImportBulkSchema = z.object({
  items: z.array(stockImportCreateSchema).min(1, "File không có phiếu nào").max(200, "Một lần nhập tối đa 200 phiếu"),
  /**
   * Người dùng đã xem danh sách phiếu trùng ở bước xem trước và vẫn muốn ghi. Mặc định false để lần
   * gửi đầu luôn đi qua bước cảnh báo.
   */
  confirmDuplicates: z.boolean().optional().default(false),
});

/**
 * Tra phiếu theo danh sách MÃ — cho màn đính ảnh hàng loạt, nơi người dùng đặt tên ảnh theo mã phiếu.
 * Cần id để gọi `POST /:id/images`, mà tên file chỉ mang mã.
 *
 * Trần 200 cùng mức với `bulk-import`.
 */
export const stockImportByCodesSchema = z.object({
  codes: z.array(z.string().min(1)).min(1, "Chưa có mã phiếu nào").max(200, "Một lần tra tối đa 200 mã"),
});

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
