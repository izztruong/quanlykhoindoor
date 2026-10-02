import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OtherExpense, OtherExpenseImage, PagedResult } from "@/types";

export interface OtherExpenseInput {
  /** "YYYY-MM-DD" — cột DATE ở server, không gửi kèm giờ. */
  spentAt: string;
  /** Id tài khoản quán. Bắt buộc ở mọi đường ghi, server kiểm lại đúng là vai trò "là quán". */
  shopId: string;
  content: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  note?: string;
}

/** Danh sách kèm tổng tiền của CẢ bộ lọc (không phải của trang đang xem). */
export type OtherExpenseListResult = PagedResult<OtherExpense> & { totalAmount: string | number };

export interface OtherExpenseFilter {
  from?: string;
  to?: string;
  search?: string;
  /** Lọc theo quán chi. Khác phạm vi dữ liệu — phạm vi vẫn do server ép theo người tạo. */
  shopId?: string;
  page?: number;
  pageSize?: number;
}

export function useOtherExpenses(filter: OtherExpenseFilter = {}) {
  return useQuery({
    queryKey: ["other-expenses", filter],
    queryFn: () => api.get<OtherExpenseListResult>("/other-expenses", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useCreateOtherExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: OtherExpenseInput) => api.post<OtherExpense>("/other-expenses", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

/** Nhận id lúc gọi: form còn phải sửa lại chính bản ghi vừa tạo nếu bước đính ảnh hỏng. */
export function useUpdateOtherExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: OtherExpenseInput }) =>
      api.put<OtherExpense>(`/other-expenses/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

export function useDeleteOtherExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/other-expenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

export function useImportOtherExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: OtherExpenseInput[]) => api.post<{ created: number }>("/other-expenses/bulk-import", { items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["other-expenses"] }),
  });
}

/** URL ảnh chỉ ký khi thực sự cần xem — vì vậy tách hẳn khỏi truy vấn danh sách. */
export function useOtherExpenseImages(id: string) {
  return useQuery({
    queryKey: ["other-expenses", id, "images"],
    queryFn: () => api.get<OtherExpenseImage[]>(`/other-expenses/${id}/images`),
    enabled: Boolean(id),
  });
}

export interface OtherExpenseImageInput {
  contentType: string;
  dataBase64: string;
}

/** Nhận id lúc gọi chứ không lúc tạo hook: khoản chi mới chưa có id cho tới khi server trả về. */
export function useUploadOtherExpenseImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: OtherExpenseImageInput[] }) =>
      api.post<{ created: number }>(`/other-expenses/${id}/images`, { images }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-expenses"] });
    },
  });
}

export function useDeleteOtherExpenseImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/other-expenses/${id}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["other-expenses"] });
    },
  });
}
