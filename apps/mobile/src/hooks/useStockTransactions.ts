import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { StockTransaction } from "@/types";

export interface StockTransactionFilter {
  warehouseId?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
}

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
  function useDetail(id: string) {
    return useQuery({
      queryKey: [queryKey, id],
      queryFn: () => api.get<StockTransaction>(`${endpoint}/${id}`),
      enabled: Boolean(id),
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: StockTransactionInput) => api.post<StockTransaction>(endpoint, data),
      onSuccess: () => Promise.all([
        queryClient.invalidateQueries({ queryKey: [queryKey] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["product-stock"] }),
      ]),
    });
  }

  return { useDetail, useCreate };
}

export const stockImportHooks = createStockTransactionHooks("/stock-imports", "stock-imports");
export const stockExportHooks = createStockTransactionHooks("/stock-exports", "stock-exports");
