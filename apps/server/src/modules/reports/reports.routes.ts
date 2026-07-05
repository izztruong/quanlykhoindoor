import { Router, type Request } from "express";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import * as reportsService from "./reports.service";

export const reportsRouter = Router();

function parseCommonFilter(req: Request) {
  const { warehouseId, productId, productGroupId, code } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 50);
  return { warehouseId, productId, productGroupId, code, from, to, skip, take, page, pageSize };
}

reportsRouter.get("/export-summary", async (req, res) => {
  const filter = parseCommonFilter(req);
  const { items, total } = await reportsService.getExportSummary(filter);
  res.json({ items, total, page: filter.page, pageSize: filter.pageSize });
});

reportsRouter.get("/export-detail", async (req, res) => {
  const filter = parseCommonFilter(req);
  const { items, total } = await reportsService.getExportDetail(filter);
  res.json({ items, total, page: filter.page, pageSize: filter.pageSize });
});

reportsRouter.get("/import-summary", async (req, res) => {
  const filter = parseCommonFilter(req);
  const { items, total } = await reportsService.getImportSummary(filter);
  res.json({ items, total, page: filter.page, pageSize: filter.pageSize });
});

reportsRouter.get("/import-detail", async (req, res) => {
  const filter = parseCommonFilter(req);
  const { items, total } = await reportsService.getImportDetail(filter);
  res.json({ items, total, page: filter.page, pageSize: filter.pageSize });
});

reportsRouter.get("/inventory-count", async (req, res) => {
  const { warehouseId, productId, productGroupId, inventoryCountId } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  if (!warehouseId) throw new HttpError(400, "Thiếu tham số warehouseId");
  if (!from || !to) throw new HttpError(400, "Thiếu khoảng thời gian (from, to)");

  const { items, total } = await reportsService.getInventoryCountReport({
    warehouseId,
    periodStart: from,
    periodEnd: to,
    productId,
    productGroupId,
    inventoryCountId,
  });
  res.json({ items, total });
});
