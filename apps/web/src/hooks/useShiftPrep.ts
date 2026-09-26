import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ShiftCode, ShiftPrepPreview, ShiftStockCountRecord, ShiftVarianceRow } from "@/types";

export interface OnHandFinishedInput {
  finishedGoodItemId: string;
  quantity: number;
}

export interface PrepPreviewInput {
  userId?: string;
  businessDate: string;
  shift: ShiftCode;
  onHandFinished?: OnHandFinishedInput[];
}

/**
 * Dùng `useMutation` chứ không `useQuery`: tồn đầu ca là ô người dùng gõ, nên đầu vào đổi theo từng ký
 * tự. Để query tự chạy lại theo key thì mỗi lần gõ một số là một request — cùng lý do với
 * `usePreviewReorderSuggestions`.
 */
export function usePreviewShiftPrep() {
  return useMutation({
    mutationFn: (data: PrepPreviewInput) => api.post<ShiftPrepPreview>("/shift-prep/preview", data),
  });
}

export interface PrepCommitInput extends PrepPreviewInput {
  items: { finishedGoodItemId: string; actualBatches: number }[];
}

export function useCommitShiftPrep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PrepCommitInput) => api.post("/shift-prep/commit", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-prep-runs"] });
      queryClient.invalidateQueries({ queryKey: ["shift-variance"] });
    },
  });
}

export interface StockCountInput {
  userId?: string;
  businessDate: string;
  shift: ShiftCode;
  countedAt?: string;
  note?: string;
  items: OnHandFinishedInput[];
}

export function useSaveShiftStockCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockCountInput) => api.post("/shift-prep/stock-count", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-stock-count"] });
      queryClient.invalidateQueries({ queryKey: ["shift-variance"] });
    },
  });
}

export function useShiftStockCount(params: { userId?: string; businessDate: string; shift: ShiftCode }, enabled = true) {
  return useQuery({
    queryKey: ["shift-stock-count", params],
    queryFn: () => api.get<{ count: ShiftStockCountRecord | null }>("/shift-prep/stock-count", params).then((r) => r.count),
    enabled,
  });
}

export function useShiftVariance(params: { userId?: string; businessDate: string; shift: ShiftCode }, enabled = true) {
  return useQuery({
    queryKey: ["shift-variance", params],
    queryFn: () => api.get<{ items: ShiftVarianceRow[] }>("/shift-prep/variance", params).then((r) => r.items),
    enabled,
  });
}
