import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { env } from "../config/env";
import { HttpError } from "../utils/httpError";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF";
  tokenVersion: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.cookieName];
  if (!token) {
    next(new HttpError(401, "Chưa đăng nhập"));
    return;
  }
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthUser;
    // A password change bumps User.tokenVersion, which immediately invalidates every
    // cookie issued before that moment — otherwise a stolen cookie outlives a reset.
    const current = await prisma.user.findUnique({ where: { id: decoded.id }, select: { tokenVersion: true } });
    if (!current || current.tokenVersion !== decoded.tokenVersion) {
      next(new HttpError(401, "Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại"));
      return;
    }
    req.user = decoded;
    next();
  } catch {
    next(new HttpError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"));
  }
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, "Không có quyền thực hiện thao tác này"));
      return;
    }
    next();
  };
}
