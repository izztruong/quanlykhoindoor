import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { CostCheck, CostCheckPosPreview, CostCheckStatus } from "@/types";

/**
 * SL món đã bán KHÔNG còn nằm trong payload: server tự lấy từ doanh số POS theo kỳ của phiếu. Doanh
 * số POS chỉ nhập được trên web — mobile không có màn nào cho việc đó.
 */
export interface CostCheckCreateInput {
  userId: string;
  openingStockCheckId: string;
  closingStockCheckId: string;
  note?: string;
  discountTra?: number;
  discountDav?: number;
}

/**
 * Doanh số POS sẽ dùng cho kỳ đang chọn. Chạy ngay khi chọn đủ hai phiếu kiểm kê, để thấy trước chứ
 * không bấm Lưu rồi mới ăn 409.
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

export function useCostCheck(id: string) {
  return useQuery({
    queryKey: ["cost-checks", id],
    queryFn: () => api.get<CostCheck>(`/cost-checks/${id}`),
    enabled: Boolean(id),
  });
}

function useInvalidateCostChecks() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ["cost-checks"] }),
    client.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
}

export function useCreateCostCheck() {
  const invalidate = useInvalidateCostChecks();
  return useMutation({
    mutationFn: (data: CostCheckCreateInput) => api.post<CostCheck>("/cost-checks", data),
    onSuccess: invalidate,
  });
}

export function useUpdateCostCheckStatus(id: string) {
  const invalidate = useInvalidateCostChecks();
  return useMutation({
    mutationFn: (status: CostCheckStatus) => api.patch<CostCheck>(`/cost-checks/${id}/status`, { status }),
    onSuccess: invalidate,
  });
}
