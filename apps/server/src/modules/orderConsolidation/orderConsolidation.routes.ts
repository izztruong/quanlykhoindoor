import { Router } from "express";
import { requirePermission } from "../../middleware/auth";
import { getOrderConsolidationReport } from "./orderConsolidation.service";

export const orderConsolidationRouter = Router();

/**
 * Cố ý KHÔNG áp phạm vi theo quán: cả ý nghĩa của màn này là so tiền GIỮA các quán. Chặn bằng chính
 * quyền `ORDER_CONSOLIDATION.VIEW`, và quyền đó chỉ giao cho admin vì mọi con số suy từ giá nhập —
 * quán không có `SUPPLIER_PRICES.VIEW`.
 *
 * Không phân trang: mỗi NCC một khối, số NCC có đơn mở trong một lúc chỉ vài cái, và cả màn là một
 * quyết định gom đơn duy nhất nên chia trang sẽ che mất khối cần xử lý.
 */
orderConsolidationRouter.get("/", requirePermission("ORDER_CONSOLIDATION", "VIEW"), async (_req, res) => {
  res.json(await getOrderConsolidationReport());
});
