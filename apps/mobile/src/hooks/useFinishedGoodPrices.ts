import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
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

function useInvalidatePrices(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finished-good-prices", finishedGoodItemId] }),
      // Giá hiện hành trên danh mục được cập nhật trong cùng transaction — danh sách món phải tải lại.
      queryClient.invalidateQueries({ queryKey: ["finished-good-items"] }),
    ]);
}

export function useSaveFinishedGoodPrice(finishedGoodItemId: string) {
  const invalidate = useInvalidatePrices(finishedGoodItemId);
  return useMutation({
    mutationFn: (input: PriceMilestoneInput) => api.put<PriceSaveResult>(`/finished-good-prices/${finishedGoodItemId}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteFinishedGoodPrice(finishedGoodItemId: string) {
  const invalidate = useInvalidatePrices(finishedGoodItemId);
  return useMutation({
    mutationFn: (priceId: string) =>
      api.delete<{ affectedCostChecks: AffectedCostCheck[] }>(`/finished-good-prices/${finishedGoodItemId}/${priceId}`),
    onSuccess: invalidate,
  });
}
