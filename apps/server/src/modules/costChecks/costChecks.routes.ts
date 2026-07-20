import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { HttpError } from "../../utils/httpError";
import { parseDateRange } from "../../utils/pagination";
import {
  computeCostCheckReport,
  costCheckDetailInclude,
  costCheckListInclude,
  createCostCheck,
  type FinancialSummary,
  type MaterialRow,
} from "./costChecks.service";
import { costCheckCreateSchema } from "./costChecks.schemas";

// Mounted under requireRole("ADMIN") in app.ts — Check Cost is admin-only, staff have no access at all.
export const costChecksRouter = Router();

costChecksRouter.get("/", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const items = await prisma.costCheck.findMany({
    where: { createdAt: from || to ? { gte: from, lte: to } : undefined },
    orderBy: { createdAt: "desc" },
    include: costCheckListInclude,
  });
  res.json({ items });
});

costChecksRouter.get("/:id", async (req, res) => {
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
  }

  const { reportSnapshot: _reportSnapshot, ...rest } = item;
  res.json({ ...rest, report: snapshot.rows, financialSummary: snapshot.summary });
});

costChecksRouter.post("/", async (req, res) => {
  const data = costCheckCreateSchema.parse(req.body);
  const item = await createCostCheck(data, req.user);
  res.status(201).json(item);
});
