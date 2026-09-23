import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, ShiftExpense, ShiftExpenseImage, ShiftExpenseType } from "@/types";

export interface ShiftExpenseInput {
  /** "YYYY-MM-DD" — cột DATE ở server, không gửi kèm giờ. */
  spentAt: string;
  type: ShiftExpenseType;
  content: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  note?: string;
}

/** Danh sách kèm tổng chi của CẢ bộ lọc (không phải của trang đang xem). */
export type ShiftExpenseListResult = PagedResult<ShiftExpense> & { totalAmount: string | number };

export interface ShiftExpenseFilter {
  from?: string;
  to?: string;
  type?: ShiftExpenseType | "";
  search?: string;
  createdById?: string;
  /** "true" = đã chi, "false" = chưa chi, "" = không lọc (api-client tự bỏ tham số rỗng). */
  paid?: "true" | "false" | "";
  page?: number;
  pageSize?: number;
}

export function useShiftExpenses(filter: ShiftExpenseFilter = {}) {
  return useQuery({
    queryKey: ["shift-expenses", filter],
    queryFn: () => api.get<ShiftExpenseListResult>("/shift-expenses", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useCreateShiftExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ShiftExpenseInput) => api.post<ShiftExpense>("/shift-expenses", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-expenses"] }),
  });
}

/** Nhận id lúc gọi: form còn phải sửa lại chính bản ghi vừa tạo nếu bước đính ảnh hỏng. */
export function useUpdateShiftExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ShiftExpenseInput }) =>
      api.put<ShiftExpense>(`/shift-expenses/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-expenses"] }),
  });
}

/**
 * Đánh dấu / bỏ đánh dấu "đã chi". Hai endpoint riêng cho hai chiều chứ không phải một toggle:
 * mỗi chiều idempotent nên bấm hai lần trên mạng chậm không lật ngược trạng thái.
 */
export function useToggleShiftExpensePaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paid }: { id: string; paid: boolean }) =>
      paid
        ? api.post<ShiftExpense>(`/shift-expenses/${id}/pay`)
        : api.delete<ShiftExpense>(`/shift-expenses/${id}/pay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-expenses"] }),
  });
}

export function useDeleteShiftExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/shift-expenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-expenses"] }),
  });
}

export function useImportShiftExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: ShiftExpenseInput[]) => api.post<{ created: number }>("/shift-expenses/bulk-import", { items }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-expenses"] }),
  });
}

/** URL ảnh chỉ ký khi thực sự cần xem — vì vậy tách hẳn khỏi truy vấn danh sách. */
export function useShiftExpenseImages(id: string) {
  return useQuery({
    queryKey: ["shift-expenses", id, "images"],
    queryFn: () => api.get<ShiftExpenseImage[]>(`/shift-expenses/${id}/images`),
    enabled: Boolean(id),
  });
}

export interface ShiftExpenseImageInput {
  contentType: string;
  dataBase64: string;
}

/** Nhận id lúc gọi chứ không lúc tạo hook: khoản chi mới chưa có id cho tới khi server trả về. */
export function useUploadShiftExpenseImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: ShiftExpenseImageInput[] }) =>
      api.post<{ created: number }>(`/shift-expenses/${id}/images`, { images }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-expenses"] });
    },
  });
}

export function useDeleteShiftExpenseImage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) => api.delete<void>(`/shift-expenses/${id}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-expenses"] });
    },
  });
}
