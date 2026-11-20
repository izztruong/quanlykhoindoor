import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../utils/httpError";
import { costCheckSourcesQuerySchema } from "./costCheckSources.schemas";
import { getCostCheckSources } from "./costCheckSources.service";

/**
 * Bấm vào ô Nhận / Xuất / Đã huỷ trên bảng nguyên liệu của phiếu Check Cost (quán lẫn tiệm bánh) để
 * xem những phiếu nào làm nên con số đó.
 *
 * CHỈ QUẢN TRỊ VIÊN (vai trò hệ thống `isSystem`) — chủ quán yêu cầu, quán và kế toán chỉ xem số trên
 * phiếu. Cố ý không làm thành mã quyền tick được ở trang Vai trò. Web ẩn ô bấm theo cùng cờ, nhưng chặn
 * thật là ở đây.
 */
export const costCheckSourcesRouter = Router();

// Generic theo `P` như `requirePermission`: Express 5 suy kiểu `req.params` của handler từ middleware đứng trước.
function requireSystemAdmin<P>(req: Request<P>, _res: Response, next: NextFunction) {
  if (!req.user?.isSystem) {
    next(new HttpError(403, "Chỉ quản trị viên mới xem được nguồn số liệu của phiếu Check Cost"));
    return;
  }
  next();
}

costCheckSourcesRouter.get(
  "/:costCheckId",
  requireSystemAdmin,
  async (req, res) => {
    const { productId } = costCheckSourcesQuerySchema.parse(req.query);
    res.json(await getCostCheckSources(req.params.costCheckId, productId, req.user));
  },
);
