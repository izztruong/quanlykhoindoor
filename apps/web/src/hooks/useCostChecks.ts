import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CostCheck, CostCheckPosPreview, CostCheckStatus, PagedResult } from "@/types";

/**
 * SL món đã bán KHÔNG còn nằm trong payload: server tự lấy từ doanh số POS theo kỳ của phiếu. Người
 * lập phiếu chỉ còn khai khuyến mãi. Xem `GET /cost-checks/pos-preview` để xem trước số sẽ dùng.
 */
export interface CostCheckCreateInput {
  userId: string;
  openingStockCheckId: string;
  closingStockCheckId: string;
  note?: string;
  discountTra?: number;
  discountDav?: number;
}

export function useCostCheckList(filter: { from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["cost-checks", filter],
    queryFn: () => api.get<PagedResult<CostCheck>>("/cost-checks", { ...filter, pageSize: filter.pageSize ?? 20 }),
  });
}

export function useCostCheck(id: string) {
  return useQuery({
    queryKey: ["cost-checks", id],
    queryFn: () => api.get<CostCheck>(`/cost-checks/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Doanh số POS sẽ dùng cho kỳ đang chọn. Chạy ngay khi chọn đủ hai phiếu kiểm kê, để người dùng thấy
 * trước chứ không ăn 409 sau khi đã điền xong form.
 */
export function useCostCheckPosPreview(params: { userId: string; openingStockCheckId: string; closingStockCheckId: string }) {
  const ready = Boolean(params.userId && params.openingStockCheckId && params.closingStockCheckId);
  return useQuery({
    queryKey: ["cost-checks", "pos-preview", params],
    queryFn: () => api.get<CostCheckPosPreview>("/cost-checks/pos-preview", params),
    enabled: ready,
    retry: false,
  });
}

export function useCreateCostCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CostCheckCreateInput) => api.post<CostCheck>("/cost-checks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cost-checks"] }),
  });
}

export function useUpdateCostCheckStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: CostCheckStatus) => api.patch<CostCheck>(`/cost-checks/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-checks"] });
      queryClient.invalidateQueries({ queryKey: ["cost-checks", id] });
    },
  });
}
