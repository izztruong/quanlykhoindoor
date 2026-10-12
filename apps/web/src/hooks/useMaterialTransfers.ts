import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AffectedCostCheck, MaterialTransfer, PagedResult } from "@/types";

export interface MaterialTransferItemInput {
  productId: string;
  wholeQuantity?: number;
  looseQuantity?: number;
  supplierId?: string;
  costPrice?: number;
  note?: string;
}

export interface MaterialTransferCreateInput {
  fromUserId: string;
  toUserId: string;
  transferAt?: string;
  note?: string;
  items: MaterialTransferItemInput[];
}

export function useMaterialTransferList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["material-transfers", filter],
    queryFn: () => api.get<PagedResult<MaterialTransfer>>("/material-transfers", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useMaterialTransfer(id: string) {
  return useQuery({
    queryKey: ["material-transfers", id],
    queryFn: () => api.get<MaterialTransfer>(`/material-transfers/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateMaterialTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialTransferCreateInput) => api.post<MaterialTransfer>("/material-transfers", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["material-transfers"] }),
  });
}

export function useUpdateMaterialTransfer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MaterialTransferCreateInput) =>
      api.put<MaterialTransfer & { affectedCostChecks: AffectedCostCheck[] }>(`/material-transfers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["material-transfers", id] });
    },
  });
}

/** Một phiếu trùng (quán gửi, quán nhận, thời gian) đã có trong hệ thống — server trả ở bước cảnh báo. */
export interface MaterialTransferDuplicate {
  code: string;
  fromName: string;
  toName: string;
  transferAt: string;
}

export interface MaterialTransferBulkResult {
  created: number;
  codes: string[];
  affectedCostChecks: AffectedCostCheck[];
  /** Có phần tử **và** `created === 0` nghĩa là chưa ghi gì, đang chờ người dùng xác nhận. */
  duplicates: MaterialTransferDuplicate[];
}

/**
 * Nhập nhiều phiếu từ một file Excel. Lần gửi đầu để `confirmDuplicates` false: có phiếu trùng thì
 * server trả `created: 0` kèm danh sách, chưa ghi gì — gửi lại với `true` mới ghi.
 */
export function useBulkImportMaterialTransfers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ items, confirmDuplicates }: { items: MaterialTransferCreateInput[]; confirmDuplicates: boolean }) =>
      api.post<MaterialTransferBulkResult>("/material-transfers/bulk-import", { items, confirmDuplicates }),
    onSuccess: (result) => {
      // Lần trả về chỉ để cảnh báo trùng thì chưa có gì đổi, khỏi nạp lại danh sách.
      if (result.created === 0) return;
      queryClient.invalidateQueries({ queryKey: ["material-transfers"] });
      // Check Cost và Trang chủ đọc số điều chuyển.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
