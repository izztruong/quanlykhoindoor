import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ReorderThreshold } from "@/types";

export interface ReorderThresholdItemInput {
  productId: string;
  minQuantity: number | null;
  maxQuantity: number | null;
}

export function useReorderThresholds(userId?: string) {
  return useQuery({
    queryKey: ["reorder-thresholds", userId ?? "me"],
    queryFn: () => api.get<{ items: ReorderThreshold[] }>("/reorder-thresholds", { userId }).then((r) => r.items),
  });
}

export function useSaveReorderThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; items: ReorderThresholdItemInput[] }) =>
      api.put<{ items: ReorderThreshold[] }>("/reorder-thresholds", data),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["reorder-thresholds", variables.userId], data.items);
      queryClient.invalidateQueries({ queryKey: ["reorder-thresholds", "me"] });
    },
  });
}
