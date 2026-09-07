import { Router, type Request } from "express";
import type { SalesOrderStatus } from "../../generated/prisma/client";
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

const SALES_ORDER_STATUSES: SalesOrderStatus[] = ["DRAFT", "PENDING_CONFIRM", "CONFIRMED", "SHORT", "COMPLETED", "CANCELLED"];

// Mặc định chỉ gộp đơn DRAFT: đó là các đơn quán vừa gửi mà admin chưa chốt NCC, tức đúng phần
// còn phải đi đặt. Vẫn cho chọn trạng thái khác để đối chiếu lại những kỳ đã đặt xong.
reportsRouter.get("/purchase-summary", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const productGroupId = (req.query.productGroupId as string) || undefined;

  const requested = String(req.query.status ?? "DRAFT")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const statuses = requested.filter((s): s is SalesOrderStatus => (SALES_ORDER_STATUSES as string[]).includes(s));
  if (statuses.length === 0) throw new HttpError(400, "Trạng thái đơn hàng không hợp lệ");

  const { items, total } = await reportsService.getPurchaseSummary({ from, to, productGroupId, statuses, skip, take });
  res.json({ items, total, page, pageSize });
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
