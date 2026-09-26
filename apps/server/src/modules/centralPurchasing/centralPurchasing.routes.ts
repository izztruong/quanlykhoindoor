import { Router } from "express";
import { requirePermission } from "../../middleware/auth";
import { getCentralPurchasingReport } from "./centralPurchasing.service";

export const centralPurchasingRouter = Router();

/**
 * Cố ý KHÔNG áp phạm vi theo quán (`ownerWhere`/`assertOwner`): đây là số liệu toàn chuỗi, một quán
 * nhìn phần của mình thì con số vô nghĩa. Chặn bằng chính quyền `CENTRAL_PURCHASING.VIEW` — chỉ giao
 * cho admin.
 *
 * Không phân trang: số hàng mua tập trung đếm trên đầu ngón tay (cốc giấy, cốc nhựa), và cả màn là một
 * quyết định đặt hàng duy nhất nên chia trang sẽ che mất dòng cần gọi.
 */
centralPurchasingRouter.get("/", requirePermission("CENTRAL_PURCHASING", "VIEW"), async (_req, res) => {
  const items = await getCentralPurchasingReport();
  res.json({ items });
});
