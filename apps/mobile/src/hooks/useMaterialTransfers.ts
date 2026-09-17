import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { AffectedCostCheck, MaterialTransfer, PagedResult } from "@/types";

export type MaterialTransferListRow = Omit<MaterialTransfer, "items"> & { _count: { items: number } };

export interface MaterialTransferItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  supplierId?: string;
  costPrice?: number;
  note?: string;
}

export interface MaterialTransferCreateInput {
  fromUserId: string;
  toUserId: string;
  transferAt?: string;
  note?: string;
  items: MaterialTransferItemInput[];
}

export function useMaterialTransferList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["material-transfers", filter],
    queryFn: () => api.get<PagedResult<MaterialTransferListRow>>("/material-transfers", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useMaterialTransfer(id: string) {
  return useQuery({
    queryKey: ["material-transfers", id],
    queryFn: () => api.get<MaterialTransfer>(`/material-transfers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMaterialTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialTransferCreateInput) => api.post<MaterialTransfer>("/material-transfers", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["material-transfers"] }),
  });
}

export function useUpdateMaterialTransfer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialTransferCreateInput) =>
      api.put<MaterialTransfer & { affectedCostChecks: AffectedCostCheck[] }>(`/material-transfers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["material-transfers", id] });
    },
  });
}
