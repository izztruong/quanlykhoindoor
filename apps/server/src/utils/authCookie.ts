import type { Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { TokenPayload } from "../middleware/auth";

// Frontend and API live on different domains in production (e.g. Vercel +
// Render), so the cookie must be SameSite=None to survive cross-site
// fetch — which browsers only allow when Secure is also set. Locally
// they're same-site over http, where None+non-secure would be rejected,
// so "lax" without Secure is used instead.
export const authCookieOptions = {
  httpOnly: true,
  sameSite: env.nodeEnv === "production" ? ("none" as const) : ("lax" as const),
  secure: env.nodeEnv === "production",
};

/** Dùng chung cho mọi cách đăng nhập (mật khẩu, Google). */
export function setAuthCookie(res: Response, payload: TokenPayload) {
  // Token chỉ mang định danh; quyền đọc lại từ DB mỗi request (xem requireAuth).
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
  res.cookie(env.cookieName, token, { ...authCookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}
