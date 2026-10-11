import { Router } from "express";
import type { SalesOrderStatus } from "../../generated/prisma/client";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { getPurchaseSummary } from "./purchaseSummary.service";

export const purchaseSummaryRouter = Router();

// Đơn hàng chỉ còn "đã đặt" (DRAFT) và "đã huỷ".
const SALES_ORDER_STATUSES: SalesOrderStatus[] = ["DRAFT", "CANCELLED"];

// Mặc định chỉ gộp đơn đã đặt — đó là phần còn phải đi đặt NCC. Vẫn cho chọn CANCELLED để đối chiếu.
purchaseSummaryRouter.get("/", requirePermission("PURCHASE_SUMMARY"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const createdById = (req.query.createdById as string) || undefined;

  const requested = String(req.query.status ?? "DRAFT")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const statuses = requested.filter((s): s is SalesOrderStatus => (SALES_ORDER_STATUSES as string[]).includes(s));
  if (statuses.length === 0) throw new HttpError(400, "Trạng thái đơn hàng không hợp lệ");

  const { items, total } = await getPurchaseSummary({ from, to, createdById, statuses, skip, take });
  res.json({ items, total, page, pageSize });
});
