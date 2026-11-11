import { Router } from "express";
import { prisma } from "../../config/db";
import { assertInScope, ownerWhere, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { bakeryCostCheckCreateSchema } from "./bakeryCostChecks.schemas";
import { createBakeryCostCheck, type BakeryFinancialSummary } from "./bakeryCostChecks.service";
import { costCheckDetailInclude, costCheckListInclude, type MaterialRow, type PosCoverage } from "./costChecks.service";
import { costCheckStatusSchema } from "./costChecks.schemas";

/**
 * Check Cost của tiệm bánh. Phiếu là một dòng `CostCheck` — xem chú thích ở
 * `bakeryCostChecks.service.ts` để biết vì sao không tách thành module riêng.
 *
 * Phân biệt với phiếu của quán bằng `user.role.isBakery`, KHÔNG thêm cột vào `CostCheck`. Hệ quả:
 * danh sách này lọc `isBakery: true`, còn `GET /api/cost-checks` lọc `isBakery: false`.
 */
export const bakeryCostChecksRouter = Router();

const BAKERY_ONLY = { role: { isBakery: true } };

bakeryCostChecksRouter.get("/", requirePermission("BAKERY_COST_CHECKS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { userId } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = {
    createdAt: from || to ? { gte: from, lte: to } : undefined,
    userId: ownerWhere(req.user, userId),
    user: BAKERY_ONLY,
  };

  const [items, total] = await Promise.all([
    prisma.costCheck.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: costCheckListInclude,
      omit: { reportSnapshot: true },
    }),
    prisma.costCheck.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

bakeryCostChecksRouter.get("/:id", requirePermission("BAKERY_COST_CHECKS"), async (req, res) => {
  const item = await prisma.costCheck.findFirst({
    where: { id: req.params.id, user: BAKERY_ONLY },
    include: costCheckDetailInclude,
  });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu Check Cost tiệm bánh");
  assertInScope([item.userId], req.user, "Không tìm thấy phiếu Check Cost tiệm bánh");

  const snapshot = item.reportSnapshot as unknown as
    | { rows: MaterialRow[]; summary: BakeryFinancialSummary; posCoverage?: PosCoverage }
    | null;
  // KHÔNG tính lại phiếu chưa có snapshot — cùng lý do như phiếu của quán: tính lại là tính bằng
  // công thức/giá HIỆN TẠI cho một kỳ người dùng đã chốt bằng dữ liệu cũ, và ghi vĩnh viễn.
  if (!snapshot) {
    throw new HttpError(409, "Phiếu này chưa có số liệu chốt nên không xem được. Hãy tạo lại phiếu cho cùng kỳ.");
  }

  const { reportSnapshot: _reportSnapshot, ...rest } = item;
  res.json({
    ...rest,
    report: snapshot.rows,
    bakerySummary: snapshot.summary,
    posCoverage: snapshot.posCoverage ?? null,
  });
});

bakeryCostChecksRouter.post("/", requirePermission("BAKERY_COST_CHECKS"), async (req, res) => {
  const data = bakeryCostCheckCreateSchema.parse(req.body);
  // Lập phiếu cho tiệm bánh khác mình thì phải có phạm vi ALL — cùng luật `assertCostCheckShopInScope`.
  if (req.user?.scope !== "ALL" && data.userId !== req.user?.id) {
    throw new HttpError(403, "Bạn chỉ lập được phiếu Check Cost cho tiệm bánh của mình");
  }
  const item = await createBakeryCostCheck(data, req.user);
  res.status(201).json(item);
});

/** Huỷ mềm — giữ lịch sử thay vì xoá hẳn. */
bakeryCostChecksRouter.patch("/:id/status", requirePermission("BAKERY_COST_CHECKS"), async (req, res) => {
  const { status } = costCheckStatusSchema.parse(req.body);
  const existing = await prisma.costCheck.findFirst({
    where: { id: req.params.id, user: BAKERY_ONLY },
    select: { id: true, userId: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu Check Cost tiệm bánh");
  assertInScope([existing.userId], req.user, "Không tìm thấy phiếu Check Cost tiệm bánh");

  const item = await prisma.costCheck.update({
    where: { id: existing.id },
    data: { status },
    include: costCheckListInclude,
    omit: { reportSnapshot: true },
  });
  res.json(item);
});
