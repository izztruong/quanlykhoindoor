import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { AffectedCostCheck, MaterialWaste, MaterialWasteImage, PagedResult } from "@/types";

export interface MaterialWasteItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  note?: string;
  deductInCostCheck?: boolean;
}

export interface MaterialWasteFinishedItemInput {
  finishedGoodItemId: string;
  quantity: number;
  note?: string;
  deductInCostCheck?: boolean;
}

export interface MaterialWasteCreateInput {
  wasteAt?: string;
  note?: string;
  items: MaterialWasteItemInput[];
  finishedItems: MaterialWasteFinishedItemInput[];
}

export function useMaterialWasteList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["material-waste", filter],
    queryFn: () => api.get<PagedResult<MaterialWaste>>("/material-waste", { ...filter, pageSize: filter.pageSize ?? 20 }),
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

export function useUpdateMaterialWaste(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialWasteCreateInput) =>
      api.put<MaterialWaste & { affectedCostChecks: AffectedCostCheck[] }>(`/material-waste/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-waste"] });
      queryClient.invalidateQueries({ queryKey: ["material-waste", id] });
    },
  });
}

export interface MaterialWasteDeductionsInput {
  items: { id: string; deductInCostCheck: boolean }[];
  finishedItems: { id: string; deductInCostCheck: boolean }[];
}

/** Chỉ đổi ô tích "trừ trong Check Cost" — cần MATERIAL_WASTE.DEDUCT, không cần quyền sửa phiếu. */
export function useUpdateMaterialWasteDeductions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialWasteDeductionsInput) =>
      api.patch<MaterialWaste & { affectedCostChecks: AffectedCostCheck[] }>(`/material-waste/${id}/deductions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-waste"] });
      queryClient.invalidateQueries({ queryKey: ["material-waste", id] });
    },
  });
}

/** URL ảnh là URL ký có hạn 1 giờ — chỉ tải khi mở chi tiết hoặc form sửa phiếu. */
export function useMaterialWasteImages(id: string) {
  return useQuery({
    queryKey: ["material-waste", id, "images"],
    queryFn: () => api.get<MaterialWasteImage[]>(`/material-waste/${id}/images`),
    enabled: Boolean(id),
  });
}

export interface MaterialWasteImageInput {
  contentType: string;
  dataBase64: string;
}

/** Nhận id lúc gọi chứ không lúc tạo hook: phiếu mới chưa có id cho tới khi server trả về. */
export function useUploadMaterialWasteImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: MaterialWasteImageInput[] }) =>
      api.post<{ created: number }>(`/material-waste/${id}/images`, { images }),
    onSuccess: (_data, { id }) => queryClient.invalidateQueries({ queryKey: ["material-waste", id, "images"] }),
  });
}

/** Cần MATERIAL_WASTE.EDIT — gỡ ảnh đã lưu là sửa phiếu. */
export function useDeleteMaterialWasteImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/material-waste/${id}/images/${imageId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["material-waste", id, "images"] }),
  });
}
