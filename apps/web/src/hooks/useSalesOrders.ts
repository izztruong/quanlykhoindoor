import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, SalesOrder, SalesOrderStatus } from "@/types";

export interface SalesOrderItemInput {
  productId: string;
  quantity: number;
}

export interface SalesOrderInput {
  warehouseId: string;
  orderDate: string;
  note?: string;
  items: SalesOrderItemInput[];
}

export function useSalesOrders(filter: { status?: string }) {
  return useQuery({
    queryKey: ["sales-orders", filter],
    queryFn: () => api.get<PagedResult<SalesOrder>>("/sales-orders", { status: filter.status, pageSize: 100 }),
  });
}

export function useSalesOrder(id: string) {
  return useQuery({
    queryKey: ["sales-orders", id],
    queryFn: () => api.get<SalesOrder>(`/sales-orders/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SalesOrderInput) => api.post<SalesOrder>("/sales-orders", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
  });
}

export function useUpdateSalesOrderStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: SalesOrderStatus) => api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}
