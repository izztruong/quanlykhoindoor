const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
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
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
