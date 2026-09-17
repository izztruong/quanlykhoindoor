import { z } from "zod";
import { NotificationType } from "../../generated/prisma/client";

export const preferenceUpdateSchema = z.object({
  type: z.enum(Object.values(NotificationType) as [NotificationType, ...NotificationType[]], {
    message: "Loại thông báo không hợp lệ",
  }),
  enabled: z.boolean(),
});

export const pushTokenSchema = z.object({
  // Chỉ nhận token Expo, vd "ExponentPushToken[xxxxxxxx]". Kiểm kỹ hơn bằng Expo.isExpoPushToken ở route.
  token: z.string().trim().min(1, "Thiếu push token"),
  platform: z.enum(["ios", "android"]).optional(),
});
