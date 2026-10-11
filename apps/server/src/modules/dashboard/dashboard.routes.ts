import { Router } from "express";
import { ownerWhere, requirePermission } from "../../middleware/auth";
import { dashboardCostQuerySchema, dashboardUserQuerySchema } from "./dashboard.schemas";
import { countRecentStockImports, getCostSummary, getWasteSummary } from "./dashboard.service";

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

dashboardRouter.get("/waste-summary", requirePermission("MATERIAL_WASTE", "VIEW"), async (req, res) => {
  const { userId } = dashboardUserQuerySchema.parse(req.query);
  res.json(await getWasteSummary(ownerWhere(req.user, userId)));
});

// Không ép phạm vi quán: Check Cost cố ý cho người có COST_CHECKS.VIEW xem mọi quán (xem costChecks.routes.ts).
dashboardRouter.get("/cost-summary", requirePermission("COST_CHECKS", "VIEW"), async (req, res) => {
  const { userId, year } = dashboardCostQuerySchema.parse(req.query);
  res.json(await getCostSummary(userId, year));
});
