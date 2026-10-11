import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, SalesOrder, SalesOrderListRow, SalesOrderStatus } from "@/types";

export interface SalesOrderItemInput {
  productId: string;
  quantity: number;
}

export interface SalesOrderInput {
  /** Omit to let the server stamp the moment the order is created. */
  orderDate?: string;
  note?: string;
  items: SalesOrderItemInput[];
}

export function useSalesOrders(filter: {
  status?: string;
  /** "true" = chỉ đơn đã xử lý, "false" = chỉ đơn chưa xử lý, bỏ trống = tất cả. */
  processed?: string;
  from?: string;
  to?: string;
  createdById?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ["sales-orders", filter],
    queryFn: () =>
      api.get<PagedResult<SalesOrderListRow>>("/sales-orders", {
        status: filter.status,
        processed: filter.processed,
        from: filter.from,
        to: filter.to,
        createdById: filter.createdById,
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
    mutationFn: (status: Extract<SalesOrderStatus, "CANCELLED">) => api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

/**
 * Ô tích "Đã xử lý" — chỉ đánh dấu đơn nào admin đã làm, không ảnh hưởng tồn kho hay Check Cost.
 * Hàng thực nhận ghi ở phiếu nhập kho của quán.
 */
export function useSetSalesOrderProcessed(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (processed: boolean) => api.patch<SalesOrder>(`/sales-orders/${id}/processed`, { processed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}
