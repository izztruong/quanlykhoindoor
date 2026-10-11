import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompressedImage } from "@/lib/imageCompress";
import type { AffectedCostCheck, PagedResult, StockImport, StockImportImage } from "@/types";

const KEY = "stock-imports";

export interface StockImportItemInput {
  productId: string;
  quantity: number;
  costPrice: number;
  note?: string;
}

/**
 * Không có `status` (server luôn ghi COMPLETED) và không có `customerId`. `supplierId` bắt buộc —
 * mỗi phiếu là một chuyến giao từ một NCC, xem stockTransaction.schemas.ts.
 */
export interface StockImportInput {
  type: string;
  /** ISO. Phải có GIỜ — đây là mốc kỳ Check Cost dùng. */
  transactionAt: string;
  form: string;
  note?: string;
  warehouseId: string;
  supplierId: string;
  items: StockImportItemInput[];
}

/** Mọi đường ghi đều trả về danh sách phiếu Check Cost cần tạo lại. */
type WithAffected<T> = T & { affectedCostChecks: AffectedCostCheck[] };

export function useStockImports(
  filter: { warehouseId?: string; type?: string; from?: string; to?: string; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: [KEY, filter],
    queryFn: () => api.get<PagedResult<StockImport>>("/stock-imports", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useStockImport(id: string) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: () => api.get<StockImport>(`/stock-imports/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateStockImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockImportInput) => api.post<WithAffected<StockImport>>("/stock-imports", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      // Số liệu Check Cost và Trang chủ đọc từ phiếu nhập.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateStockImport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockImportInput) => api.put<WithAffected<StockImport>>(`/stock-imports/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteStockImport() {
  const queryClient = useQueryClient();
  return useMutation({
    // Route này trả 200 + affectedCostChecks chứ không 204 — xem stockImports.routes.ts.
    mutationFn: (id: string) => api.delete<{ affectedCostChecks: AffectedCostCheck[] }>(`/stock-imports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** URL ảnh là URL ký có hạn 1 giờ — chỉ tải khi mở phần chứng từ của phiếu. */
export function useStockImportImages(id: string, enabled = true) {
  return useQuery({
    queryKey: [KEY, id, "images"],
    queryFn: () => api.get<StockImportImage[]>(`/stock-imports/${id}/images`),
    enabled: Boolean(id) && enabled,
  });
}

export function useUploadStockImportImages(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (images: CompressedImage[]) =>
      api.post<{ created: number }>(`/stock-imports/${id}/images`, {
        images: images.map(({ contentType, dataBase64 }) => ({ contentType, dataBase64 })),
      }),
    // Invalidate [KEY, id] kéo theo cả danh sách ảnh (cùng tiền tố) lẫn imageCount trong chi tiết.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, id] }),
  });
}

export function useDeleteStockImportImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/stock-imports/${id}/images/${imageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY, id] }),
  });
}
