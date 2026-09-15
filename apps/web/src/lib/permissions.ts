import { requiredPermissionFor } from "@/components/layout/nav-config";
import type { AuthUser } from "@/types";
import { useCurrentUser } from "./auth";

/**
 * Kiểm quyền phía giao diện — chỉ để ẩn menu/nút cho gọn mắt. Chặn thật nằm ở server
 * (requirePermission trong apps/server/src/middleware/auth.ts); danh sách mã hợp lệ ở
 * apps/server/src/modules/roles/permissions.ts.
 */
export function can(user: AuthUser | null | undefined, resource: string, action = "VIEW"): boolean {
  if (!user) return false;
  return user.isSystem || user.permissions.includes(`${resource}.${action}`);
}

/** Mã dạng "RESOURCE.ACTION" — dùng cho nav-config. */
export function hasPermission(user: AuthUser | null | undefined, code: string): boolean {
  const [resource, action] = code.split(".");
  return can(user, resource, action);
}

/** Thấy và thao tác dữ liệu của mọi quán (mã DATA.SCOPE_ALL) — quyết định có hiện ô lọc "Quán" hay không. */
export function hasScopeAll(user: AuthUser | null | undefined): boolean {
  return user?.scope === "ALL";
}

/**
 * Có mở được trang ở đường dẫn này không — cùng luật với chặn trang ở app/(app)/layout.tsx, nên
 * nút "Tạo phiếu" chỉ cần truyền href, không phải tự nhớ mã quyền của trang đích.
 */
export function canOpen(user: AuthUser | null | undefined, href: string): boolean {
  const required = requiredPermissionFor(href);
  return !required || hasPermission(user, required);
}

export function useCan() {
  const { data: user } = useCurrentUser();
  return {
    user,
    can: (resource: string, action = "VIEW") => can(user, resource, action),
    canOpen: (href: string) => canOpen(user, href),
    scopeAll: hasScopeAll(user),
  };
}
