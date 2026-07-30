import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { HttpError } from "../../utils/httpError";
import { requireAuth, type AuthUser } from "../../middleware/auth";

export const authRouter = Router();

// Slows down credential-stuffing/brute-force attempts against the small internal
// account list — keyed by IP since failed logins don't have a stable user identity yet.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút" },
});

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
  // Frontend and API live on different domains in production (e.g. Vercel +
  // Render), so the cookie must be SameSite=None to survive cross-site
  // fetch — which browsers only allow when Secure is also set. Locally
  // they're same-site over http, where None+non-secure would be rejected,
  // so "lax" without Secure is used instead.
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

authRouter.post("/login", loginRateLimit, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion };
  setAuthCookie(res, authUser);
  res.json({ user: authUser });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    secure: env.nodeEnv === "production",
  });
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
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
  res.status(204).send();
});
