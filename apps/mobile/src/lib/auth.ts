import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@/types";
import { api } from "./apiClient";
import { clearAuthToken, getAuthToken, setAuthToken } from "./authToken";
import { unregisterPushToken } from "./pushNotifications";

/** Kết quả đăng nhập: server trả thêm `token` cho client không phải trình duyệt. */
interface LoginResponse {
  user: AuthUser;
  token: string;
}

// Phiên mới chỉ được lưu sau khi tác vụ đăng xuất cũ đã xoá token và dọn cache xong.
let pendingLogout: Promise<void> | null = null;
let finishLogout: (() => void) | undefined;

/** Giữ query mà RootNavigator đang theo dõi; clear() làm observer bị tách khỏi phiên mới. */
function resetSessionCache(queryClient: QueryClient) {
  void queryClient.cancelQueries({ queryKey: ["auth", "me"], exact: true });
  queryClient.removeQueries({
    predicate: ({ queryKey }) => !(queryKey.length === 2 && queryKey[0] === "auth" && queryKey[1] === "me"),
  });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(["auth", "me"], null);
}

/**
 * `null` = chắc chắn chưa đăng nhập (không có token, hoặc token đã bị server từ chối). Khác với
 * `undefined` lúc đang tải — màn hình gác cửa dựa vào đúng khác biệt này để không nháy về /login.
 */
export function useCurrentUser() {
  return useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      if (pendingLogout) return null;
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
  return async ({ user, token }: LoginResponse, rememberLogin: boolean) => {
    await pendingLogout;
    await setAuthToken(token, rememberLogin);
    // /auth/me của phiên cũ trả về muộn không được ghi đè người vừa đăng nhập.
    await queryClient.cancelQueries({ queryKey: ["auth", "me"], exact: true });
    queryClient.setQueryData(["auth", "me"], user);
  };
}

export function useLogin() {
  const storeSession = useStoreSession();
  return useMutation({
    // Toast chung chạy trước onSuccess lưu phiên; điều hướng mới là dấu hiệu đăng nhập xong.
    meta: { silent: true },
    mutationFn: ({ email, password }: { email: string; password: string; rememberLogin: boolean }) =>
      api.post<LoginResponse>("/auth/login", { email, password }),
    onSuccess: (session, variables) => storeSession(session, variables.rememberLogin),
  });
}

/** `credential` là ID token do luồng đăng nhập Google trả về. */
export function useGoogleLogin() {
  const storeSession = useStoreSession();
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ credential }: { credential: string; rememberLogin: boolean }) =>
      api.post<LoginResponse>("/auth/google", { credential }),
    onSuccess: (session, variables) => storeSession(session, variables.rememberLogin),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true },
    onMutate: () => {
      pendingLogout = new Promise<void>((resolve) => { finishLogout = resolve; });
      // Huỷ các truy vấn cũ để /auth/me đang tải không đưa người dùng trở lại trang chủ.
      void queryClient.cancelQueries();
      queryClient.setQueryData(["auth", "me"], null);
    },
    mutationFn: async () => {
      // Signal đánh dấu hết thời gian chờ và chặn ghi local/gọi logout muộn.
      // unregisterPushToken không dùng signal này để huỷ yêu cầu gỡ token trên server.
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const cleanup = async () => {
          await unregisterPushToken(controller.signal);
          if (!controller.signal.aborted) {
            await api.post<void>("/auth/logout", undefined, { signal: controller.signal });
          }
        };
        await Promise.race([
          cleanup().catch(() => undefined),
          new Promise<void>((resolve) => {
            timeout = setTimeout(() => { controller.abort(); resolve(); }, 3000);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
        controller.abort();
        // cached token được xoá ngay cả khi SecureStore không sẵn sàng.
        await clearAuthToken().catch(() => undefined);
      }
    },
    onSettled: () => {
      resetSessionCache(queryClient);
      finishLogout?.();
      finishLogout = undefined;
      pendingLogout = null;
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
      resetSessionCache(queryClient);
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
