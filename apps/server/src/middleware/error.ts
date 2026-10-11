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

  // Mã lỗi có thể nằm ở chính error (Prisma bọc được) HOẶC ở `cause` (driver adapter trả lỗi
  // Postgres thô, lúc đó error ngoài là PrismaClientUnknownRequestError KHÔNG có `code`). Không đọc
  // cả hai chỗ thì mọi lỗi ràng buộc đi qua nhánh dưới và người dùng nhận 500 "Lỗi hệ thống".
  const errorCode = (() => {
    if (!err || typeof err !== "object") return undefined;
    const outer = (err as { code?: unknown }).code;
    if (typeof outer === "string") return outer;
    const cause = (err as { cause?: { code?: unknown } }).cause;
    return typeof cause?.code === "string" ? cause.code : undefined;
  })();

  if (errorCode) {
    const prismaErr = { code: errorCode, meta: (err as { meta?: { target?: string[] } }).meta };
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
    // 23001 = restrict_violation: Postgres dùng mã RIÊNG này khi bị `ON DELETE RESTRICT` chặn, khác
    // 23503. Thiếu nó thì xoá một danh mục đang được tham chiếu trả 500 thay vì 409.
    if (prismaErr.code === "P2003" || prismaErr.code === "23503" || prismaErr.code === "23001") {
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
