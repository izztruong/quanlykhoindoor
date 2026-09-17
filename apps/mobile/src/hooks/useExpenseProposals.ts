import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { ExpensePayer, ExpenseProposal, ExpenseProposalCategory, ExpenseProposalStatus, PagedResult } from "@/types";

export interface ExpenseProposalItemInput {
  content: string;
  unitPrice: number;
  unit?: string;
  quantity: number;
  note?: string;
}

export interface ExpenseProposalInput {
  /** "YYYY-MM-DD" */
  proposalDate: string;
  payer: ExpensePayer;
  category: ExpenseProposalCategory;
  /** Tài khoản quán (vai trò có cờ "là quán"). */
  shopId: string;
  /** Người xác nhận — tài khoản không phải quán. */
  approverId: string;
  purpose: string;
  items: ExpenseProposalItemInput[];
  /** Chỉ gửi khi payer = ACCOUNTANT — server bỏ qua với người lập tự chi. */
  advancePercent?: number;
  invoiceDueDate?: string;
}

export interface ExpenseProposalFilter {
  from?: string;
  to?: string;
  status?: ExpenseProposalStatus;
  category?: ExpenseProposalCategory;
  createdById?: string;
  page?: number;
  pageSize?: number;
}

export type ExpenseProposalAction = "approve" | "reject" | "advance" | "spend";

export function useExpenseProposals(filter: ExpenseProposalFilter = {}) {
  return useQuery({
    queryKey: ["expense-proposals", filter],
    queryFn: () =>
      api.get<PagedResult<ExpenseProposal>>("/expense-proposals", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useExpenseProposal(id: string) {
  return useQuery({
    queryKey: ["expense-proposals", id],
    queryFn: () => api.get<ExpenseProposal>(`/expense-proposals/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateExpenseProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseProposalInput) => api.post<ExpenseProposal>("/expense-proposals", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-proposals"] }),
  });
}

export function useUpdateExpenseProposal(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseProposalInput) => api.put<ExpenseProposal>(`/expense-proposals/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-proposals"] }),
  });
}

export function useDeleteExpenseProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/expense-proposals/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-proposals"] }),
  });
}

/** Duyệt / từ chối / đã tạm ứng / đã chi. `reason` chỉ dùng cho từ chối. */
export function useExpenseProposalAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: ExpenseProposalAction; reason?: string }) =>
      api.post<ExpenseProposal>(`/expense-proposals/${id}/${action}`, action === "reject" ? { reason } : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expense-proposals"] }),
  });
}
