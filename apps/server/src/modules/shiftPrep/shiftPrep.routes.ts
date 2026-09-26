import { type Request, Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { prepCommitSchema, prepPreviewSchema, stockCountSchema, varianceQuerySchema } from "./shiftPrep.schemas";
import { commitPrep, getShiftVariance, parseBusinessDate, saveStockCount, suggestPrep } from "./shiftPrep.service";

export const shiftPrepRouter = Router();

/**
 * Quán được đề xuất. Bỏ trống = chính mình. Khai quán khác đòi `DATA.SCOPE_ALL` và trả **404** như bản
 * ghi không tồn tại, đúng kiểu `assertOwner` — không tiết lộ là tài khoản đó có thật.
 *
 * Giống hệt hàm cùng tên ở `reorderSuggestions.routes.ts`: cả hai module đều gắn với quán qua cột
 * `userId` chứ không phải `createdById`, nên `ownerWhere`/`assertOwner` không dùng thẳng được.
 */
function resolveTargetUserId(req: Request, requested?: string): string {
  const self = req.user!.id;
  if (!requested || requested === self) return self;
  if (req.user!.scope !== "ALL") throw new HttpError(404, "Không tìm thấy quán");
  return requested;
}

shiftPrepRouter.post("/preview", requirePermission("SHIFT_PREP", "VIEW"), async (req, res) => {
  const input = prepPreviewSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  res.json(await suggestPrep({ ...input, userId }));
});

shiftPrepRouter.post("/commit", requirePermission("SHIFT_PREP", "ADD"), async (req, res) => {
  const input = prepCommitSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  res.status(201).json(await commitPrep({ ...input, userId }, req.user!.id));
});

/**
 * Đếm tồn CUỐI ca. Cùng quyền `SHIFT_PREP.ADD` với việc chốt số mẻ: cùng một người, cùng một lượt làm
 * việc — tách quyền chỉ tạo thêm một ô tick mà không ai hiểu để làm gì.
 */
shiftPrepRouter.post("/stock-count", requirePermission("SHIFT_PREP", "ADD"), async (req, res) => {
  const input = stockCountSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  res.status(201).json(await saveStockCount({ ...input, userId }, req.user!.id));
});

/** Phiếu đếm của một ca, để màn hình lấy sẵn số cũ khi đếm lại. */
shiftPrepRouter.get("/stock-count", requirePermission("SHIFT_PREP", "VIEW"), async (req, res) => {
  const input = varianceQuerySchema.parse(req.query);
  const userId = resolveTargetUserId(req, input.userId);
  // findFirst, không findUnique — xem chú thích findCountByShift trong service.
  const count = await prisma.shiftStockCount.findFirst({
    where: { userId, businessDate: parseBusinessDate(input.businessDate), shift: input.shift },
    include: { items: true, createdBy: { select: { id: true, name: true } } },
  });
  res.json({ count });
});

shiftPrepRouter.get("/variance", requirePermission("SHIFT_PREP", "VIEW"), async (req, res) => {
  const input = varianceQuerySchema.parse(req.query);
  const userId = resolveTargetUserId(req, input.userId);
  res.json({ items: await getShiftVariance(userId, input.businessDate, input.shift) });
});

shiftPrepRouter.get("/runs", requirePermission("SHIFT_PREP", "VIEW"), async (req, res) => {
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  // Phạm vi SELF thì ép về chính mình, bỏ qua tham số client — giống ownerWhere.
  const requestedUserId = (req.query.userId as string) || undefined;
  const userId = req.user!.scope === "ALL" ? requestedUserId : req.user!.id;
  const where = userId ? { userId } : {};

  const [items, total] = await Promise.all([
    prisma.shiftPrepRun.findMany({
      where,
      orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: {
        user: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { finishedGoodItem: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.shiftPrepRun.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});
