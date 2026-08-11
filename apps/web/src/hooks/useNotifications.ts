import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ZaloBotStatus {
  configured: boolean;
  bot: { id?: string; account_name?: string; display_name?: string } | null;
  /** Có token nhưng gọi API thất bại (token sai, Zalo lỗi...) — hiển thị nguyên văn cho admin. */
  error?: string;
}

export interface ZaloChatCandidate {
  chatId: string;
  displayName: string | null;
  lastMessage: string | null;
}

export function useZaloBotStatus() {
  return useQuery({
    queryKey: ["zalo-bot-status"],
    queryFn: () => api.get<ZaloBotStatus>("/notifications/zalo/status"),
  });
}

/**
 * Danh sách người vừa nhắn cho bot. `enabled: false` để chỉ gọi khi admin bấm "Tải danh sách" —
 * đây là thao tác cài đặt một lần, không cần chạy mỗi lần mở trang.
 */
export function useZaloChatCandidates() {
  return useQuery({
    queryKey: ["zalo-chat-candidates"],
    queryFn: () => api.get<{ items: ZaloChatCandidate[] }>("/notifications/zalo/updates").then((r) => r.items),
    enabled: false,
    retry: false,
  });
}

/** Bỏ trống `userId` = gửi cho chính mình; truyền vào = admin gửi thử hộ tài khoản đó. */
export function useSendZaloTest() {
  return useMutation({ mutationFn: (userId?: string) => api.post<{ ok: boolean }>("/notifications/zalo/test", { userId }) });
}
