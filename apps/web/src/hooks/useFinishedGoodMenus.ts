import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface FinishedGoodMenuItemInput {
  finishedGoodItemId: string;
  assigned: boolean;
}

interface MenuResponse {
  shopUserId: string;
  finishedGoodItemIds: string[];
}

/** Món sẽ chuyển thành "mọi quán" nếu lưu — body của câu 409 từ `PUT /finished-good-menus`. */
export interface WillBecomeGlobalItem {
  code: string;
  name: string;
}

/**
 * Danh sách id món đã gán cho một quán. MẢNG RỖNG = quán đó chưa gán gì, tức đang thấy mọi món —
 * không phải "quán không có món nào".
 */
export function useFinishedGoodMenu(shopUserId?: string) {
  return useQuery({
    queryKey: ["finished-good-menus", shopUserId ?? "none"],
    queryFn: () =>
      api.get<MenuResponse>("/finished-good-menus", { shopUserId }).then((r) => r.finishedGoodItemIds),
    enabled: Boolean(shopUserId),
  });
}

export function useSaveFinishedGoodMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { shopUserId: string; items: FinishedGoodMenuItemInput[]; confirmGlobal?: boolean }) =>
      api.put<MenuResponse>("/finished-good-menus", data),
    onSuccess: (data) => {
      queryClient.setQueryData(["finished-good-menus", data.shopUserId], data.finishedGoodItemIds);
      // Danh mục đang hiện nhãn "gán cho N quán" và các ô chọn của quán đều lọc theo menu, nên cả
      // hai phải tải lại sau khi gán.
      queryClient.invalidateQueries({ queryKey: ["finished-good-items"] });
    },
  });
}

/** Lấy `willBecomeGlobal` ra khỏi câu 409 — trả rỗng nếu lỗi không phải ca đó. */
export function readWillBecomeGlobal(error: unknown): WillBecomeGlobalItem[] {
  const data = (error as { status?: number; data?: { willBecomeGlobal?: unknown } } | null)?.data;
  const list = data?.willBecomeGlobal;
  return Array.isArray(list) ? (list as WillBecomeGlobalItem[]) : [];
}
