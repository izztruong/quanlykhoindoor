import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { SCOPE_ALL_CODE, type PermissionAction, type PermissionResource } from "../modules/roles/permissions";
import { HttpError } from "../utils/httpError";

/** Nội dung JWT — chỉ định danh. Quyền KHÔNG nằm trong token, xem requireAuth. */
export interface TokenPayload {
  id: string;
  tokenVersion: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  isSystem: boolean;
  permissions: string[];
  /** "ALL" = dữ liệu mọi quán, "SELF" = chỉ dữ liệu chính mình tạo. */
  scope: "ALL" | "SELF";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Đọc tài khoản + quyền tươi từ DB mỗi request, trong đúng một query vốn đã phải chạy để kiểm
 * tokenVersion. Không nhét quyền vào JWT: nếu nhét, admin gỡ quyền thì token cũ vẫn giữ quyền cho
 * tới khi hết hạn 7 ngày.
 */
export async function loadAuthUser(id: string): Promise<(AuthUser & { tokenVersion: number }) | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      tokenVersion: true,
      role: { select: { id: true, name: true, isSystem: true, permissions: true } },
    },
  });
  if (!user) return null;
  const { role } = user;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tokenVersion: user.tokenVersion,
    roleId: role.id,
    roleName: role.name,
    isSystem: role.isSystem,
    permissions: role.permissions,
    scope: role.isSystem || role.permissions.includes(SCOPE_ALL_CODE) ? "ALL" : "SELF",
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.cookieName];
  if (!token) {
    next(new HttpError(401, "Chưa đăng nhập"));
    return;
  }
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    next(new HttpError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
    return;
  }
  try {
    // A password change bumps User.tokenVersion, which immediately invalidates every
    // cookie issued before that moment — otherwise a stolen cookie outlives a reset.
    const current = await loadAuthUser(decoded.id);
    if (!current || current.tokenVersion !== decoded.tokenVersion) {
      next(new HttpError(401, "Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại"));
      return;
    }
    const { tokenVersion: _tokenVersion, ...user } = current;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function can(user: AuthUser | undefined, resource: PermissionResource, action: PermissionAction): boolean {
  if (!user) return false;
  return user.isSystem || user.permissions.includes(`${resource}.${action}`);
}

function actionOf(method: string): PermissionAction {
  if (method === "POST") return "ADD";
  if (method === "PUT" || method === "PATCH") return "EDIT";
  if (method === "DELETE") return "DELETE";
  return "VIEW";
}

/**
 * Cổng quyền cho route. Không truyền `action` thì suy từ phương thức HTTP (GET → VIEW, POST → ADD,
 * PUT/PATCH → EDIT, DELETE → DELETE); route nghiệp vụ không khớp kiểu CRUD thì truyền tường minh.
 * Chỉ nhận mã hành động — mã phạm vi thu hẹp dữ liệu qua ownerWhere/assertOwner, không chặn route.
 */
export function requirePermission(resource: PermissionResource, action?: PermissionAction) {
  return <P>(req: Request<P>, _res: Response, next: NextFunction) => {
    if (!can(req.user, resource, action ?? actionOf(req.method))) {
      next(new HttpError(403, "Bạn không có quyền thực hiện thao tác này"));
      return;
    }
    next();
  };
}

/**
 * Cổng cho dữ liệu tra cứu mà nhiều nghiệp vụ cùng cần đọc (vd bảng giá NCC dùng ở phiếu nhập,
 * phiếu điều chuyển, xác nhận đơn): có một trong các mã là qua.
 */
export function requireAnyPermission(...codes: `${PermissionResource}.${PermissionAction}`[]) {
  return <P>(req: Request<P>, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !(user.isSystem || codes.some((code) => user.permissions.includes(code)))) {
      next(new HttpError(403, "Bạn không có quyền thực hiện thao tác này"));
      return;
    }
    next();
  };
}

/**
 * Điều kiện `createdById` cho truy vấn danh sách. Phạm vi "ALL" thì theo tham số lọc client gửi
 * (bỏ trống = tất cả); "SELF" thì ép về chính mình, bỏ qua tham số client — ẩn ô lọc trên giao
 * diện không phải lớp bảo vệ.
 */
export function ownerWhere(user: AuthUser | undefined, requestedCreatedById?: string): string | undefined {
  if (user?.scope === "ALL") return requestedCreatedById || undefined;
  return user?.id ?? "__none__";
}

/**
 * Chốt một bản ghi theo phạm vi, dùng trước khi đọc chi tiết/sửa/xoá. Ngoài phạm vi trả 404 như
 * không tồn tại — vừa chặn vừa không tiết lộ là bản ghi có thật.
 */
export function assertOwner(record: { createdById: string | null }, user: AuthUser | undefined, notFoundMessage: string) {
  if (user?.scope === "ALL") return;
  if (!user || record.createdById !== user.id) throw new HttpError(404, notFoundMessage);
}
