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

/**
 * Ký token dùng chung cho cả hai cách mang phiên: cookie (web) và header Bearer (app mobile).
 * Token chỉ mang định danh; quyền đọc lại từ DB mỗi request (xem requireAuth).
 */
export function signAuthToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

/**
 * Dùng chung cho mọi cách đăng nhập (mật khẩu, Google). Trả lại chính token đã ký để route đăng
 * nhập gửi kèm trong body cho client không phải trình duyệt — app native không đọc được cookie
 * httpOnly nên phải tự giữ token.
 */
export function setAuthCookie(res: Response, payload: TokenPayload): string {
  const token = signAuthToken(payload);
  res.cookie(env.cookieName, token, { ...authCookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
  return token;
}
