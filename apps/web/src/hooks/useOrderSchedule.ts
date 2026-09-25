import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/**
 * Các thứ trong tuần quán gọi đồ (1 = Thứ 2 … 7 = Chủ nhật), dùng chung mọi quán.
 *
 * Quyết định số ngày một đơn phải phủ, nhưng **con số đó do server tính** và trả kèm `preview` — hook
 * này chỉ để khai lịch ở trang Quản trị, không dùng để tính lại ở web.
 */
export function useOrderSchedule() {
  return useQuery({
    queryKey: ["order-schedule"],
    queryFn: () => api.get<{ weekdays: number[] }>("/order-schedule").then((r) => r.weekdays),
  });
}

export function useSaveOrderSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weekdays: number[]) => api.put<{ weekdays: number[] }>("/order-schedule", { weekdays }),
    onSuccess: (data) => {
      queryClient.setQueryData(["order-schedule"], data.weekdays);
      // Đổi lịch gọi làm đổi số ngày phủ, tức đổi SL đề xuất — bỏ cache gợi ý cũ.
      queryClient.invalidateQueries({ queryKey: ["reorder-suggestions"] });
    },
  });
}
