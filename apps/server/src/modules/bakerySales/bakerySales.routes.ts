import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { resolveTargetUserId } from "../../utils/targetUser";
import { parseDateOnly } from "../../utils/vnTime";
import { bakerySaleDeleteDaySchema, bakerySaleRowsQuerySchema, bakerySaleRowsSchema } from "./bakerySales.schemas";
import { saveBakerySales } from "./bakerySales.service";

/**
 * "Bánh bán ra" — trục bán ra của tiệm bánh, tương đương `/api/pos-sales` của quán.
 *
 * Phạm vi đi qua `resolveTargetUserId` y như posSales: bỏ trống `bakeryUserId` = chính mình, khai
 * tài khoản khác cần `DATA.SCOPE_ALL`.
 */

export const bakerySalesRouter = Router();

const rowInclude = {
  shopUser: { select: { id: true, name: true } },
  finishedGoodItem: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } },
};

/** Danh sách dòng bánh bán ra, phân trang 20 — nguồn dữ liệu cho màn nhập. */
bakerySalesRouter.get("/", requirePermission("BAKERY_SALES", "VIEW"), async (req, res) => {
  const query = bakerySaleRowsQuerySchema.parse(req.query);
  const bakeryUserId = resolveTargetUserId(req.user, query.bakeryUserId);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    bakeryUserId,
    soldOn: { gte: parseDateOnly(query.from), lte: parseDateOnly(query.to) },
  };

  const [items, total] = await Promise.all([
    prisma.bakerySale.findMany({
      where,
      include: rowInclude,
      orderBy: [{ soldOn: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.bakerySale.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

/**
 * Ghi/sửa/xoá từng dòng. Cùng quyền `BAKERY_SALES.ADD` cho cả thêm và sửa: nhập lại cùng ô là GHI
 * ĐÈ, nên không cần `EDIT` riêng — y như `POS_SALES`.
 */
bakerySalesRouter.post("/manual", requirePermission("BAKERY_SALES", "ADD"), async (req, res) => {
  const input = bakerySaleRowsSchema.parse(req.body);
  const bakeryUserId = resolveTargetUserId(req.user, input.bakeryUserId);
  res.json(await saveBakerySales(bakeryUserId, input.upserts, input.deletes, req.user?.id));
});

/** Xoá trọn một ngày — đường duy nhất được xoá theo phạm vi rộng, xem chú thích `saveBakerySales`. */
bakerySalesRouter.delete("/day", requirePermission("BAKERY_SALES", "DELETE"), async (req, res) => {
  const query = bakerySaleDeleteDaySchema.parse(req.query);
  const bakeryUserId = resolveTargetUserId(req.user, query.bakeryUserId);

  const { count } = await prisma.bakerySale.deleteMany({
    where: { bakeryUserId, soldOn: parseDateOnly(query.soldOn) },
  });
  if (count === 0) throw new HttpError(404, "Không có dòng bánh bán ra nào trong ngày này");
  res.status(204).send();
});
