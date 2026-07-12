import { Router } from "express";
import { HttpError } from "../../utils/httpError";
import { getInventoryCountReport } from "../reports/reports.service";

export const productStockRouter = Router();

// Current on-hand quantity per product for a warehouse, as of right now.
// Kept separate from /api/reports (admin-only) since staff placing an order
// need this to know what's available, without exposing the full audit
// reports to them.
productStockRouter.get("/", async (req, res) => {
  const { warehouseId } = req.query as Record<string, string>;
  if (!warehouseId) throw new HttpError(400, "Thiếu tham số warehouseId");

  const now = new Date();
  const { items } = await getInventoryCountReport({ warehouseId, periodStart: now, periodEnd: now });
  res.json({ items: items.map((item) => ({ productId: item.product.id, quantity: item.systemQty })) });
});
