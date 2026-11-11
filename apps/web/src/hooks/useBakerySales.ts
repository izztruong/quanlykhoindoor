import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult } from "@/types";

/** Khoá một ô bánh bán ra. `shopUserId = null` nghĩa là BÁN NGOÀI. */
export interface BakerySaleRowKey {
  shopUserId: string | null;
  soldOn: string;
  finishedGoodItemId: string;
}

export interface BakerySaleRowItem extends BakerySaleRowKey {
  id: string;
  quantity: string | number;
  shopUser?: { id: string; name: string } | null;
  finishedGoodItem: { id: string; code: string; name: string; unit?: { name: string } | null };
}

export interface SaveBakerySalesResult {
  written: number;
  deleted: number;
  replaced: number;
}

export function useBakerySaleRows(params: {
  bakeryUserId?: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["bakery-sales", params],
    queryFn: () => api.get<PagedResult<BakerySaleRowItem>>("/bakery-sales", params),
    enabled: Boolean(params.bakeryUserId),
  });
}

export function useSaveBakerySales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      bakeryUserId?: string;
      upserts: (BakerySaleRowKey & { quantity: number })[];
      deletes: BakerySaleRowKey[];
    }) => api.post<SaveBakerySalesResult>("/bakery-sales/manual", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bakery-sales"] });
    },
  });
}
