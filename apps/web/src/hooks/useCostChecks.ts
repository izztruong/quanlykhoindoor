import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CostCheck, PagedResult } from "@/types";

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

export function useCostCheckList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["cost-checks", filter],
    queryFn: () => api.get<PagedResult<CostCheck>>("/cost-checks", { ...filter, pageSize: filter.pageSize ?? 20 }),
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
