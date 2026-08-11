import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuthUser } from "@/types";

export interface ManagedUser extends AuthUser {
  /** Chỉ có sau khi người dùng đã nhắn cho bot Zalo và được gán ID ở trang Thông báo Zalo. */
  zaloChatId: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "STAFF";
}

export function useUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: ManagedUser[] }>("/users").then((r) => r.items),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<ManagedUser>("/users", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

/** Gán hoặc gỡ Zalo chat ID của một tài khoản (chuỗi rỗng = gỡ). */
export function useUpdateUserZaloChatId() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, zaloChatId }: { id: string; zaloChatId: string | null }) =>
      api.patch<ManagedUser>(`/users/${id}`, { zaloChatId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
