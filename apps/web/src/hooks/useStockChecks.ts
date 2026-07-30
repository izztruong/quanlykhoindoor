import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, StockCheck } from "@/types";

export interface StockCheckItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  note?: string;
}

export interface StockCheckFinishedItemInput {
  finishedGoodItemId: string;
  quantity: number;
  note?: string;
}

export interface StockCheckCreateInput {
  checkedAt?: string;
  note?: string;
  items: StockCheckItemInput[];
  finishedItems: StockCheckFinishedItemInput[];
}

export function useStockChecks(
  filter: { from?: string; to?: string; createdById?: string; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: ["stock-checks", filter],
    queryFn: () => api.get<PagedResult<StockCheck>>("/stock-checks", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useStockCheck(id: string) {
  return useQuery({
    queryKey: ["stock-checks", id],
    queryFn: () => api.get<StockCheck>(`/stock-checks/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateStockCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockCheckCreateInput) => api.post<StockCheck>("/stock-checks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stock-checks"] }),
  });
}
