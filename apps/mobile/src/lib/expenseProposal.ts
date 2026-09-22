import type { ExpensePayer, ExpenseProposalStatus } from "@/types";

export const EXPENSE_PROPOSAL_STATUS_LABEL: Record<ExpenseProposalStatus, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  ADVANCED: "Đã tạm ứng",
  REAPPROVAL: "Chờ duyệt bổ sung",
  SPENT: "Hoàn thành",
};

export const EXPENSE_PROPOSAL_STATUS_TONE: Record<ExpenseProposalStatus, "gray" | "green" | "red" | "yellow" | "blue"> = {
  PENDING: "yellow",
  APPROVED: "blue",
  REJECTED: "red",
  ADVANCED: "blue",
  REAPPROVAL: "yellow",
  SPENT: "green",
};

export const EXPENSE_PAYER_LABEL: Record<ExpensePayer, string> = {
  CREATOR: "Người lập phiếu",
  ACCOUNTANT: "Kế toán",
};

/** Khớp MAX_IMAGES_PER_PROPOSAL ở server — server vẫn là nơi chốt, đây chỉ để báo sớm. */
export const MAX_PROPOSAL_IMAGES = 5;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * Tính trước trên form để người dùng thấy số ngay khi gõ. Cùng công thức với toItemRows ở server
 * (apps/server/src/modules/expenseProposals/expenseProposals.service.ts) — số lưu thật vẫn do
 * server tính lại.
 */
export function computeExpenseTotals(rows: { unitPrice: number; quantity: number }[]) {
  const amounts = rows.map((row) => roundMoney(row.unitPrice * row.quantity));
  const total = roundMoney(amounts.reduce((sum, amount) => sum + amount, 0));
  return { amounts, total };
}

/** Ngày hôm nay theo giờ máy người dùng, dạng "YYYY-MM-DD" cho <input type="date">. Không cắt chuỗi ISO (là giờ UTC). */
export function todayForDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
