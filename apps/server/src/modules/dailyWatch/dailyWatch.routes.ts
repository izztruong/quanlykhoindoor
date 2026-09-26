import { Router } from "express";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { getDailyWatchRun, runDailyWatch } from "./dailyWatch.service";

export const dailyWatchRouter = Router();

/**
 * Chạy lượt theo dõi từ NGOÀI, không có ai đăng nhập — GitHub Actions gọi mỗi tối.
 *
 * Vì sao GitHub Actions chứ không phải job trong tiến trình server: gói Render free ngủ sau 15 phút
 * không hoạt động nên không có gì đánh thức để chạy job nền (xem CLAUDE.md). Thêm nữa mỗi lượt có nhật
 * ký riêng trên GitHub, xem lại được khi số liệu trông lạ.
 *
 * Đây là endpoint DUY NHẤT trong dự án gọi được mà không có phiên người dùng, nên ba rào:
 *   1. Xác thực bằng token riêng trong header, so sánh theo độ dài hằng để không rò rỉ qua thời gian.
 *   2. Không đặt `DAILY_WATCH_TOKEN` thì route trả **503** chứ không mở cửa — quên cấu hình phải là
 *      "không chạy được", không bao giờ là "ai cũng chạy được".
 *   3. Ghi đè theo ngày kinh doanh, nên gọi lại không nhân đôi kết quả.
 *
 * Đặt TRƯỚC `requireAuth` ở app.ts, vì middleware đó áp cho toàn bộ `/api`.
 */
export const dailyWatchCronRouter = Router();

/** So sánh không phụ thuộc vị trí ký tự khác nhau — tránh đoán token bằng cách đo thời gian phản hồi. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

dailyWatchCronRouter.post("/run", async (req, res) => {
  if (!env.dailyWatchToken) {
    throw new HttpError(503, "Chưa cấu hình DAILY_WATCH_TOKEN trên server");
  }
  const token = req.header("x-daily-watch-token") ?? "";
  if (!safeEqual(token, env.dailyWatchToken)) {
    throw new HttpError(401, "Token không hợp lệ");
  }
  const run = await runDailyWatch({ triggeredBy: "CRON" });
  res.json({ run });
});

/** Lượt gần nhất, hoặc lượt của một ngày cụ thể. Không phân trang: mỗi ngày đúng một lượt. */
dailyWatchRouter.get("/", requirePermission("DAILY_WATCH", "VIEW"), async (req, res) => {
  const businessDate = (req.query.businessDate as string) || undefined;
  if (businessDate && !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new HttpError(400, "Ngày phải có dạng YYYY-MM-DD");
  }
  res.json({ run: await getDailyWatchRun(businessDate) });
});

/**
 * Admin bấm chạy lại. `skipNotify` bật: người bấm đang ngồi xem màn, bắn thông báo cho chính họ và cho
 * người khác về việc họ vừa tự tính lại là nhiễu.
 */
dailyWatchRouter.post("/run", requirePermission("DAILY_WATCH", "ADD"), async (req, res) => {
  const run = await runDailyWatch({ triggeredBy: "MANUAL", triggeredById: req.user!.id, skipNotify: true });
  res.json({ run });
});

/** Lịch sử ngắn: ngày nào đã chạy, nêu bao nhiêu việc. Để đối chiếu "hệ thống có báo đúng không". */
dailyWatchRouter.get("/history", requirePermission("DAILY_WATCH", "VIEW"), async (_req, res) => {
  const runs = await prisma.dailyWatchRun.findMany({
    orderBy: { businessDate: "desc" },
    take: 30,
    select: {
      id: true,
      businessDate: true,
      startedAt: true,
      finishedAt: true,
      triggeredBy: true,
      shopCount: true,
      error: true,
      _count: { select: { findings: true } },
    },
  });
  res.json({ items: runs });
});
