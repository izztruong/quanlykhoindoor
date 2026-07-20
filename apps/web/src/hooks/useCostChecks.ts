import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CostCheck } from "@/types";

export interface CostCheckSoldItemInput {
  finishedGoodItemId: string;
  quantitySold: number;
}

export interface CostCheckCreateInput {
  userId: string;
  openingStockCheckId: string;
  closingStockCheckId: string;
  note?: string;
  discountTra?: number;
  discountDav?: number;
  soldItems: CostCheckSoldItemInput[];
}

export function useCostCheckList(filter: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ["cost-checks", filter],
    queryFn: () => api.get<{ items: CostCheck[] }>("/cost-checks", filter).then((r) => r.items),
  });
}

export function useCostCheck(id: string) {
  return useQuery({
    queryKey: ["cost-checks", id],
    queryFn: () => api.get<CostCheck>(`/cost-checks/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateCostCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CostCheckCreateInput) => api.post<CostCheck>("/cost-checks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cost-checks"] }),
  });
}
