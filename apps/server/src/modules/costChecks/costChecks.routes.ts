import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import {
  compareMaterialRows,
  computeCostCheckReport,
  costCheckDetailInclude,
  costCheckListInclude,
  createCostCheck,
  type FinancialSummary,
  type MaterialRow,
} from "./costChecks.service";
import { costCheckCreateSchema, costCheckStatusSchema } from "./costChecks.schemas";

// Không gắn phạm vi quán: người có COST_CHECKS.* thao tác trên mọi quán (Check Cost là nghiệp vụ tổng hợp).
export const costChecksRouter = Router();

costChecksRouter.get("/", requirePermission("COST_CHECKS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = { createdAt: from || to ? { gte: from, lte: to } : undefined };

  const [items, total] = await Promise.all([
    prisma.costCheck.findMany({
      where, orderBy: { createdAt: "desc" }, skip, take,
      include: costCheckListInclude,
      omit: { reportSnapshot: true },
    }),
    prisma.costCheck.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

costChecksRouter.get("/:id", requirePermission("COST_CHECKS"), async (req, res) => {
  const item = await prisma.costCheck.findUnique({ where: { id: req.params.id }, include: costCheckDetailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu Check Cost");

  let snapshot = item.reportSnapshot as unknown as { rows: MaterialRow[]; summary: FinancialSummary } | null;
  if (!snapshot) {
    // Phiếu tạo trước khi có tính năng chốt số liệu — tính 1 lần rồi lưu lại để từ
    // lần xem sau trở đi luôn trả về đúng số đã chốt ở lần xem đầu tiên này.
    const { rows, summary } = await computeCostCheckReport(item.id);
    snapshot = { rows, summary };
    await prisma.costCheck.update({
      where: { id: item.id },
      data: { reportSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
  } else if (snapshot.rows.some((row) => row.productType == null || row.productGroupName == null)) {
    // Snapshot chốt trước khi báo cáo gộp theo Loại/Nhóm hàng hoá — bổ sung hai nhãn phân loại rồi
    // lưu lại để lần xem sau không phải tra nữa. CHỈ thêm khoá phân loại và sắp xếp lại thứ tự
    // dòng: mọi con số đã chốt giữ nguyên, nên phiếu cũ không bị số liệu đổi theo danh mục hiện tại.
    const products = await prisma.product.findMany({
      where: { id: { in: snapshot.rows.map((row) => row.productId) } },
      select: { id: true, type: true, productGroup: { select: { name: true } } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const rows = snapshot.rows
      .map((row) => {
        const product = productById.get(row.productId);
        return {
          ...row,
          // Hàng hoá đã bị xoá khỏi danh mục thì không còn biết loại/nhóm — dồn về nhóm cuối bảng.
          productType: row.productType ?? product?.type ?? "KHAC",
          productGroupName: row.productGroupName ?? product?.productGroup.name ?? "Chưa phân nhóm",
        };
      })
      .sort(compareMaterialRows);

    snapshot = { rows, summary: snapshot.summary };
    await prisma.costCheck.update({
      where: { id: item.id },
      data: { reportSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
  }

  const { reportSnapshot: _reportSnapshot, ...rest } = item;
  res.json({ ...rest, report: snapshot.rows, financialSummary: snapshot.summary });
});

costChecksRouter.post("/", requirePermission("COST_CHECKS"), async (req, res) => {
  const data = costCheckCreateSchema.parse(req.body);
  const item = await createCostCheck(data, req.user);
  res.status(201).json(item);
});

// Huỷ mềm — giữ lại lịch sử thay vì xoá hẳn (cần COST_CHECKS.EDIT).
costChecksRouter.patch("/:id/status", requirePermission("COST_CHECKS"), async (req, res) => {
  const { status } = costCheckStatusSchema.parse(req.body);
  const existing = await prisma.costCheck.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu Check Cost");

  const item = await prisma.costCheck.update({
    where: { id: req.params.id },
    data: { status },
    include: costCheckListInclude,
    omit: { reportSnapshot: true },
  });
  res.json(item);
});
