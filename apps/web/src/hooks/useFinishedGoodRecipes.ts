import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, FinishedGoodRecipeItem, FinishedGoodRecipeVersion } from "@/types";

export interface RecipeItemInput {
  productId: string;
  quantityPerUnit: number;
}

export interface RecipeSaveInput {
  items: RecipeItemInput[];
  /** "YYYY-MM-DD". Thiếu thì server tự quyết: mốc gốc cho công thức đầu tiên, hôm nay cho các lần sau. */
  effectiveFrom?: string;
  /** Cho phép ghi đè mốc đã tồn tại — thiếu mà mốc đã có thì server trả 409. */
  overwrite?: boolean;
  /** Quán được khai công thức riêng; bỏ trống/null = phiên bản CHUNG cho mọi quán. */
  shopUserId?: string | null;
}

export interface RecipeSaveResult {
  items: FinishedGoodRecipeItem[];
  version: { id: string; effectiveFrom: string };
  affectedCostChecks: AffectedCostCheck[];
}

/** Công thức hiện hành (mốc mới nhất). */
export function useFinishedGoodRecipe(finishedGoodItemId: string, shopUserId?: string) {
  return useQuery({
    queryKey: ["finished-good-recipe", finishedGoodItemId, shopUserId ?? "shared"],
    queryFn: () =>
      api
        .get<{ items: FinishedGoodRecipeItem[] }>(`/finished-good-recipes/${finishedGoodItemId}`, { shopUserId })
        .then((r) => r.items),
    enabled: Boolean(finishedGoodItemId),
  });
}

/** Mọi mốc công thức của món, mới nhất trước. */
export interface RecipeVersionsResult {
  items: FinishedGoodRecipeVersion[];
  /** Số mốc của bản CHUNG — để nói "quán này chưa có công thức riêng". */
  sharedCount: number;
}

export function useFinishedGoodRecipeVersions(finishedGoodItemId: string, shopUserId?: string) {
  return useQuery({
    queryKey: ["finished-good-recipe-versions", finishedGoodItemId, shopUserId ?? "shared"],
    queryFn: () =>
      api.get<RecipeVersionsResult>(`/finished-good-recipes/${finishedGoodItemId}/versions`, { shopUserId }),
    enabled: Boolean(finishedGoodItemId),
  });
}

export function useUpdateFinishedGoodRecipe(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecipeSaveInput) => api.put<RecipeSaveResult>(`/finished-good-recipes/${finishedGoodItemId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finished-good-recipe", finishedGoodItemId] });
      queryClient.invalidateQueries({ queryKey: ["finished-good-recipe-versions", finishedGoodItemId] });
    },
  });
}

export function useDeleteFinishedGoodRecipeVersion(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      api.delete<{ affectedCostChecks: AffectedCostCheck[] }>(`/finished-good-recipes/${finishedGoodItemId}/versions/${versionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finished-good-recipe", finishedGoodItemId] });
      queryClient.invalidateQueries({ queryKey: ["finished-good-recipe-versions", finishedGoodItemId] });
    },
  });
}
