import { z } from "zod";

export const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "STAFF"]).default("STAFF"),
});

export const userUpdateSchema = z.object({
  // Chuỗi rỗng = xoá liên kết Zalo, nên map về null thay vì lưu "" (findMany lọc theo `not: null`).
  zaloChatId: z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable(),
});
