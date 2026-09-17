import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { DashboardCostSummary, DashboardWasteSummary } from "@/types";

// Mỗi ô trang chủ gọi một endpoint riêng, `enabled` theo quyền của người xem để không bắn request
// chắc chắn 403. userId trống = tất cả quán (server tự ép về chính mình với phạm vi SELF).

export function useUnconfirmedOrders(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard", "unconfirmed-orders", userId],
    queryFn: () => api.get<{ count: number }>("/dashboard/unconfirmed-orders", { userId }).then((r) => r.count),
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
