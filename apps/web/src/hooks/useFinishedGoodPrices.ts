import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, FinishedGoodPrice } from "@/types";

export interface PriceMilestoneInput {
  /** "YYYY-MM-DD" */
  effectiveFrom: string;
  sellingPrice: number;
}

export interface PriceSaveResult {
  items: FinishedGoodPrice[];
  affectedCostChecks: AffectedCostCheck[];
}

export function useFinishedGoodPrices(finishedGoodItemId: string) {
  return useQuery({
    queryKey: ["finished-good-prices", finishedGoodItemId],
    queryFn: () => api.get<{ items: FinishedGoodPrice[] }>(`/finished-good-prices/${finishedGoodItemId}`).then((r) => r.items),
    enabled: Boolean(finishedGoodItemId),
  });
}

export function useSaveFinishedGoodPrice(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PriceMilestoneInput) => api.put<PriceSaveResult>(`/finished-good-prices/${finishedGoodItemId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finished-good-prices", finishedGoodItemId] });
      // Giá hiện hành trên danh mục được cập nhật cùng transaction — danh sách món phải tải lại.
      queryClient.invalidateQueries({ queryKey: ["finished-good-items"] });
    },
  });
}

export function useDeleteFinishedGoodPrice(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (priceId: string) =>
      api.delete<{ affectedCostChecks: AffectedCostCheck[] }>(`/finished-good-prices/${finishedGoodItemId}/${priceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finished-good-prices", finishedGoodItemId] });
      queryClient.invalidateQueries({ queryKey: ["finished-good-items"] });
    },
  });
}
