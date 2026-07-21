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
    // P2003 là mã Prisma bọc lại; 23503 là mã gốc Postgres cho cùng lỗi vi phạm khoá ngoại — xuất
    // hiện trực tiếp khi driver adapter (@prisma/adapter-pg) đôi lúc không bọc lại được.
    if (prismaErr.code === "P2003" || prismaErr.code === "23503") {
      res.status(409).json({ message: "Không thể thực hiện vì dữ liệu đang được tham chiếu" });
      return;
    }
    // 57014 = Postgres query_canceled — thường do câu lệnh chạy quá lâu (thiếu index, bảng lớn).
    if (prismaErr.code === "57014") {
      res.status(504).json({ message: "Thao tác mất quá nhiều thời gian, vui lòng thử lại" });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
}
