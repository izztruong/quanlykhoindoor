import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PrepMode, ShiftCode, ShiftPrepTarget } from "@/types";

export interface ShiftPrepTargetInput {
  finishedGoodItemId: string;
  shift: ShiftCode;
  mode: PrepMode;
  targetLevel: number | null;
}

export function useShiftPrepTargets(userId?: string) {
  return useQuery({
    queryKey: ["shift-prep-targets", userId ?? "self"],
    queryFn: () => api.get<{ items: ShiftPrepTarget[] }>("/shift-prep-targets", { userId }).then((r) => r.items),
  });
}

export function useSaveShiftPrepTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; items: ShiftPrepTargetInput[] }) =>
      api.put<{ items: ShiftPrepTarget[] }>("/shift-prep-targets", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shift-prep-targets"] }),
  });
}
