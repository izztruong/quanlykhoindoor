import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission, type AuthUser } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { userCreateSchema, userUpdateSchema } from "./users.schemas";

export const usersRouter = Router();

const userSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
  role: { select: { id: true, name: true, isSystem: true } },
};

/**
 * Gán vai trò cũng là một đường cấp quyền, nên chịu cùng luật với sửa vai trò: người không thuộc
 * vai trò hệ thống chỉ gán được vai trò có bộ quyền nằm gọn trong quyền của chính mình, và không
 * bao giờ gán được vai trò hệ thống.
 */
async function assertAssignableRole(roleId: string, actor: AuthUser) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new HttpError(400, "Vai trò không tồn tại");
  if (actor.isSystem) return role;
  if (role.isSystem) throw new HttpError(403, "Bạn không thể gán vai trò hệ thống");
  const own = new Set(actor.permissions);
  const beyond = role.permissions.filter((code) => !own.has(code));
  if (beyond.length > 0) {
    throw new HttpError(403, `Vai trò này có quyền mà chính bạn không có: ${beyond.join(", ")}`);
  }
  return role;
}

/** Tài khoản đang thuộc vai trò rộng hơn người thao tác thì người đó không được đụng vào. */
async function assertManageableUser(target: { role: { isSystem: boolean; permissions: string[] } }, actor: AuthUser) {
  if (actor.isSystem) return;
  const own = new Set(actor.permissions);
  if (target.role.isSystem || target.role.permissions.some((code) => !own.has(code))) {
    throw new HttpError(403, "Bạn không thể thao tác trên tài khoản có quyền rộng hơn mình");
  }
}

// Danh sách quán cho ô lọc / chọn quán ở các trang nghiệp vụ — chỉ id, tên, email nên chỉ cần đăng nhập.
// Tách khỏi GET "/" để trang đơn hàng, Check Cost, điều chuyển… không phải có quyền USERS.VIEW.
// Mặc định chỉ tài khoản thuộc vai trò "là quán" (Role.isShop) — admin hay tài khoản chỉ lập đề xuất
// chi không lẫn vào ô chọn quán. `?all=1` trả mọi tài khoản, cho ô lọc theo người lập.
usersRouter.get("/options", async (req, res) => {
  const all = req.query.all === "1";
  const items = await prisma.user.findMany({
    where: all ? undefined : { role: { isShop: true } },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ items });
});

usersRouter.get("/", requirePermission("USERS"), async (req, res) => {
  // Small, bounded list (internal staff/admin accounts) — the frontend fetches it in one
  // page (pageSize defaults high) and paginates the display client-side, since a couple of
  // its own checks (e.g. "is this the last remaining admin?") need the complete list at once.
  const { skip, take, page, pageSize } = parsePagination(req, 500);
  const [items, total] = await Promise.all([
    prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" }, skip, take }),
    prisma.user.count(),
  ]);
  res.json({ items, total, page, pageSize });
});

usersRouter.post("/", requirePermission("USERS"), async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  await assertAssignableRole(data.roleId, req.user!);
  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name, roleId: data.roleId },
    select: userSelect,
  });
  res.status(201).json(user);
});

usersRouter.put("/:id", requirePermission("USERS"), async (req, res) => {
  const id = req.params.id as string;
  const data = userUpdateSchema.parse(req.body);

  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) throw new HttpError(404, "Không tìm thấy tài khoản");
  await assertManageableUser(target, req.user!);

  const roleChanged = target.roleId !== data.roleId;
  if (roleChanged) {
    if (id === req.user!.id) throw new HttpError(400, "Không thể tự đổi vai trò của chính mình");
    const newRole = await assertAssignableRole(data.roleId, req.user!);
    if (target.role.isSystem && !newRole.isSystem) {
      const systemCount = await prisma.user.count({ where: { role: { isSystem: true } } });
      if (systemCount <= 1) throw new HttpError(400, "Không thể hạ vai trò của quản trị viên cuối cùng");
    }
  }

  const passwordData = data.password
    ? // Đặt lại mật khẩu thì vô hiệu hoá luôn mọi phiên đang mở của tài khoản đó.
      { passwordHash: await bcrypt.hash(data.password, 10), tokenVersion: { increment: 1 } }
    : {};

  const user = await prisma.user.update({
    where: { id },
    data: { name: data.name, roleId: data.roleId, ...passwordData },
    select: userSelect,
  });
  res.json(user);
});

usersRouter.delete("/:id", requirePermission("USERS"), async (req, res) => {
  if (req.user?.id === req.params.id) {
    throw new HttpError(400, "Không thể tự xoá tài khoản của chính mình");
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id as string }, include: { role: true } });
  if (!target) throw new HttpError(404, "Không tìm thấy tài khoản");
  await assertManageableUser(target, req.user!);

  if (target.role.isSystem) {
    const systemCount = await prisma.user.count({ where: { role: { isSystem: true } } });
    if (systemCount <= 1) {
      throw new HttpError(400, "Không thể xoá quản trị viên cuối cùng");
    }
  }

  await prisma.user.delete({ where: { id: target.id } });
  res.status(204).send();
});
