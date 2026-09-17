import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { AffectedCostCheck, PagedResult, StockCheck, StockCheckType } from "@/types";

export interface StockCheckItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  wholePrice?: number;
  loosePrice?: number;
  note?: string;
}

export interface StockCheckFinishedItemInput {
  finishedGoodItemId: string;
  quantity: number;
  price?: number;
  note?: string;
}

export interface StockCheckCreateInput {
  checkedAt?: string;
  /** Bắt buộc khi tạo: hạn nộp tuần và tháng neo vào hai mốc khác nhau. */
  type: StockCheckType;
  note?: string;
  items: StockCheckItemInput[];
  finishedItems: StockCheckFinishedItemInput[];
}

export function useStockChecks(
  filter: { from?: string; to?: string; createdById?: string; page?: number; pageSize?: number } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["stock-checks", filter],
    queryFn: () => api.get<PagedResult<StockCheck>>("/stock-checks", { ...filter, pageSize: filter.pageSize ?? 20 }),
    enabled: options.enabled ?? true,
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

export function useUpdateStockCheck(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockCheckCreateInput) => api.put<StockCheck & { affectedCostChecks: AffectedCostCheck[] }>(`/stock-checks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-checks"] });
      queryClient.invalidateQueries({ queryKey: ["stock-checks", id] });
    },
  });
}
