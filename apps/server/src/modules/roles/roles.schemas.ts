import { z } from "zod";

export const roleUpsertSchema = z.object({
  name: z.string().trim().min(1, "Tên vai trò không được để trống").max(100),
  permissions: z.array(z.string()).default([]),
  isShop: z.boolean().default(false),
});
