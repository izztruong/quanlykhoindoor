import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { MaterialWaste } from "@/types";

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

export function useMaterialWasteList(filter: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ["material-waste", filter],
    queryFn: () => api.get<{ items: MaterialWaste[] }>("/material-waste", filter).then((r) => r.items),
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
