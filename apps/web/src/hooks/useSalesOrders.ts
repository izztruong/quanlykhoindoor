import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, SalesOrder, SalesOrderStatus } from "@/types";

export interface SalesOrderItemInput {
  productId: string;
  quantity: number;
}

export interface SalesOrderInput {
  warehouseId: string;
  /** Omit to let the server stamp the moment the order is created. */
  orderDate?: string;
  note?: string;
  items: SalesOrderItemInput[];
  /** Temporary: lets Order nhanh opt out of the stock-sufficiency check. */
  skipStockCheck?: boolean;
}

export function useSalesOrders(filter: { status?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["sales-orders", filter],
    queryFn: () =>
      api.get<PagedResult<SalesOrder>>("/sales-orders", {
        status: filter.status,
        from: filter.from,
        to: filter.to,
        page: filter.page,
        pageSize: filter.pageSize ?? 20,
      }),
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

export interface SalesOrderReceivingItemInput {
  itemId: string;
  receivedQuantity: number;
}

export function useCompleteSalesOrderReceiving(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SalesOrderReceivingItemInput[]) => api.patch<SalesOrder>(`/sales-orders/${id}/receiving`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

export function useConfirmOrderReportedQuantities(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch<SalesOrder>(`/sales-orders/${id}/confirm-quantities`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

export interface SalesOrderConfirmItemInput {
  itemId: string;
  supplierId?: string;
  costPrice: number;
  quantity: number;
  note?: string;
}

export function useConfirmSalesOrderWithExport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SalesOrderConfirmItemInput[]) => api.patch<SalesOrder>(`/sales-orders/${id}/confirm`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}
