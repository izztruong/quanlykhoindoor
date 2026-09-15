import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { PermissionCatalog, Role } from "@/types";

export interface RoleInput {
  name: string;
  permissions: string[];
}

/** Danh sách mã quyền do server khai (modules/roles/permissions.ts) — web không chép lại. */
export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["roles", "catalog"],
    queryFn: () => api.get<PermissionCatalog>("/roles/catalog"),
    staleTime: Infinity,
  });
}

export type RoleOption = Pick<Role, "id" | "name" | "isSystem" | "permissions">;

/** Ô chọn vai trò ở trang Tài khoản — cần USERS.VIEW hoặc ROLES.VIEW. */
export function useRoleOptions() {
  return useQuery({
    queryKey: ["roles", "options"],
    queryFn: () => api.get<{ items: RoleOption[] }>("/roles/options").then((r) => r.items),
  });
}

export function useRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => api.get<{ items: Role[] }>("/roles").then((r) => r.items),
    enabled: options?.enabled ?? true,
  });
}

function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["roles", "list"] });
    queryClient.invalidateQueries({ queryKey: ["roles", "options"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
    // Quyền của chính mình có thể vừa đổi nếu đang giữ vai trò đó (server chặn, nhưng làm tươi cho chắc).
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (data: RoleInput) => api.post<Role>("/roles", data),
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, ...data }: RoleInput & { id: string }) => api.put<Role>(`/roles/${id}`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: invalidate,
  });
}
