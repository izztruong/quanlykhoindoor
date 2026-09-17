import type { AuthUser, PermissionAction, PermissionCatalog, Role } from "@/types";
import type { RoleOption } from "@/hooks/useRoles";
import type { ManagedUser } from "@/hooks/useUsers";

export function isAssignableRole(role: RoleOption, actor: AuthUser | null | undefined) {
  return !!actor && (actor.isSystem || (!role.isSystem && role.permissions.every((code) => actor.permissions.includes(code))));
}

export function userRoleLockReason(user: ManagedUser, actor: AuthUser | null | undefined, systemCount: number) {
  if (user.id === actor?.id) return "Không thể tự đổi vai trò của chính mình.";
  if (user.role.isSystem && systemCount <= 1) return "Đây là quản trị viên cuối cùng, không hạ vai trò được.";
  return "";
}

export function userDeleteLockReason(user: ManagedUser, actor: AuthUser | null | undefined, systemCount: number) {
  if (user.id === actor?.id) return "Không thể tự xoá tài khoản của chính mình";
  if (user.role.isSystem && systemCount <= 1) return "Không thể xoá quản trị viên cuối cùng";
  return "";
}

export function roleEditLockReason(role: Role, actor: AuthUser | null | undefined) {
  if (role.isSystem) return "Không thể sửa hoặc xoá vai trò hệ thống.";
  if (role.id === actor?.roleId) return "Không thể sửa hoặc xoá vai trò của chính mình.";
  return "";
}

export function toggleRolePermission(selected: ReadonlySet<string>, resource: PermissionCatalog["resources"][number],
  action: PermissionAction, checked: boolean, editable: (code: string) => boolean): Set<string> {
  const next = new Set(selected);
  const code = `${resource.resource}.${action}`;
  if (!editable(code)) return next;
  if (checked) {
    next.add(code);
    const view = `${resource.resource}.VIEW`;
    if (action !== "VIEW" && resource.actions.includes("VIEW") && editable(view)) next.add(view);
  } else {
    next.delete(code);
    if (action === "VIEW") for (const other of resource.actions) {
      const otherCode = `${resource.resource}.${other}`;
      if (editable(otherCode)) next.delete(otherCode);
    }
  }
  return next;
}
