import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { getZaloBotInfo, getZaloBotUpdates, isZaloBotConfigured, sendZaloMessage } from "./zaloBot.client";

export const notificationsRouter = Router();

const zaloTestSchema = z.object({ userId: z.string().optional() });

/** Token đã cấu hình chưa và có gọi được không — dùng cho phần trạng thái ở trang cấu hình. */
notificationsRouter.get("/zalo/status", async (_req, res) => {
  if (!isZaloBotConfigured()) {
    res.json({ configured: false, bot: null });
    return;
  }
  // Không để lỗi phía Zalo làm hỏng cả trang: trả về mô tả lỗi để hiển thị thay vì ném 502.
  try {
    const bot = await getZaloBotInfo();
    res.json({ configured: true, bot });
  } catch (err) {
    res.json({ configured: true, bot: null, error: err instanceof Error ? err.message : "Không gọi được Zalo Bot API" });
  }
});

/**
 * Danh sách người đã nhắn cho bot gần đây, để admin bấm chọn thay vì phải tự tìm chatId.
 * Gộp trùng theo chatId, giữ lại tin nhắn mới nhất của mỗi người.
 */
notificationsRouter.get("/zalo/updates", async (_req, res) => {
  const updates = await getZaloBotUpdates();

  const byChatId = new Map<string, { chatId: string; displayName: string | null; lastMessage: string | null }>();
  for (const update of updates ?? []) {
    const chatId = update.message?.chat?.id ?? update.message?.from?.id;
    if (chatId == null) continue;
    byChatId.set(String(chatId), {
      chatId: String(chatId),
      displayName: update.message?.from?.display_name ?? null,
      lastMessage: update.message?.text ?? null,
    });
  }

  res.json({ items: [...byChatId.values()] });
});

/**
 * Gửi thử một tin nhắn để xác nhận chatId đã đúng. Không truyền `userId` thì gửi cho chính admin
 * đang đăng nhập; có truyền thì gửi hộ cho tài khoản đó — cần thiết vì cả router này chỉ admin
 * vào được, nhân viên quán không có đường nào tự kiểm tra chat ID của mình.
 */
notificationsRouter.post("/zalo/test", async (req, res) => {
  const { userId } = zaloTestSchema.parse(req.body ?? {});
  const user = await prisma.user.findUnique({
    where: { id: userId ?? req.user?.id },
    select: { name: true, role: true, zaloChatId: true },
  });
  if (!user) throw new HttpError(404, "Không tìm thấy tài khoản");
  if (!user.zaloChatId) {
    throw new HttpError(400, `Tài khoản "${user.name}" chưa có Zalo chat ID.`);
  }

  const willReceive =
    user.role === "ADMIN"
      ? "thông báo mỗi khi có đơn hàng mới"
      : "thông báo khi đơn của bạn được duyệt và chuyển sang trạng thái chờ xác nhận";

  await sendZaloMessage(user.zaloChatId, `✅ Kết nối thành công.\n\n${user.name}, từ giờ bạn sẽ nhận được ${willReceive}.`);
  res.json({ ok: true });
});
