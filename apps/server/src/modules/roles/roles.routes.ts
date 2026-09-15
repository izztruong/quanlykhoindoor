import { Router } from "express";
import { prisma } from "../../config/db";
import { requireAnyPermission, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { ACTION_LABELS, PERMISSION_RESOURCES, SCOPE_ALL_CODE, SCOPE_ALL_LABEL, sanitizePermissions } from "./permissions";
import { roleUpsertSchema } from "./roles.schemas";

export const rolesRouter = Router();

const roleSelect = {
  id: true,
  name: true,
  isSystem: true,
  isShop: true,
  permissions: true,
  createdAt: true,
  _count: { select: { users: true } },
};

// Chỉ cần đăng nhập: là danh sách tĩnh, trang Tài khoản cũng cần để hiện tên quyền.
rolesRouter.get("/catalog", (_req, res) => {
  res.json({
    resources: PERMISSION_RESOURCES,
    actionLabels: ACTION_LABELS,
    scopeAll: { code: SCOPE_ALL_CODE, label: SCOPE_ALL_LABEL },
  });
});

// Cho ô chọn vai trò ở trang Tài khoản — người quản lý tài khoản không nhất thiết có ROLES.VIEW.
// Kèm permissions để giao diện khoá sẵn những vai trò rộng hơn người đang thao tác.
rolesRouter.get("/options", requireAnyPermission("USERS.VIEW", "ROLES.VIEW"), async (_req, res) => {
  const items = await prisma.role.findMany({
    select: { id: true, name: true, isSystem: true, permissions: true },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });
  res.json({ items });
});

rolesRouter.get("/", requirePermission("ROLES"), async (req, res) => {
  // Danh sách nhỏ, trả một lần rồi phân trang ở web — giống danh sách tài khoản.
  const { skip, take, page, pageSize } = parsePagination(req, 500);
  const [items, total] = await Promise.all([
    prisma.role.findMany({ select: roleSelect, orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }], skip, take }),
    prisma.role.count(),
  ]);
  res.json({ items, total, page, pageSize });
});

rolesRouter.post("/", requirePermission("ROLES"), async (req, res) => {
  const data = roleUpsertSchema.parse(req.body);
  const permissions = sanitizePermissions(data.permissions, req.user!);
  const role = await prisma.role.create({ data: { name: data.name, isShop: data.isShop, permissions }, select: roleSelect });
  res.status(201).json(role);
});

rolesRouter.put("/:id", requirePermission("ROLES"), async (req, res) => {
  const id = req.params.id as string;
  const data = roleUpsertSchema.parse(req.body);

  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy vai trò");
  // Vai trò hệ thống là phao cứu sinh: không ai sửa được, kể cả chính nó.
  if (existing.isSystem) throw new HttpError(400, "Không thể sửa vai trò hệ thống");
  // Sửa vai trò của chính mình thì tự cấp/gỡ quyền cho mình được — chặn hẳn cho khỏi tự khoá mình
  // hoặc lách luật cấp quyền qua một vai trò rộng hơn.
  if (existing.id === req.user!.roleId) throw new HttpError(400, "Không thể sửa vai trò bạn đang giữ");

  const permissions = sanitizePermissions(data.permissions, req.user!, existing.permissions);
  const role = await prisma.role.update({
    where: { id },
    data: { name: data.name, isShop: data.isShop, permissions },
    select: roleSelect,
  });
  res.json(role);
});

rolesRouter.delete("/:id", requirePermission("ROLES"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.role.findUnique({ where: { id }, select: roleSelect });
  if (!existing) throw new HttpError(404, "Không tìm thấy vai trò");
  if (existing.isSystem) throw new HttpError(400, "Không thể xoá vai trò hệ thống");
  if (existing._count.users > 0) {
    throw new HttpError(409, `Vai trò đang được gán cho ${existing._count.users} tài khoản, hãy đổi vai trò các tài khoản đó trước`);
  }
  // Xoá vai trò đồng nghĩa gỡ mọi quyền trong đó — cũng không được gỡ quyền mình không nắm.
  sanitizePermissions([], req.user!, existing.permissions);
  await prisma.role.delete({ where: { id } });
  res.status(204).send();
});
