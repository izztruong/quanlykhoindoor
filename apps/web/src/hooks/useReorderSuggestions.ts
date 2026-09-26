import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { EstimatedStockRow, ReorderSuggestion, SalesOrder } from "@/types";

export interface OnHandInput {
  productId: string;
  quantity: number;
}

export interface PreviewInput {
  userId?: string;
  onHand: OnHandInput[];
  /** Bỏ trống thì server tự tính theo nhịp gọi của từng hàng hoá — đó là đường chạy thường ngày. */
  coverDays?: number;
}

export interface PreviewResult {
  items: ReorderSuggestion[];
}

/**
 * Dùng `useMutation` chứ không phải `useQuery`: tồn hiện tại do người dùng gõ nên đầu vào đổi liên tục
 * theo từng ký tự. Để query tự chạy lại theo key thì mỗi lần gõ một số là một request — ở đây người
 * bấm "Tính lại" và server tính một lần.
 */
export function usePreviewReorderSuggestions() {
  return useMutation({
    mutationFn: (data: PreviewInput) => api.post<PreviewResult>("/reorder-suggestions/preview", data),
  });
}

/**
 * Tồn nguyên liệu ước tính, để ĐIỀN SẴN cột tồn.
 *
 * `useMutation` chứ không `useQuery`: đây là việc người dùng chủ động bấm ("Điền tồn ước tính"), không
 * phải dữ liệu nền của trang. Tự chạy lúc mở trang sẽ đè số quán đang gõ.
 */
export function useEstimatedStock() {
  return useMutation({
    mutationFn: (params: { userId?: string }) =>
      api.get<{ items: EstimatedStockRow[] }>("/reorder-suggestions/estimated-stock", params).then((r) => r.items),
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
