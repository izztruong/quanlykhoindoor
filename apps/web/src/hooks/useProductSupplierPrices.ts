import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ProductSupplierPrice } from "@/types";

export interface ProductSupplierPriceItemInput {
  productId: string;
  importPrice: number | null;
  exportPrice: number | null;
}

/** Omit supplierId to get every price row (used for per-line supplier lookups on stock exports). */
export function useProductSupplierPrices(supplierId?: string) {
  return useQuery({
    queryKey: ["product-supplier-prices", supplierId ?? "all"],
    queryFn: () => api.get<{ items: ProductSupplierPrice[] }>("/product-supplier-prices", { supplierId }).then((r) => r.items),
  });
}

export function useSaveProductSupplierPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { supplierId: string; items: ProductSupplierPriceItemInput[] }) =>
      api.put<{ items: ProductSupplierPrice[] }>("/product-supplier-prices", data),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["product-supplier-prices", variables.supplierId], data.items);
      queryClient.invalidateQueries({ queryKey: ["product-supplier-prices", "all"] });
    },
  });
}
