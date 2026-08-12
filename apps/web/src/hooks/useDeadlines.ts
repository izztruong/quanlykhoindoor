import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Deadline, DeadlineKind } from "@/types";

export interface DeadlineInput {
  kind: DeadlineKind;
  /** Luôn gửi (null với loại không dùng thứ) để phía server khỏi phải đoán ý nghĩa của "thiếu trường". */
  weekday: number | null;
  periodWeekday: number | null;
  graceDays: number;
  hour: number;
  minute: number;
}

export function useDeadlines() {
  return useQuery({
    queryKey: ["deadlines"],
    queryFn: () => api.get<{ items: Deadline[] }>("/deadlines").then((r) => r.items),
  });
}

/** Upsert theo `kind` — mỗi loại chỉ có đúng một dòng nên không cần id. */
export function useSaveDeadline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeadlineInput) => api.put<Deadline>("/deadlines", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deadlines"] }),
  });
}
