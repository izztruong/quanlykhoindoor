import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { api } from "@/lib/apiClient";
import type { AppNotification, NotificationPreference, NotificationType } from "@/types";
import { useInfiniteList } from "./useInfiniteList";

const KEY = ["notifications"] as const;

export function useNotificationList() {
  return useInfiniteList<AppNotification>([...KEY, "list"], "/notifications");
}

/**
 * Số chưa đọc cho chấm đỏ trên chuông. Không có refetchOnWindowFocus trên điện thoại, nên tự tải lại
 * khi app quay về foreground — lúc đó thường vừa bấm vào một thông báo từ thanh thông báo.
 */
export function useUnreadNotificationCount(enabled: boolean) {
  const query = useQuery({
    queryKey: [...KEY, "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.count),
    enabled,
  });

  const { refetch } = query;
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refetch();
    });
    return () => sub.remove();
  }, [enabled, refetch]);

  return query;
}

// Đánh dấu đã đọc là thao tác nền — không bắn toast "Thành công" như các mutation lưu dữ liệu khác.
const silent = { meta: { silent: true } };

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    ...silent,
    mutationFn: (id: string) => api.post<void>(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    ...silent,
    mutationFn: () => api.post<void>("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [...KEY, "preferences"],
    queryFn: () => api.get<{ items: NotificationPreference[] }>("/notifications/preferences").then((r) => r.items),
  });
}

/** Cập nhật lạc quan: công tắc gạt ngay, lỗi thì trả về như cũ. */
export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  const key = [...KEY, "preferences"];
  return useMutation({
    ...silent,
    mutationFn: (input: { type: NotificationType; enabled: boolean }) =>
      api.put<void>("/notifications/preferences", input),
    onMutate: async ({ type, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreference[]>(key);
      queryClient.setQueryData<NotificationPreference[]>(key, (items) =>
        items?.map((item) => (item.type === type ? { ...item, enabled } : item)),
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
  });
}
