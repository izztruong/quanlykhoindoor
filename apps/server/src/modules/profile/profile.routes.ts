import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../config/db";
import { loadAuthUser } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";

// Tự sửa tài khoản của chính mình — chỉ cần đăng nhập, không gắn requirePermission
// (cùng lý do với /auth/password).
export const profileRouter = Router();

const changeEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  currentPassword: z.string().min(1, "Chưa nhập mật khẩu hiện tại"),
});

profileRouter.patch("/email", async (req, res) => {
  const { email, currentPassword } = changeEmailSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản");

  // Bắt buộc mật khẩu: email là chìa khoá đăng nhập Google, nên ai lấy được cookie mà đổi được
  // email sang Gmail của họ là chiếm luôn tài khoản, kể cả sau khi cookie bị thu hồi.
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(401, "Mật khẩu hiện tại không đúng");

  // So không phân biệt hoa thường vì đăng nhập Google tra email theo kiểu đó.
  const taken = await prisma.user.findFirst({
    where: { id: { not: user.id }, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new HttpError(409, "Email đã được dùng cho tài khoản khác");

  await prisma.user.update({ where: { id: user.id }, data: { email } });
  const { tokenVersion: _tokenVersion, ...authUser } = (await loadAuthUser(user.id))!;
  res.json({ user: authUser });
});
