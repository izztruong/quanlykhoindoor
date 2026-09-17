import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { authCookieOptions, setAuthCookie } from "../../utils/authCookie";
import { HttpError } from "../../utils/httpError";
import { loadAuthUser, requireAuth } from "../../middleware/auth";

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

authRouter.post("/login", loginRateLimit, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Email hoặc mật khẩu không đúng");

  // token trả kèm cho client không phải trình duyệt (app mobile) — web bỏ qua và dùng cookie.
  const token = setAuthCookie(res, { id: user.id, tokenVersion: user.tokenVersion });
  const { tokenVersion: _tokenVersion, ...authUser } = (await loadAuthUser(user.id))!;
  res.json({ user: authUser, token });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(env.cookieName, authCookieOptions);
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
