import { Router } from "express";
import { Expo } from "expo-server-sdk";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { preferenceUpdateSchema, pushTokenSchema } from "./notifications.schemas";
import { listPreferences } from "./notifications.service";

/**
 * Thông báo của CHÍNH người đang đăng nhập. Cố ý không gắn requirePermission — cùng loại ngoại lệ
 * với /api/profile: mọi truy vấn đều lọc cứng theo req.user.id nên không có dữ liệu người khác để lộ,
 * và ai đăng nhập được cũng phải xem được thông báo của mình.
 */
export const notificationsRouter = Router();

function currentUserId(userId: string | undefined): string {
  if (!userId) throw new HttpError(401, "Chưa đăng nhập");
  return userId;
}

notificationsRouter.get("/", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = { userId };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ items, total, page, pageSize, unreadCount });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  const count = await prisma.notification.count({ where: { userId, readAt: null } });
  res.json({ count });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  res.status(204).send();
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  // updateMany kèm userId: đoán id thông báo của người khác thì chỉ cập nhật 0 dòng, không lộ gì.
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).send();
});

notificationsRouter.get("/preferences", async (req, res) => {
  const user = req.user;
  if (!user) throw new HttpError(401, "Chưa đăng nhập");
  const role = await prisma.role.findUnique({ where: { id: user.roleId }, select: { isShop: true } });
  res.json({ items: await listPreferences({ user, isShop: role?.isShop ?? false }) });
});

notificationsRouter.put("/preferences", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  const { type, enabled } = preferenceUpdateSchema.parse(req.body);
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, enabled },
    update: { enabled },
  });
  res.status(204).send();
});

/**
 * Ghi token của máy. Upsert THEO TOKEN: máy đó đăng nhập tài khoản khác thì token chuyển sang chủ
 * mới, nên tài khoản cũ thôi nhận thông báo trên máy này kể cả khi không kịp gỡ lúc đăng xuất.
 */
notificationsRouter.post("/push-tokens", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  const { token, platform } = pushTokenSchema.parse(req.body);
  if (!Expo.isExpoPushToken(token)) throw new HttpError(400, "Push token không hợp lệ");

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, userId, platform },
    update: { userId, platform },
  });
  res.status(204).send();
});

notificationsRouter.delete("/push-tokens/:token", async (req, res) => {
  const userId = currentUserId(req.user?.id);
  // Chỉ gỡ được token đang thuộc về chính mình.
  await prisma.pushToken.deleteMany({ where: { token: req.params.token, userId } });
  res.status(204).send();
});
