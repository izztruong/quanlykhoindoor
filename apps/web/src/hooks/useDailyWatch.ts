import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DailyWatchRun, DailyWatchRunSummary } from "@/types";

/** Lượt gần nhất, hoặc lượt của một ngày cụ thể. */
export function useDailyWatch(businessDate?: string) {
  return useQuery({
    queryKey: ["daily-watch", businessDate ?? "latest"],
    queryFn: () => api.get<{ run: DailyWatchRun | null }>("/daily-watch", { businessDate }).then((r) => r.run),
  });
}

export function useDailyWatchHistory() {
  return useQuery({
    queryKey: ["daily-watch-history"],
    queryFn: () => api.get<{ items: DailyWatchRunSummary[] }>("/daily-watch/history").then((r) => r.items),
  });
}

/** Chạy lại lượt của hôm nay. Server bỏ qua bước bắn thông báo cho lượt bấm tay. */
export function useRunDailyWatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ run: DailyWatchRun }>("/daily-watch/run", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-watch"] });
      queryClient.invalidateQueries({ queryKey: ["daily-watch-history"] });
    },
  });
}
