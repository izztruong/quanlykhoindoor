import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, MaterialWaste, PagedResult } from "@/types";

export interface MaterialWasteItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  note?: string;
}

export interface MaterialWasteFinishedItemInput {
  finishedGoodItemId: string;
  quantity: number;
  note?: string;
}

export interface MaterialWasteCreateInput {
  wasteAt?: string;
  note?: string;
  items: MaterialWasteItemInput[];
  finishedItems: MaterialWasteFinishedItemInput[];
}

export function useMaterialWasteList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["material-waste", filter],
    queryFn: () => api.get<PagedResult<MaterialWaste>>("/material-waste", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useMaterialWaste(id: string) {
  return useQuery({
    queryKey: ["material-waste", id],
    queryFn: () => api.get<MaterialWaste>(`/material-waste/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMaterialWaste() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialWasteCreateInput) => api.post<MaterialWaste>("/material-waste", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["material-waste"] }),
  });
}

export function useUpdateMaterialWaste(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialWasteCreateInput) =>
      api.put<MaterialWaste & { affectedCostChecks: AffectedCostCheck[] }>(`/material-waste/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-waste"] });
      queryClient.invalidateQueries({ queryKey: ["material-waste", id] });
    },
  });
}
