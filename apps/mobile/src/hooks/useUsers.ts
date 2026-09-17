import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  role: { id: string; name: string; isSystem: boolean };
}

export interface UserOption {
  id: string;
  name: string;
  email: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  roleId: string;
}

export interface UpdateUserInput {
  name: string;
  roleId: string;
  /** Bỏ trống = giữ mật khẩu cũ. */
  password?: string;
}

/** Danh sách tài khoản đầy đủ cho trang quản trị — cần USERS.VIEW. */
export function useUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: ManagedUser[] }>("/users").then((r) => r.items),
    enabled: options?.enabled ?? true,
  });
}

/** "shop" = tài khoản quán · "other" = tài khoản không phải quán (vd người xác nhận) · "all" = tất cả. */
export type UserOptionScope = "shop" | "other" | "all";

/**
 * Chỉ id, tên, email — cho ô chọn/lọc tài khoản ở các trang nghiệp vụ — mọi tài khoản đăng nhập đều
 * gọi được. Mặc định chỉ tài khoản thuộc vai trò "là quán" (Role.isShop).
 */
export function useUserOptions(options?: { enabled?: boolean; scope?: UserOptionScope }) {
  const scope = options?.scope ?? "shop";
  return useQuery({
    queryKey: ["users", "options", { scope }],
    queryFn: () => api.get<{ items: UserOption[] }>("/users/options", { scope }).then((r) => r.items),
    enabled: options?.enabled ?? true,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<ManagedUser>("/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateUserInput & { id: string }) => api.put<ManagedUser>(`/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}
