import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FinishedGoodRecipeItem } from "@/types";

export interface RecipeItemInput {
  productId: string;
  quantityPerUnit: number;
}

export function useFinishedGoodRecipe(finishedGoodItemId: string) {
  return useQuery({
    queryKey: ["finished-good-recipe", finishedGoodItemId],
    queryFn: () => api.get<{ items: FinishedGoodRecipeItem[] }>(`/finished-good-recipes/${finishedGoodItemId}`).then((r) => r.items),
    enabled: Boolean(finishedGoodItemId),
  });
}

export function useUpdateFinishedGoodRecipe(finishedGoodItemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: RecipeItemInput[]) =>
      api.put<{ items: FinishedGoodRecipeItem[] }>(`/finished-good-recipes/${finishedGoodItemId}`, { items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finished-good-recipe", finishedGoodItemId] }),
  });
}
