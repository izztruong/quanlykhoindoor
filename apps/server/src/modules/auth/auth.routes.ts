import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { requireAuth, type AuthUser } from "../../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
});

function setAuthCookie(res: import("express").Response, user: AuthUser) {
  const token = jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  setAuthCookie(res, authUser);
  res.json({ user: authUser });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.cookieName);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.patch("/password", requireAuth, async (req, res) => {
  if (!req.user) throw new HttpError(401, "Chưa đăng nhập");
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(401, "Mật khẩu hiện tại không đúng");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).send();
});
