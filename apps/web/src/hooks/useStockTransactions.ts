import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, StockTransaction } from "@/types";

export interface StockTransactionItemInput {
  productId: string;
  quantity: number;
  costPrice: number;
  note?: string;
  /** Export lines only — which supplier's price this line's costPrice came from. */
  supplierId?: string;
}

export interface StockTransactionInput {
  type: string;
  transactionAt: string;
  form: string;
  status: string;
  note?: string;
  warehouseId: string;
  supplierId?: string;
  customerId?: string;
  items: StockTransactionItemInput[];
}

export function createStockTransactionHooks(endpoint: string, queryKey: string) {
  function useList(
    filter: { warehouseId?: string; status?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
  ) {
    return useQuery({
      queryKey: [queryKey, filter],
      queryFn: () => api.get<PagedResult<StockTransaction>>(endpoint, { ...filter, pageSize: filter.pageSize ?? 20 }),
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: StockTransactionInput) => api.post<StockTransaction>(endpoint, data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
    });
  }

  return { useList, useCreate };
}

export const stockImportHooks = createStockTransactionHooks("/stock-imports", "stock-imports");
export const stockExportHooks = createStockTransactionHooks("/stock-exports", "stock-exports");
