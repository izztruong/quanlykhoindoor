import Constants from "expo-constants";
import { clearAuthToken, getAuthToken } from "./authToken";

/**
 * Máy thật không gọi được "localhost" của máy dev, nên khi không khai báo EXPO_PUBLIC_API_URL thì
 * lấy đúng IP LAN mà Expo đang dùng để phục vụ bundle — điện thoại đã kết nối được tới IP đó rồi.
 */
function defaultApiUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000/api` : "http://localhost:4000/api";
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl();

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Gọi khi server báo phiên hết hiệu lực, để tầng giao diện đá về màn đăng nhập. */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // App native không đọc được cookie httpOnly nên mang token bằng header; server chấp nhận cả hai
  // (xem readToken trong apps/server/src/middleware/auth.ts).
  const token = await getAuthToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore body parse errors, keep statusText
    }
    if (res.status === 401 && !options.signal?.aborted && token && token === await getAuthToken()) {
      // Đổi mật khẩu làm tăng tokenVersion ⇒ mọi token cũ chết ngay; giữ lại chỉ tổ lỗi vòng lặp.
      await clearAuthToken();
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params?: Record<string, string | number | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

export const api = {
  query,
  get: <T>(path: string, params?: Record<string, string | number | undefined>) => request<T>(`${path}${query(params)}`),
  post: <T>(path: string, body?: unknown, options?: { signal?: AbortSignal }) =>
    request<T>(path, { ...options, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: { signal?: AbortSignal }) => request<T>(path, { ...options, method: "DELETE" }),
};
