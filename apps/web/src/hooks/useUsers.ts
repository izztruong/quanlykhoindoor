import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

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

/**
 * Chỉ id, tên, email — cho ô chọn/lọc theo quán ở các trang nghiệp vụ — mọi tài khoản đăng nhập đều gọi được.
 * Mặc định chỉ tài khoản thuộc vai trò "là quán"; `all` lấy mọi tài khoản (vd lọc theo người lập phiếu).
 */
export function useUserOptions(options?: { enabled?: boolean; all?: boolean }) {
  const all = options?.all ?? false;
  return useQuery({
    queryKey: ["users", "options", { all }],
    queryFn: () => api.get<{ items: UserOption[] }>("/users/options", { all: all ? 1 : undefined }).then((r) => r.items),
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
