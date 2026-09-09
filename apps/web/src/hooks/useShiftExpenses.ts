import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, ShiftExpense, ShiftExpenseType } from "@/types";

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

export function useUpdateShiftExpense(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ShiftExpenseInput) => api.put<ShiftExpense>(`/shift-expenses/${id}`, data),
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
