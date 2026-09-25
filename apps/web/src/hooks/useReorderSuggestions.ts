import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ReorderSuggestion, SalesOrder } from "@/types";

export interface OnHandInput {
  productId: string;
  quantity: number;
}

export interface PreviewInput {
  userId?: string;
  onHand: OnHandInput[];
  coverDays?: number;
  leadDays?: number;
}

/**
 * Dùng `useMutation` chứ không phải `useQuery`: tồn hiện tại do người dùng gõ nên đầu vào đổi liên tục
 * theo từng ký tự. Để query tự chạy lại theo key thì mỗi lần gõ một số là một request — ở đây người
 * bấm "Tính lại" và server tính một lần.
 */
export function usePreviewReorderSuggestions() {
  return useMutation({
    mutationFn: (data: PreviewInput) =>
      api.post<{ items: ReorderSuggestion[] }>("/reorder-suggestions/preview", data).then((r) => r.items),
  });
}

export interface CommitInput extends PreviewInput {
  warehouseId: string;
  note?: string;
  items: { productId: string; quantity: number }[];
}

export function useCommitReorderSuggestions() {
  return useMutation({
    mutationFn: (data: CommitInput) => api.post<SalesOrder>("/reorder-suggestions/commit", data),
  });
}
