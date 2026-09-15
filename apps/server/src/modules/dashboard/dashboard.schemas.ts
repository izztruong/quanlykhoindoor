import { z } from "zod";

// Trống = tất cả quán. Phạm vi SELF bị ownerWhere ép về chính mình ở route, không tin giá trị này.
const userIdField = z.string().trim().optional().transform((value) => value || undefined);

export const dashboardUserQuerySchema = z.object({
  userId: userIdField,
});

export const dashboardCostQuerySchema = z.object({
  userId: userIdField,
  // Năm của biểu đồ; trống thì lấy năm hiện tại theo giờ VN (tính ở service).
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});
