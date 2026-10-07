import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompressedImage } from "@/lib/imageCompress";
import type {
  AffectedCostCheck,
  PagedResult,
  SalesOrder,
  SalesOrderItemImage,
  SalesOrderListRow,
  SalesOrderStatus,
} from "@/types";

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
    mutationFn: (status: Extract<SalesOrderStatus, "CANCELLED">) => api.patch<SalesOrder>(`/sales-orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

export interface SalesOrderProcessLineInput {
  supplierId?: string;
  costPrice: number;
  quantity: number;
}

/** Một hàng hoá: itemId = hàng quán đã đặt, productId = hàng admin thêm mới (đúng một trong hai). */
export interface SalesOrderProcessItemInput {
  itemId?: string;
  productId?: string;
  /** ISO. Bỏ trống thì server giữ ngày đã lưu, chưa có thì lấy giờ lưu. */
  receivedAt?: string;
  note?: string;
  lines: SalesOrderProcessLineInput[];
}

/** Admin xử lý đơn (lần đầu hoặc sửa lại): ghi SL + ngày nhận, thay toàn bộ dòng phiếu xuất kho. */
export function useProcessSalesOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: SalesOrderProcessItemInput[]) =>
      api.put<SalesOrder & { affectedCostChecks: AffectedCostCheck[] }>(`/sales-orders/${id}/process`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

/** URL ảnh là URL ký có hạn 1 giờ — chỉ tải khi mở ảnh chứng từ của dòng đó. */
export function useSalesOrderItemImages(orderId: string, itemId: string, enabled = true) {
  return useQuery({
    queryKey: ["sales-orders", orderId, "items", itemId, "images"],
    queryFn: () => api.get<SalesOrderItemImage[]>(`/sales-orders/${orderId}/items/${itemId}/images`),
    enabled: Boolean(orderId && itemId) && enabled,
  });
}

/** Invalidate ["sales-orders", orderId] kéo theo cả danh sách ảnh (cùng tiền tố) lẫn imageCount trong chi tiết đơn. */
export function useUploadSalesOrderItemImages(orderId: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (images: CompressedImage[]) =>
      api.post<{ created: number }>(`/sales-orders/${orderId}/items/${itemId}/images`, {
        images: images.map(({ contentType, dataBase64 }) => ({ contentType, dataBase64 })),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-orders", orderId] }),
  });
}

export function useDeleteSalesOrderItemImage(orderId: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/sales-orders/${orderId}/items/${itemId}/images/${imageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales-orders", orderId] }),
  });
}
