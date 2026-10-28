import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompressedImage } from "@/lib/imageCompress";
import type {
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
  /** Tài khoản quán (vai trò có cờ "là quán"). */
  shopId: string;
  /** Người duyệt — tài khoản không phải quán. */
  approverId: string;
  purpose: string;
  items: ExpenseProposalItemInput[];
  /** Số tiền đề nghị tạm ứng lần đầu — bắt buộc với mọi phiếu. */
  advanceAmount: number;
  /** Ngày trả hoá đơn dự kiến, "YYYY-MM-DD" — bắt buộc. */
  invoiceDueDate: string;
}

export interface ExpenseProposalFilter {
  from?: string;
  to?: string;
  status?: ExpenseProposalStatus;
  createdById?: string;
  /** Quán chi (`ExpenseProposal.shopId`). */
  shopId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Danh sách kèm "tiền quỹ đã xuất" của CẢ bộ lọc (không phải của trang đang xem): thực chi của phiếu
 * đã hoàn thành cộng tiền đã ứng của phiếu còn dở. Decimal của Prisma về dạng chuỗi.
 */
export type ExpenseProposalListResult = PagedResult<ExpenseProposal> & { paidOutTotal: string | number };

export function useExpenseProposals(filter: ExpenseProposalFilter = {}) {
  return useQuery({
    queryKey: ["expense-proposals", filter],
    queryFn: () =>
      api.get<ExpenseProposalListResult>("/expense-proposals", { ...filter, pageSize: filter.pageSize ?? 20 }),
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

/** Duyệt / từ chối phiếu đang Chờ duyệt. */
export function useDecideExpenseProposal(id: string) {
  const invalidate = useInvalidateProposals();
  return useMutation({
    mutationFn: ({ outcome, reason }: { outcome: "approve" | "reject"; reason?: string }) =>
      api.post<ExpenseProposal>(`/expense-proposals/${id}/${outcome}`, outcome === "reject" ? { reason } : undefined),
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
