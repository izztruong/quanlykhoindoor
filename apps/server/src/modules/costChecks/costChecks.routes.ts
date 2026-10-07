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
  loadPosSalesForPeriod,
  type FinancialSummary,
  type MaterialRow,
  type PosCoverage,
} from "./costChecks.service";
import { costCheckCreateSchema, costCheckPosPreviewSchema, costCheckStatusSchema } from "./costChecks.schemas";

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

/**
 * Xem trước doanh số POS sẽ dùng cho một kỳ, trước khi bấm tạo phiếu.
 *
 * Đặt trong module này chứ KHÔNG gọi `/pos-sales/*` từ web: route đó ép phạm vi quán
 * (`resolveTargetUserId`) còn Check Cost cố ý không, nên người lập phiếu hộ quán khác sẽ bị chặn.
 * Thêm nữa, phép cắt kỳ khi đó chỉ tồn tại ở một chỗ (`loadPosSalesForPeriod`), form xem trước và lúc
 * tạo phiếu không thể lệch nhau.
 */
costChecksRouter.get("/pos-preview", requirePermission("COST_CHECKS"), async (req, res) => {
  const query = costCheckPosPreviewSchema.parse(req.query);

  const [opening, closing] = await Promise.all([
    prisma.stockCheck.findUnique({ where: { id: query.openingStockCheckId }, select: { checkedAt: true, createdById: true } }),
    prisma.stockCheck.findUnique({ where: { id: query.closingStockCheckId }, select: { checkedAt: true, createdById: true } }),
  ]);
  if (!opening || !closing) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê đầu/cuối kỳ");
  if (opening.createdById !== query.userId || closing.createdById !== query.userId) {
    throw new HttpError(400, "Phiếu kiểm kê đầu/cuối kỳ phải cùng thuộc quán được chọn");
  }
  if (opening.checkedAt >= closing.checkedAt) {
    throw new HttpError(400, "Phiếu kiểm kê đầu kỳ phải có thời gian trước phiếu cuối kỳ");
  }

  const sales = await loadPosSalesForPeriod(query.userId, opening, closing);
  const finishedGoods = await prisma.finishedGoodItem.findMany({
    where: { id: { in: [...sales.byItem.keys()] } },
    select: { id: true, code: true, name: true, category: true, unit: { select: { name: true } } },
  });
  const byId = new Map(finishedGoods.map((f) => [f.id, f]));

  res.json({
    cellCount: sales.cells.length,
    totalQuantity: [...sales.byItem.values()].reduce((sum, q) => sum + q, 0),
    coverage: sales.coverage,
    items: [...sales.byItem]
      .map(([finishedGoodItemId, quantity]) => ({ finishedGoodItem: byId.get(finishedGoodItemId) ?? null, quantity }))
      .sort((a, b) => (a.finishedGoodItem?.name ?? "").localeCompare(b.finishedGoodItem?.name ?? "")),
  });
});

costChecksRouter.get("/:id", requirePermission("COST_CHECKS"), async (req, res) => {
  const item = await prisma.costCheck.findUnique({ where: { id: req.params.id }, include: costCheckDetailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu Check Cost");

  let snapshot = item.reportSnapshot as unknown as
    | { rows: MaterialRow[]; summary: FinancialSummary; posCoverage?: PosCoverage }
    | null;
  if (!snapshot) {
    // Phiếu tạo trước khi có tính năng chốt số liệu — tính 1 lần rồi lưu lại để từ
    // lần xem sau trở đi luôn trả về đúng số đã chốt ở lần xem đầu tiên này.
    const { rows, summary } = await computeCostCheckReport(item.id);
    snapshot = { rows, summary };

    // CHỐT PHÒNG VỆ: định mức giờ tính từ doanh số POS, mà phiếu cũ thuộc kỳ có thể chưa có dữ liệu
    // POS nào — khi đó `theoretical` toàn 0 và variance nổ bằng toàn bộ lượng đã dùng. Một lượt mở
    // trang mà ghi con số đó vào snapshot là mất phiếu vĩnh viễn, nên chỉ TRẢ VỀ, không lưu.
    const looksEmpty = rows.length > 0 && rows.every((row) => row.theoretical === 0);
    if (!looksEmpty) {
      await prisma.costCheck.update({
        where: { id: item.id },
        data: { reportSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
    }
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

    snapshot = { rows, summary: snapshot.summary, posCoverage: snapshot.posCoverage };
    await prisma.costCheck.update({
      where: { id: item.id },
      data: { reportSnapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
  }

  const { reportSnapshot: _reportSnapshot, ...rest } = item;
  res.json({
    ...rest,
    report: snapshot.rows,
    financialSummary: snapshot.summary,
    // Phiếu chốt trước khi có cảnh báo phủ dữ liệu POS thì không có khoá này — client hiện gì cũng không.
    posCoverage: snapshot.posCoverage ?? null,
  });
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
