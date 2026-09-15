import { z } from "zod";

export const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  name: z.string().min(1),
  roleId: z.string().min(1, "Chưa chọn vai trò"),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1),
  roleId: z.string().min(1, "Chưa chọn vai trò"),
  // Bỏ trống = giữ mật khẩu cũ.
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").optional().or(z.literal("")),
});
