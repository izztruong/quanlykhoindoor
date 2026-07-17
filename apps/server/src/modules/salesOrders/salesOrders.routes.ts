import { Router } from "express";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { salesOrderConfirmSchema, salesOrderCreateSchema, salesOrderReceivingSchema, salesOrderStatusSchema } from "./salesOrders.schemas";
import {
  assertOwnership,
  completeSalesOrderReceiving,
  confirmOrderReportedQuantities,
  confirmSalesOrderWithExport,
  createSalesOrder,
  replaceSalesOrderItems,
  salesOrderDetailInclude,
  updateSalesOrderStatus,
} from "./salesOrders.service";

export const salesOrdersRouter = Router();

salesOrdersRouter.get("/", async (req, res) => {
  const { warehouseId, status } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouseId: warehouseId || undefined,
    status: (status || undefined) as any,
    orderDate: from || to ? { gte: from, lte: to } : undefined,
    // Staff only ever see their own orders; admins see everything.
    createdById: req.user?.role === "ADMIN" ? undefined : req.user?.id,
  };

  const [items, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip,
      take,
      include: salesOrderDetailInclude,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});

salesOrdersRouter.get("/:id", async (req, res) => {
  const item = await prisma.salesOrder.findUnique({ where: { id: req.params.id }, include: salesOrderDetailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwnership(item, req.user);
  res.json(item);
});

salesOrdersRouter.post("/", async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await createSalesOrder(data, req.user?.id);
  res.status(201).json(item);
});

salesOrdersRouter.put("/:id", async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await replaceSalesOrderItems(req.params.id, data, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/status", async (req, res) => {
  const { status } = salesOrderStatusSchema.parse(req.body);
  const item = await updateSalesOrderStatus(req.params.id, status, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/receiving", async (req, res) => {
  const data = salesOrderReceivingSchema.parse(req.body);
  const item = await completeSalesOrderReceiving(req.params.id, data, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/confirm", async (req, res) => {
  const data = salesOrderConfirmSchema.parse(req.body);
  const item = await confirmSalesOrderWithExport(req.params.id, data, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/confirm-quantities", async (req, res) => {
  const item = await confirmOrderReportedQuantities(req.params.id, req.user);
  res.json(item);
});
