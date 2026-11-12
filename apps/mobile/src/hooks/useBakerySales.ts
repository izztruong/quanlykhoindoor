import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { BakerySaleRowKey } from "@/types";

/** Danh sách dòng đọc qua useInfiniteList ở màn danh sách; file này chỉ lo phần ghi. */
export interface SaveBakerySalesResult {
  written: number;
  deleted: number;
  replaced: number;
}

/**
 * `bakeryUserId` bỏ trống = chính tài khoản đang đăng nhập (server `resolveTargetUserId`); khai tài
 * khoản khác cần `DATA.SCOPE_ALL`. Nhập lại cùng ô (ngày, người mua, bánh) là GHI ĐÈ.
 */
export function useSaveBakerySales() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      bakeryUserId?: string;
      upserts: (BakerySaleRowKey & { quantity: number })[];
      deletes: BakerySaleRowKey[];
    }) => api.post<SaveBakerySalesResult>("/bakery-sales/manual", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bakery-sales"] }),
  });
}
