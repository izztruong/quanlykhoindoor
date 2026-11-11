import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, BakeryOrder, BakeryOrderStatus, PagedResult } from "@/types";

export interface BakeryOrderFilter {
  status?: BakeryOrderStatus | "";
  shopUserId?: string;
  supplierId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface BakeryOrderCreateInput {
  shopUserId?: string;
  supplierId: string;
  deliveryOn: string;
  note?: string;
  items: { productId: string; orderedQty: number; note?: string }[];
}

/** Số lượng của một bước — phải đủ mọi dòng của đơn, server từ chối nếu thiếu hoặc thừa. */
export type BakeryOrderStepItems = { productId: string; quantity: number }[];

export interface BakeryOrderOptions {
  bakeries: { supplierId: string; name: string; products: { id: string; code: string; name: string; unit?: { name: string } | null }[] }[];
}

type WithAffected = BakeryOrder & { affectedCostChecks: AffectedCostCheck[] };

export function useBakeryOrderList(filter: BakeryOrderFilter = {}) {
  return useQuery({
    queryKey: ["bakery-orders", filter],
    queryFn: () => api.get<PagedResult<BakeryOrder>>("/bakery-orders", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useBakeryOrder(id: string) {
  return useQuery({
    queryKey: ["bakery-orders", id],
    queryFn: () => api.get<BakeryOrder>(`/bakery-orders/${id}`),
    enabled: Boolean(id),
  });
}

/** Tiệm bánh và bánh quán đặt được — không kèm giá (bảng giá NCC là dữ liệu nhạy cảm). */
export function useBakeryOrderOptions(shopUserId?: string, enabled = true) {
  return useQuery({
    queryKey: ["bakery-orders", "options", shopUserId ?? "self"],
    queryFn: () => api.get<BakeryOrderOptions>("/bakery-orders/options", { shopUserId }),
    enabled,
  });
}

export function useCreateBakeryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BakeryOrderCreateInput) => api.post<BakeryOrder>("/bakery-orders", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bakery-orders"] }),
  });
}

/**
 * Mọi bước của luồng (xác nhận, từ chối, huỷ, lấy hàng, nhận hàng, admin sửa) đi chung một hook: cùng
 * trả về đơn mới, cùng phải nạp lại danh sách. Bước nhận và sửa còn đổi phiếu nhập kho — nạp lại cả
 * danh sách phiếu nhập và Trang chủ.
 */
export function useBakeryOrderAction(id: string) {
  const queryClient = useQueryClient();
  const onSuccess = (order: BakeryOrder) => {
    queryClient.setQueryData(["bakery-orders", id], order);
    queryClient.invalidateQueries({ queryKey: ["bakery-orders"] });
    if (order.status === "COMPLETED") {
      queryClient.invalidateQueries({ queryKey: ["stock-imports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  };
  return {
    confirm: useMutation({
      mutationFn: (items: BakeryOrderStepItems) => api.post<BakeryOrder>(`/bakery-orders/${id}/confirm`, { items }),
      onSuccess,
    }),
    reject: useMutation({ mutationFn: () => api.post<BakeryOrder>(`/bakery-orders/${id}/reject`), onSuccess }),
    cancel: useMutation({ mutationFn: () => api.post<BakeryOrder>(`/bakery-orders/${id}/cancel`), onSuccess }),
    pickUp: useMutation({
      mutationFn: (items: BakeryOrderStepItems) => api.post<BakeryOrder>(`/bakery-orders/${id}/pickup`, { items }),
      onSuccess,
    }),
    receive: useMutation({
      mutationFn: (data: { items: BakeryOrderStepItems; receivedAt?: string }) =>
        api.post<WithAffected>(`/bakery-orders/${id}/receive`, data),
      onSuccess,
    }),
    editReceived: useMutation({
      mutationFn: (data: { items: BakeryOrderStepItems; receivedAt: string }) =>
        api.put<WithAffected>(`/bakery-orders/${id}/received`, data),
      onSuccess,
    }),
  };
}
