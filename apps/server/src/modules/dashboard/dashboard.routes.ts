import { Router } from "express";
import { ownerWhere, requirePermission } from "../../middleware/auth";
import { dashboardCostQuerySchema, dashboardUserQuerySchema } from "./dashboard.schemas";
import { countPendingOrders, countRecentStockImports, getCostSummary, getWasteSummary } from "./dashboard.service";

// Trang chủ không có resource quyền riêng: mỗi ô dùng lại quyền Xem của trang "Chi tiết" mà nó dẫn
// tới, nên vai trò đang có tự thấy đúng những ô mình được xem. Web ẩn ô thiếu quyền; chặn thật ở đây.
export const dashboardRouter = Router();

// Phiếu nhập 7 ngày. Phạm vi theo CHỦ KHO (xem stockImports.routes.ts) nên truyền cả scope vào
// service thay vì dùng ownerWhere — ownerWhere chỉ biết createdById.
dashboardRouter.get("/recent-imports", requirePermission("STOCK_IMPORTS", "VIEW"), async (req, res) => {
  const { userId } = dashboardUserQuerySchema.parse(req.query);
  const count = await countRecentStockImports(req.user, userId);
  res.json({ count });
});

/**
 * TẠM, CHỈ ĐỂ APP MOBILE CŨ (1.0.4) CÒN MỞ ĐƯỢC — XOÁ KHI LOG DƯỚI ĐÂY IM HẲN.
 *
 * Ô Trang chủ của app 1.0.4 gọi endpoint này, và `useAppStartup` CHẶN VÀO APP cho tới khi nó
 * thành công: thiếu nó thì app cũ dừng vĩnh viễn ở màn chờ, không chỉ hỏng một ô. Bản 1.0.4 không
 * có `expo-updates` nên không cứu được từ xa — đường duy nhất ra khỏi nó là cài bản mới từ store,
 * mà App Store duyệt bao lâu thì không biết trước.
 *
 * Mỗi lần bị gọi là ghi một dòng `console.warn`: đó chính là tín hiệu để biết khi nào xoá được —
 * endpoint này CHỈ bị gọi bởi JS cũ, app từ 1.0.5 gọi `/recent-imports`. Log im vài ngày = không
 * còn máy nào ở 1.0.4 nữa.
 *
 * Giữ đúng quyền và phạm vi của bản gốc (`ORDERS.VIEW` + `ownerWhere`) để app cũ không nhận 403.
 */
dashboardRouter.get("/unconfirmed-orders", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { userId } = dashboardUserQuerySchema.parse(req.query);
  console.warn("[legacy] /dashboard/unconfirmed-orders — app mobile 1.0.4", JSON.stringify({ userId: req.user?.id, filter: userId || null }));
  const count = await countPendingOrders(ownerWhere(req.user, userId));
  res.json({ count });
});

dashboardRouter.get("/waste-summary", requirePermission("MATERIAL_WASTE", "VIEW"), async (req, res) => {
  const { userId } = dashboardUserQuerySchema.parse(req.query);
  res.json(await getWasteSummary(ownerWhere(req.user, userId)));
});

// Không ép phạm vi quán: Check Cost cố ý cho người có COST_CHECKS.VIEW xem mọi quán (xem costChecks.routes.ts).
dashboardRouter.get("/cost-summary", requirePermission("COST_CHECKS", "VIEW"), async (req, res) => {
  const { userId, year } = dashboardCostQuerySchema.parse(req.query);
  res.json(await getCostSummary(userId, year));
});
