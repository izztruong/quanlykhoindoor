import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CentralPurchasingRow } from "@/types";

/**
 * Hàng mua tập trung — số liệu toàn chuỗi, chỉ admin đọc được.
 *
 * Dùng `useQuery` (khác `usePreviewReorderSuggestions` dùng `useMutation`): ở đây không có ô nào người
 * dùng gõ, mọi con số suy từ dữ liệu đã có, nên mở trang là tính luôn.
 */
export function useCentralPurchasing() {
  return useQuery({
    queryKey: ["central-purchasing"],
    queryFn: () => api.get<{ items: CentralPurchasingRow[] }>("/central-purchasing").then((r) => r.items),
  });
}
