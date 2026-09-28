import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PagedResult, PosItemMapping, PosMappingSuggestion, PosSaleDay, PosSaleSource, ShiftDefinition } from "@/types";

export interface PosSaleRowInput {
  /** YYYY-MM-DD. Chuỗi ngày thuần, KHÔNG phải Date — chuỗi không có múi giờ nên không bị trừ 7 tiếng. */
  soldOn: string;
  hour: number;
  posName: string;
  quantity: number;
}

export interface PosImportResult {
  written: number;
  daysReplaced: number;
  /** Tên POS chưa ánh xạ. Khác rỗng nghĩa là KHÔNG có gì được ghi — phải ánh xạ rồi nhập lại. */
  unmappedNames: string[];
  /** Tên đã khai "bỏ qua" nên bị loại khỏi lần nhập này. Báo lại để không ai tưởng là mất dữ liệu. */
  ignoredNames: string[];
}

/** Giá trị trong ô chọn tương ứng với "bỏ qua tên này" — gửi lên server thành null. */
export const IGNORE_MAPPING = "__IGNORE__";

export function usePosSaleDays(params: { userId?: string; page?: number }) {
  return useQuery({
    queryKey: ["pos-sales", params.userId ?? "all", params.page ?? 1],
    queryFn: () =>
      api.get<{ items: PosSaleDay[]; total: number; page: number; pageSize: number }>("/pos-sales", {
        userId: params.userId,
        page: params.page,
      }),
  });
}

export function useImportPosSales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId?: string; rows: PosSaleRowInput[] }) =>
      api.post<PosImportResult>("/pos-sales/import", data),
    onSuccess: (result) => {
      // Thiếu ánh xạ thì không có gì được ghi, làm mới danh sách là vô nghĩa.
      if (result.unmappedNames.length === 0) queryClient.invalidateQueries({ queryKey: ["pos-sales"] });
    },
  });
}

export function useDeletePosSaleDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { userId: string; soldOn: string }) =>
      api.delete<void>(`/pos-sales/day?userId=${encodeURIComponent(params.userId)}&soldOn=${params.soldOn}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-sales"] }),
  });
}

export function usePosItemMappings() {
  return useQuery({
    queryKey: ["pos-item-mappings"],
    queryFn: () => api.get<{ items: PosItemMapping[] }>("/pos-item-mappings").then((r) => r.items),
  });
}

/** Gợi ý món cho nhiều tên POS một lượt — gọi từng dòng thì vài trăm món là vài trăm request. */
export function useSuggestPosMappings() {
  return useMutation({
    mutationFn: (posNames: string[]) =>
      api.post<{ items: PosMappingSuggestion[] }>("/pos-item-mappings/suggest", { posNames }).then((r) => r.items),
  });
}

export function useSavePosItemMappings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { posNameRaw: string; finishedGoodItemId: string | null }[]) =>
      api.put<{ items: PosItemMapping[] }>("/pos-item-mappings", { items }),
    onSuccess: (data) => queryClient.setQueryData(["pos-item-mappings"], data.items),
  });
}

export function useDeletePosItemMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/pos-item-mappings/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pos-item-mappings"] }),
  });
}

export function useShiftDefinitions() {
  return useQuery({
    queryKey: ["shift-definitions"],
    queryFn: () => api.get<{ items: ShiftDefinition[] }>("/shift-definitions").then((r) => r.items),
  });
}

export function useSaveShiftDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ShiftDefinition, "id">) => api.put<ShiftDefinition>("/shift-definitions", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-definitions"] }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Nhập TAY theo DÒNG (ngày × giờ × món)
// ─────────────────────────────────────────────────────────────────────────────

export interface PosSaleRowItem {
  id: string;
  soldOn: string;
  hour: number;
  quantity: string | number;
  source: PosSaleSource;
  finishedGoodItem: { id: string; code: string; name: string };
}

/** Danh sách dòng doanh số, lọc theo quán + khoảng ngày, phân trang 20. */
export function usePosSaleRows(params: { userId?: string; from: string; to: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["pos-sale-rows", params],
    queryFn: () =>
      api.get<PagedResult<PosSaleRowItem>>("/pos-sales/rows", {
        userId: params.userId,
        from: params.from,
        to: params.to,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
      }),
  });
}

export interface ManualRowKey {
  soldOn: string;
  hour: number;
  finishedGoodItemId: string;
}

export interface SaveManualRowsResult {
  written: number;
  deleted: number;
  /** Trong số `written`, bao nhiêu dòng là ghi đè lên dòng đã có. */
  replaced: number;
}

export function useSaveManualRows() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      userId?: string;
      upserts?: (ManualRowKey & { quantity: number })[];
      deletes?: ManualRowKey[];
    }) => api.post<SaveManualRowsResult>("/pos-sales/manual", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pos-sale-rows"] });
      queryClient.invalidateQueries({ queryKey: ["pos-sale-days"] });
    },
  });
}
