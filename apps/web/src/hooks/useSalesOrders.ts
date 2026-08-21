import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, PagedResult, SalesOrder, SalesOrderListRow, SalesOrderStatus } from "@/types";

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

export function useSalesOrders(filter: {
  status?: string;
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
  /** Thời điểm dòng này thực nhận (ISO). Check Cost lọc kỳ theo mốc này. */
  receivedAt?: string;
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
  /** Ngày nhận dự kiến admin đặt ngay lúc xác nhận đơn (ISO). */
  receivedAt?: string;
}

export interface SalesOrderReceivedDateInput {
  itemId: string;
  receivedAt: string;
}

/** Admin sửa riêng ngày nhận — không đụng số lượng, trạng thái đơn hay phiếu xuất kho. */
export function useUpdateSalesOrderReceivedDates(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SalesOrderReceivedDateInput[]) =>
      api.patch<SalesOrder & { affectedCostChecks: AffectedCostCheck[] }>(`/sales-orders/${id}/received-dates`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
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
