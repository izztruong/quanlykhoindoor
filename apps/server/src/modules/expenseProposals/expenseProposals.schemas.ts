import { z } from "zod";

// Ngày không có giờ ("YYYY-MM-DD") — cột DATE trong DB, xem chú thích ở model ExpenseProposal.
const dateOnly = (message: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message).transform((s) => new Date(s));

/** MKT · Vận hành · CSVC — dùng chung cho schema ghi và bộ lọc danh sách. */
export const EXPENSE_PROPOSAL_CATEGORIES = ["MKT", "OPERATION", "FACILITY"] as const;

const emptyToUndefined =(value: unknown) => (value === "" || value === null ? undefined : value);

export const expenseProposalItemSchema = z.object({
  content: z.string().trim().min(1, "Nội dung hạng mục không được để trống"),
  unitPrice: z.coerce.number().nonnegative("Đơn giá không được âm"),
  unit: z.string().trim().optional(),
  quantity: z.coerce.number().positive("Số lượng phải lớn hơn 0"),
  note: z.string().trim().optional(),
});

export const expenseProposalSchema = z
  .object({
    proposalDate: dateOnly("Ngày tạo phiếu không hợp lệ"),
    payer: z.enum(["CREATOR", "ACCOUNTANT"], { message: "Người chi phải là người lập phiếu hoặc kế toán" }),
    category: z.enum(EXPENSE_PROPOSAL_CATEGORIES, { message: "Vui lòng chọn loại phiếu" }),
    shopId: z.string({ message: "Vui lòng chọn quán chi" }).trim().min(1, "Vui lòng chọn quán chi"),
    approverId: z.string({ message: "Vui lòng chọn người xác nhận" }).trim().min(1, "Vui lòng chọn người xác nhận"),
    purpose: z.string().trim().min(1, "Mục đích sử dụng không được để trống"),
    items: z.array(expenseProposalItemSchema).min(1, "Phiếu phải có ít nhất 1 hạng mục"),
    // Chỉ đọc khi payer = ACCOUNTANT; người lập tự chi thì bỏ qua dù client có gửi. Ô trống ("")
    // coi như không gửi, để form ẩn các ô này không làm hỏng cả phiếu.
    advancePercent: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
    invoiceDueDate: z.preprocess(emptyToUndefined, dateOnly("Ngày trả hoá đơn không hợp lệ").optional()),
  })
  .superRefine((data, ctx) => {
    if (data.payer !== "ACCOUNTANT") return;
    if (data.advancePercent === undefined || !(data.advancePercent > 0 && data.advancePercent <= 100)) {
      ctx.addIssue({ code: "custom", message: "Tạm ứng (%) phải lớn hơn 0 và không quá 100", path: ["advancePercent"] });
    }
    if (!data.invoiceDueDate) {
      ctx.addIssue({ code: "custom", message: "Vui lòng chọn ngày trả hoá đơn", path: ["invoiceDueDate"] });
    }
  });

export const expenseProposalRejectSchema = z.object({
  reason: z.string().trim().min(1, "Vui lòng nhập lý do từ chối"),
});

export type ExpenseProposalInput = z.infer<typeof expenseProposalSchema>;
