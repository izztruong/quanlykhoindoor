import { type Request, Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import {
  posSalesByShiftSchema,
  posSalesDeleteDaySchema,
  posSalesImportSchema,
  shiftSalesQuerySchema,
  shiftSalesSchema,
} from "./posSales.schemas";
import { getShiftSales, importPosSales, parseDateOnly, saveShiftSales } from "./posSales.service";
import { sliceByShift } from "./shiftSlicing";

export const posSalesRouter = Router();

/** Quán bán. Bỏ trống = chính mình; khai quán khác cần DATA.SCOPE_ALL, ngoài phạm vi trả 404. */
function resolveTargetUserId(req: Request, requested?: string): string {
  const self = req.user!.id;
  if (!requested || requested === self) return self;
  if (req.user!.scope !== "ALL") throw new HttpError(404, "Không tìm thấy quán");
  return requested;
}

/**
 * Danh sách theo NGÀY (không phải theo ô giờ): người dùng cần biết "đã có dữ liệu ngày nào chưa", chứ
 * không ai đọc từng giờ. Đây cũng là màn phát hiện ngày bị thiếu — chỉ số kỷ luật dữ liệu quan trọng
 * nhất của cả phần dự báo.
 */
posSalesRouter.get("/", requirePermission("POS_SALES", "VIEW"), async (req, res) => {
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const userId = req.user!.scope === "ALL" ? (req.query.userId as string) || undefined : req.user!.id;

  const grouped = await prisma.posSaleHour.groupBy({
    by: ["userId", "soldOn"],
    where: userId ? { userId } : {},
    _sum: { quantity: true },
    _count: { _all: true },
    orderBy: { soldOn: "desc" },
    skip,
    take,
  });

  // groupBy không có count tổng số nhóm, nên đếm riêng bằng distinct.
  const allDays = await prisma.posSaleHour.findMany({
    where: userId ? { userId } : {},
    distinct: ["userId", "soldOn"],
    select: { soldOn: true },
  });

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(grouped.map((g) => g.userId))] } },
    select: { id: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  res.json({
    items: grouped.map((g) => ({
      userId: g.userId,
      user: userById.get(g.userId) ?? null,
      soldOn: g.soldOn,
      totalQuantity: Number(g._sum.quantity ?? 0),
      cellCount: g._count._all,
    })),
    total: allDays.length,
    page,
    pageSize,
  });
});

/**
 * Chi tiết một ngày, gộp theo món và theo giờ — để đối chiếu với file gốc khi số liệu trông sai.
 */
posSalesRouter.get("/day", requirePermission("POS_SALES", "VIEW"), async (req, res) => {
  const { soldOn, userId: requested } = posSalesDeleteDaySchema.parse(req.query);
  const userId = resolveTargetUserId(req, requested);

  const items = await prisma.posSaleHour.findMany({
    where: { userId, soldOn: parseDateOnly(soldOn) },
    include: { finishedGoodItem: { select: { id: true, code: true, name: true } } },
    orderBy: [{ hour: "asc" }],
  });
  res.json({ items });
});

/**
 * Doanh số đã cắt theo ca. Đây là dạng mà phần dự báo sẽ đọc, và cũng là bằng chứng cho tính chất
 * quan trọng nhất của thiết kế: đổi khung giờ ca rồi gọi lại endpoint này ra số khác **mà không phải
 * nhập lại dữ liệu nào**.
 */
posSalesRouter.get("/by-shift", requirePermission("POS_SALES", "VIEW"), async (req, res) => {
  const { from, to, userId: requested } = posSalesByShiftSchema.parse(req.query);
  const userId = resolveTargetUserId(req, requested);

  const shifts = await prisma.shiftDefinition.findMany({ orderBy: { code: "asc" } });
  if (shifts.length === 0) throw new HttpError(409, "Chưa khai khung giờ ca — vào Quản trị › Khung giờ ca để thiết lập");

  // Lấy RỘNG THÊM MỘT NGÀY mỗi phía rồi mới lọc theo ngày kinh doanh. Ca qua nửa đêm kéo giờ của ngày
  // hôm sau về ngày kinh doanh hôm trước, nên nếu truy vấn đúng biên thì ca tối của ngày cuối khoảng
  // bị mất phần sau 0h — âm thầm thiếu, không báo lỗi gì.
  const fetchFrom = parseDateOnly(from);
  fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 1);
  const fetchTo = parseDateOnly(to);
  fetchTo.setUTCDate(fetchTo.getUTCDate() + 1);

  const cells = await prisma.posSaleHour.findMany({
    where: { userId, soldOn: { gte: fetchFrom, lte: fetchTo } },
    select: { soldOn: true, hour: true, finishedGoodItemId: true, quantity: true },
  });

  const sliced = sliceByShift(
    cells.map((c) => ({ ...c, quantity: Number(c.quantity) })),
    shifts,
  ).filter((c) => c.businessDate >= from && c.businessDate <= to);

  const finishedGoods = await prisma.finishedGoodItem.findMany({
    where: { id: { in: [...new Set(sliced.map((c) => c.finishedGoodItemId))] } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(finishedGoods.map((f) => [f.id, f]));

  res.json({
    shifts,
    items: sliced.map((c) => ({ ...c, finishedGoodItem: byId.get(c.finishedGoodItemId) ?? null })),
  });
});

posSalesRouter.post("/import", requirePermission("POS_SALES", "ADD"), async (req, res) => {
  const input = posSalesImportSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);

  const result = await importPosSales(userId, input.rows);
  // Thiếu ánh xạ KHÔNG phải lỗi 400: người dùng không làm gì sai, họ chỉ cần khai ánh xạ rồi nhập lại.
  // Trả 200 kèm danh sách tên để giao diện dẫn thẳng sang trang ánh xạ.
  res.json(result);
});

posSalesRouter.delete("/day", requirePermission("POS_SALES", "DELETE"), async (req, res) => {
  const { soldOn, userId: requested } = posSalesDeleteDaySchema.parse(req.query);
  const userId = resolveTargetUserId(req, requested);

  const { count } = await prisma.posSaleHour.deleteMany({ where: { userId, soldOn: parseDateOnly(soldOn) } });
  if (count === 0) throw new HttpError(404, "Không có dữ liệu doanh số cho ngày này");
  res.status(204).send();
});

/**
 * Doanh số một ca, gộp theo món — mở màn nhập tay là thấy sẵn số đang có để SỬA, không phải gõ lại.
 * Dùng được cho cả ca đã nhập bằng Excel.
 */
posSalesRouter.get("/shift", requirePermission("POS_SALES", "VIEW"), async (req, res) => {
  const { businessDate, shift, userId: requested } = shiftSalesQuerySchema.parse(req.query);
  const userId = resolveTargetUserId(req, requested);
  res.json(await getShiftSales(userId, businessDate, shift));
});

/**
 * Ghi doanh số một ca do người dùng gõ tay. GHI ĐÈ trọn ca — xem chú thích `saveShiftSales`.
 *
 * Cùng quyền `POS_SALES.ADD` với nhập Excel: cùng một việc, chỉ khác đường vào. Tách quyền chỉ tạo thêm
 * một ô tick mà không ai hiểu để làm gì.
 */
posSalesRouter.post("/shift", requirePermission("POS_SALES", "ADD"), async (req, res) => {
  const input = shiftSalesSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  res.json(await saveShiftSales(userId, input.businessDate, input.shift, input.items));
});
