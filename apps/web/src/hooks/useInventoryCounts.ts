import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { InventoryCount, PagedResult } from "@/types";

export interface InventoryCountCreateInput {
  warehouseId: string;
  countDate: string;
  note?: string;
}

export interface InventoryCountItemInput {
  productId: string;
  actualQuantity: number;
  note?: string;
}

export function useInventoryCounts(filter: { warehouseId?: string; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ["inventory-counts", filter],
    queryFn: () => api.get<PagedResult<InventoryCount>>("/inventory-counts", filter),
  });
}

export function useInventoryCount(id: string) {
  return useQuery({
    queryKey: ["inventory-counts", id],
    queryFn: () => api.get<InventoryCount>(`/inventory-counts/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateInventoryCountWithItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { header: InventoryCountCreateInput; items: InventoryCountItemInput[] }) => {
      const created = await api.post<InventoryCount>("/inventory-counts", data.header);
      if (data.items.length > 0) {
        await api.put<InventoryCount>(`/inventory-counts/${created.id}/items`, { items: data.items });
      }
      return created;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory-counts"] }),
  });
}

export function useSaveInventoryCountItems(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: InventoryCountItemInput[]) => api.put<InventoryCount>(`/inventory-counts/${id}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-counts", id] });
    },
  });
}

export function useDeleteInventoryCountItem(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => api.delete<void>(`/inventory-counts/${id}/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory-counts", id] }),
  });
}

export function useCancelInventoryCount(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<InventoryCount>(`/inventory-counts/${id}/status`, { status: "CANCELLED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-counts", id] });
    },
  });
}
