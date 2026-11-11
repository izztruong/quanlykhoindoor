import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, FinishedGoodPrice } from "@/types";

export interface PriceMilestoneInput {
  /** "YYYY-MM-DD" */
  effectiveFrom: string;
  sellingPrice: number;
  /** Quán được khai giá riêng; bỏ trống/null = mốc giá CHUNG cho mọi quán. */
  shopUserId?: string | null;
}

export interface PriceSaveResult {
  items: FinishedGoodPrice[];
  affectedCostChecks: AffectedCostCheck[];
}

export interface PriceListResult {
  items: FinishedGoodPrice[];
  /** Số mốc của bản CHUNG — để nói "quán này chưa có giá riêng, đang dùng giá Chung (N mốc)". */
  sharedCount: number;
}

/** `shopUserId` rỗng = phạm vi CHUNG. Phạm vi vào query key để đổi ô chọn là tải lại đúng bộ mốc. */
export function useFinishedGoodPrices(finishedGoodItemId: string, shopUserId?: string) {
  return useQuery({
    queryKey: ["finished-good-prices", finishedGoodItemId, shopUserId ?? "shared"],
    queryFn: () => api.get<PriceListResult>(`/finished-good-prices/${finishedGoodItemId}`, { shopUserId }),
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
