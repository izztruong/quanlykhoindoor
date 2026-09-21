import { z } from "zod";

// Ngày không có giờ ("YYYY-MM-DD") — cột DATE trong DB, xem chú thích ở model ExpenseProposal.
const dateOnly = (message: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message).transform((s) => new Date(s));

/** MKT · Vận hành · CSVC — dùng chung cho schema ghi và bộ lọc danh sách. */
export const EXPENSE_PROPOSAL_CATEGORIES = ["MKT", "OPERATION", "FACILITY"] as const;

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const expenseProposalItemSchema = z.object({
  content: z.string().trim().min(1, "Nội dung hạng mục không được để trống"),
  unitPrice: z.coerce.number().nonnegative("Đơn giá không được âm"),
  unit: z.string().trim().optional(),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0"),
  note: z.string().trim().optional(),
});

export type ExpenseProposalItemInput = z.infer<typeof expenseProposalItemSchema>;

const itemsSchema = z.array(expenseProposalItemSchema).min(1, "Phải có ít nhất 1 hạng mục");

export const expenseProposalSchema = z
  .object({
    proposalDate: dateOnly("Ngày tạo phiếu không hợp lệ"),
    payer: z.enum(["CREATOR", "ACCOUNTANT"], { message: "Người chi phải là người lập phiếu hoặc kế toán" }),
    category: z.enum(EXPENSE_PROPOSAL_CATEGORIES, { message: "Vui lòng chọn loại phiếu" }),
    shopId: z.string({ message: "Vui lòng chọn quán chi" }).trim().min(1, "Vui lòng chọn quán chi"),
    approverId: z.string({ message: "Vui lòng chọn người duyệt" }).trim().min(1, "Vui lòng chọn người duyệt"),
    purpose: z.string().trim().min(1, "Mục đích sử dụng không được để trống"),
    items: itemsSchema,
    // Số tiền đề nghị tạm ứng lần đầu. Chỉ lưu khi payer = CREATOR; kế toán chi thì bỏ qua dù client có
    // gửi. Ô trống ("") coi như không gửi, để form ẩn các ô này không làm hỏng cả phiếu. Trần = tổng
    // dự kiến, kiểm ở toProposalData vì tổng do server tính.
    advanceAmount: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    invoiceDueDate: z.preprocess(emptyToUndefined, dateOnly("Ngày trả hoá đơn dự kiến không hợp lệ").optional()),
  })
  .superRefine((data, ctx) => {
    if (data.payer !== "CREATOR") return;
    if (data.advanceAmount === undefined || !(data.advanceAmount > 0)) {
      ctx.addIssue({ code: "custom", message: "Số tiền đề nghị tạm ứng phải lớn hơn 0", path: ["advanceAmount"] });
    }
    if (!data.invoiceDueDate) {
      ctx.addIssue({ code: "custom", message: "Vui lòng chọn ngày trả hoá đơn dự kiến", path: ["invoiceDueDate"] });
    }
  });

export const expenseProposalRejectSchema = z.object({
  reason: z.string().trim().min(1, "Vui lòng nhập lý do từ chối"),
});

export const expenseProposalAdvanceSchema = z.object({
  amount: z.coerce.number({ message: "Số tiền tạm ứng không hợp lệ" }).positive("Số tiền tạm ứng phải lớn hơn 0"),
  note: z.string().trim().optional(),
});

/** Bảng hạng mục dự kiến mới gửi đi duyệt bổ sung — thay cả bảng, không chỉ thêm dòng. */
export const expenseProposalRevisionSchema = z.object({ items: itemsSchema });

export const expenseProposalCompleteSchema = z.object({
  items: itemsSchema,
  invoiceDate: z.string({ message: "Vui lòng chọn ngày nộp hoá đơn" }).pipe(dateOnly("Ngày nộp hoá đơn không hợp lệ")),
});

/** Tối đa 5 ảnh chứng từ mỗi phiếu — cùng mức với Chi chốt ca. */
export const MAX_IMAGES_PER_PROPOSAL = 5;

/** Trình duyệt đã nén xuống ~200 KB trước khi gửi, 1,5 MB là trần rộng rãi cho ảnh lọt lưới nén. */
export const MAX_IMAGE_BYTES = 1_500_000;

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const expenseProposalImageUploadSchema = z.object({
  images: z
    .array(
      z.object({
        contentType: z.enum(IMAGE_CONTENT_TYPES, { message: "Chỉ nhận ảnh JPG, PNG hoặc WEBP" }),
        // Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64,".
        dataBase64: z.string().min(1, "Ảnh rỗng"),
      }),
    )
    .min(1, "Chưa chọn ảnh nào")
    .max(MAX_IMAGES_PER_PROPOSAL, `Mỗi phiếu tối đa ${MAX_IMAGES_PER_PROPOSAL} ảnh chứng từ`),
});

export type ExpenseProposalInput = z.infer<typeof expenseProposalSchema>;
