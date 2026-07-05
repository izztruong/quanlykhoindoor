import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Không tìm thấy route: ${req.method} ${req.path}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ message: "Dữ liệu không hợp lệ", issues: err.issues });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    const prismaErr = err as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === "P2002") {
      res.status(409).json({ message: `Dữ liệu đã tồn tại (trùng ${prismaErr.meta?.target?.join(", ") ?? "giá trị duy nhất"})` });
      return;
    }
    if (prismaErr.code === "P2025") {
      res.status(404).json({ message: "Không tìm thấy bản ghi" });
      return;
    }
    if (prismaErr.code === "P2003") {
      res.status(409).json({ message: "Không thể thực hiện vì dữ liệu đang được tham chiếu" });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
}
