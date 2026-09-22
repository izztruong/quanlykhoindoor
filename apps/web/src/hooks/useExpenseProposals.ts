import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompressedImage } from "@/lib/imageCompress";
import type {
  ExpensePayer,
  ExpenseProposal,
  ExpenseProposalImage,
  ExpenseProposalStatus,
  PagedResult,
} from "@/types";

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
  /** Tài khoản quán (vai trò có cờ "là quán"). */
  shopId: string;
  /** Người duyệt — tài khoản không phải quán. */
  approverId: string;
  purpose: string;
  items: ExpenseProposalItemInput[];
  /** Số tiền đề nghị tạm ứng lần đầu. Chỉ gửi khi payer = CREATOR — server bỏ qua với kế toán chi. */
  advanceAmount?: number;
  /** Ngày trả hoá đơn dự kiến, "YYYY-MM-DD". */
  invoiceDueDate?: string;
}

export interface ExpenseProposalFilter {
  from?: string;
  to?: string;
  status?: ExpenseProposalStatus;
  createdById?: string;
  page?: number;
  pageSize?: number;
}

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

function useInvalidateProposals() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["expense-proposals"] });
}

export function useCreateExpenseProposal() {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (data: ExpenseProposalInput) => api.post<ExpenseProposal>("/expense-proposals", data),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (data: ExpenseProposalInput) => api.put<ExpenseProposal>(`/expense-proposals/${id}`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteExpenseProposal() {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/expense-proposals/${id}`),
    onSuccess: invalidate,
  });
}

/** Duyệt / từ chối — lần đầu (`scope: "proposal"`) hoặc bảng hạng mục bổ sung (`scope: "revision"`). */
export function useDecideExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: ({
      scope,
      outcome,
      reason,
    }: {
      scope: "proposal" | "revision";
      outcome: "approve" | "reject";
      reason?: string;
    }) => {
      const base = scope === "revision" ? `/expense-proposals/${id}/revision` : `/expense-proposals/${id}`;
      return api.post<ExpenseProposal>(`${base}/${outcome}`, outcome === "reject" ? { reason } : undefined);
    },
    onSuccess: invalidate,
  });
}

/** Tạm ứng lần đầu hoặc tạm ứng thêm. */
export function useAdvanceExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (data: { amount: number; note?: string }) => api.post<ExpenseProposal>(`/expense-proposals/${id}/advance`, data),
    onSuccess: invalidate,
  });
}

/** Gửi bảng hạng mục dự kiến mới đi duyệt bổ sung. */
export function useReviseExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (items: ExpenseProposalItemInput[]) =>
      api.post<ExpenseProposal>(`/expense-proposals/${id}/revision`, { items }),
    onSuccess: invalidate,
  });
}

/** Hoàn thành: hạng mục thực chi + ngày nộp hoá đơn ("YYYY-MM-DD"). Ảnh chứng từ gửi riêng sau đó. */
export function useCompleteExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (data: { items: ExpenseProposalItemInput[]; invoiceDate: string }) =>
      api.post<ExpenseProposal>(`/expense-proposals/${id}/complete`, data),
    onSuccess: invalidate,
  });
}

/** URL ảnh là URL ký có hạn 1 giờ — chỉ tải khi thật sự cần xem. */
export function useExpenseProposalImages(id: string, enabled = true) {
  return useQuery({
    queryKey: ["expense-proposals", id, "images"],
    queryFn: () => api.get<ExpenseProposalImage[]>(`/expense-proposals/${id}/images`),
    enabled: Boolean(id) && enabled,
  });
}

export function useUploadExpenseProposalImages(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (images: CompressedImage[]) =>
      api.post<{ created: number }>(`/expense-proposals/${id}/images`, {
        images: images.map(({ contentType, dataBase64 }) => ({ contentType, dataBase64 })),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteExpenseProposalImage(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/expense-proposals/${id}/images/${imageId}`),
    onSuccess: invalidate,
  });
}
