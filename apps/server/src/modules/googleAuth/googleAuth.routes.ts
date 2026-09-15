import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { loadAuthUser } from "../../middleware/auth";
import { setAuthCookie } from "../../utils/authCookie";
import { HttpError } from "../../utils/httpError";

export const googleAuthRouter = Router();

const googleClient = new OAuth2Client();

const googleLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Thử đăng nhập quá nhiều lần, vui lòng thử lại sau ít phút" },
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
});

/**
 * Nhận ID token do nút Google Identity Services trả về trên trình duyệt. Chỉ cho vào tài khoản
 * đã có sẵn trùng email — không tự tạo tài khoản, vì vai trò/quyền phải do admin gán.
 */
googleAuthRouter.post("/", googleLoginRateLimit, async (req, res) => {
  if (!env.googleClientId) throw new HttpError(503, "Chưa cấu hình đăng nhập Google");
  const { credential } = googleLoginSchema.parse(req.body);

  let email: string | undefined;
  try {
    // audience bắt buộc: thiếu nó thì token cấp cho app KHÁC của Google cũng lọt qua.
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const payload = ticket.getPayload();
    if (payload?.email_verified) email = payload.email;
  } catch {
    throw new HttpError(401, "Phiên đăng nhập Google không hợp lệ, vui lòng thử lại");
  }
  if (!email) throw new HttpError(401, "Tài khoản Google chưa xác minh email");

  const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (!user) {
    throw new HttpError(401, `Gmail ${email} chưa gắn với tài khoản nào, vui lòng liên hệ quản trị viên`);
  }

  setAuthCookie(res, { id: user.id, tokenVersion: user.tokenVersion });
  const { tokenVersion: _tokenVersion, ...authUser } = (await loadAuthUser(user.id))!;
  res.json({ user: authUser });
});
