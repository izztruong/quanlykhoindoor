import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { PagedResult } from "@/types";

export function useReportList<T>(endpoint: string, params: Record<string, string | undefined>, options: { enabled?: boolean } = {}) {
  return useQuery({
    // Tách cache khỏi useInfiniteList vì cấu trúc dữ liệu khác nhau.
    queryKey: ["reports", endpoint, "all", params],
    queryFn: () => api.get<PagedResult<T>>(endpoint, params),
    enabled: options.enabled ?? true,
  });
}
