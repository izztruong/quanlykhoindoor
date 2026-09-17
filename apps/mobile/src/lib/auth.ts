import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@/types";
import { api } from "./apiClient";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";
import { unregisterPushToken } from "./pushNotifications";

/** Kết quả đăng nhập: server trả thêm `token` cho client không phải trình duyệt. */
interface LoginResponse {
  user: AuthUser;
  token: string;
}

/**
 * `null` = chắc chắn chưa đăng nhập (không có token, hoặc token đã bị server từ chối). Khác với
 * `undefined` lúc đang tải — màn hình gác cửa dựa vào đúng khác biệt này để không nháy về /login.
 */
export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      // Chưa có token thì đừng gọi API: mở app lần đầu sẽ ăn một lần 401 vô ích, mà trên gói free
      // của Render lần gọi đầu còn phải chờ server thức dậy 30–60 giây.
      const token = await getAuthToken();
      if (!token) return null;
      return api.get<{ user: AuthUser }>("/auth/me").then((r) => r.user);
    },
    retry: false,
  });
}

function useStoreSession() {
  const queryClient = useQueryClient();
  return async ({ user, token }: LoginResponse) => {
    await setAuthToken(token);
    queryClient.setQueryData(["auth", "me"], user);
  };
}

export function useLogin() {
  const storeSession = useStoreSession();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) => api.post<LoginResponse>("/auth/login", data),
    onSuccess: storeSession,
  });
}

/** `credential` là ID token do luồng đăng nhập Google trả về. */
export function useGoogleLogin() {
  const storeSession = useStoreSession();
  return useMutation({
    mutationFn: (credential: string) => api.post<LoginResponse>("/auth/google", { credential }),
    onSuccess: storeSession,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Xoá token trước: kể cả khi server không trả lời (mất mạng, Render đang ngủ) thì máy này
      // cũng đã đăng xuất thật sự.
      try {
        // Gỡ token thông báo trước, lúc bearer còn sống — không thì máy này vẫn nhận thông báo của
        // tài khoản vừa đăng xuất.
        await unregisterPushToken();
        await api.post<void>("/auth/logout");
      } finally {
        await clearAuthToken();
      }
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(["auth", "me"], null);
    },
  });
}

/** Đổi mật khẩu làm tăng tokenVersion ⇒ token hiện tại chết theo, phải đăng nhập lại. */
export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.patch<void>("/auth/password", data),
    onSuccess: async () => {
      // Token phiên đã chết phía server ngay khi đổi mật khẩu, nên lời gỡ này thường nhận 401 và bị
      // bỏ qua — không sao: lần đăng nhập lại, server upsert token sang đúng phiên mới.
      await unregisterPushToken();
      await clearAuthToken();
      queryClient.clear();
      queryClient.setQueryData(["auth", "me"], null);
    },
  });
}

export function useChangeEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; currentPassword: string }) =>
      api.patch<{ user: AuthUser }>("/profile/email", data).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });
}
