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
}

export interface RecipeSaveResult {
  items: FinishedGoodRecipeItem[];
  version: { id: string; effectiveFrom: string };
  affectedCostChecks: AffectedCostCheck[];
}

/** Công thức hiện hành (mốc mới nhất). */
export function useFinishedGoodRecipe(finishedGoodItemId: string) {
  return useQuery({
    queryKey: ["finished-good-recipe", finishedGoodItemId],
    queryFn: () => api.get<{ items: FinishedGoodRecipeItem[] }>(`/finished-good-recipes/${finishedGoodItemId}`).then((r) => r.items),
    enabled: Boolean(finishedGoodItemId),
  });
}

/** Mọi mốc công thức của món, mới nhất trước. */
export function useFinishedGoodRecipeVersions(finishedGoodItemId: string) {
  return useQuery({
    queryKey: ["finished-good-recipe-versions", finishedGoodItemId],
    queryFn: () =>
      api.get<{ items: FinishedGoodRecipeVersion[] }>(`/finished-good-recipes/${finishedGoodItemId}/versions`).then((r) => r.items),
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
