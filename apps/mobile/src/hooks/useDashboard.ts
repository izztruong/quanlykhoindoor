import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { DashboardCostSummary, DashboardWasteSummary } from "@/types";

// Mỗi ô trang chủ gọi một endpoint riêng, `enabled` theo quyền của người xem để không bắn request
// chắc chắn 403. userId trống = tất cả quán (server tự ép về chính mình với phạm vi SELF).

/**
 * Phiếu nhập kho 7 ngày qua — thay ô "Đơn chưa xử lý" cũ. Đơn hàng giờ không có trạng thái "đã xử
 * lý xong" nào ở mức dữ liệu, nên đếm đơn chưa huỷ sẽ tăng mãi mà không nói lên điều gì.
 */
export function useRecentStockImports(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "recent-imports", userId],
    queryFn: () => api.get<{ count: number }>("/dashboard/recent-imports", { userId }).then((r) => r.count),
    enabled,
  });
}

export function useWasteSummary(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "waste-summary", userId],
    queryFn: () => api.get<DashboardWasteSummary>("/dashboard/waste-summary", { userId }),
    enabled,
  });
}

export function useCostSummary(userId: string, year: number, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "cost-summary", userId, year],
    queryFn: () => api.get<DashboardCostSummary>("/dashboard/cost-summary", { userId, year }),
    enabled,
    // Đổi năm biểu đồ thì giữ số cũ trên màn hình tới khi số mới về, khỏi nháy trống cả khối.
    placeholderData: (previous) => previous,
  });
}
