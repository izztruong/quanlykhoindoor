import { Router } from "express";
import { ownerWhere, requirePermission } from "../../middleware/auth";
import { dashboardCostQuerySchema, dashboardUserQuerySchema } from "./dashboard.schemas";
import { countUnconfirmedOrders, getCostSummary, getWasteSummary } from "./dashboard.service";

// Trang chủ không có resource quyền riêng: mỗi ô dùng lại quyền Xem của trang "Chi tiết" mà nó dẫn
// tới, nên vai trò đang có tự thấy đúng những ô mình được xem. Web ẩn ô thiếu quyền; chặn thật ở đây.
export const dashboardRouter = Router();

dashboardRouter.get("/unconfirmed-orders", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { userId } = dashboardUserQuerySchema.parse(req.query);
  const count = await countUnconfirmedOrders(ownerWhere(req.user, userId));
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
