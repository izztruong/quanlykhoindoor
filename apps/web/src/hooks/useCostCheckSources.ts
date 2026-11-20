import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CostCheckSources } from "@/types";

/**
 * Phiếu gốc làm nên cột Nhận / Xuất / Đã huỷ của một nguyên liệu trên phiếu Check Cost (quán lẫn tiệm
 * bánh). Chỉ chạy khi đã chọn nguyên liệu — tức lúc người dùng bấm vào một ô số.
 */
export function useCostCheckSources(costCheckId: string, productId: string | null) {
  return useQuery({
    queryKey: ["cost-check-sources", costCheckId, productId],
    queryFn: () => api.get<CostCheckSources>(`/cost-check-sources/${costCheckId}`, { productId: productId ?? "" }),
    enabled: Boolean(costCheckId && productId),
  });
}
