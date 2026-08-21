import { Router } from "express";
import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import {
  salesOrderConfirmSchema,
  salesOrderCreateSchema,
  salesOrderReceivedDatesSchema,
  salesOrderReceivingSchema,
  salesOrderStatusSchema,
} from "./salesOrders.schemas";
import {
  assertOwnership,
  completeSalesOrderReceiving,
  confirmOrderReportedQuantities,
  confirmSalesOrderWithExport,
  createSalesOrder,
  replaceSalesOrderItems,
  salesOrderDetailInclude,
  salesOrderListInclude,
  updateSalesOrderReceivedDates,
  updateSalesOrderStatus,
} from "./salesOrders.service";

export const salesOrdersRouter = Router();

salesOrdersRouter.get("/", async (req, res) => {
  const { warehouseId, status, createdById } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouseId: warehouseId || undefined,
    status: (status || undefined) as any,
    orderDate: from || to ? { gte: from, lte: to } : undefined,
    // Staff only ever see their own orders; admins see everything, optionally narrowed to one account.
    createdById: req.user?.role === "ADMIN" ? createdById || undefined : req.user?.id,
  };

  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip,
      take,
      include: salesOrderListInclude,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  // Cộng số lượng ở server rồi bỏ hẳn mảng dòng hàng khỏi payload: bảng chỉ hiện một con số tổng,
  // gửi kèm từng dòng chỉ để phía web tự cộng là tốn băng thông vô ích.
  const items = rows.map(({ items: lines, ...order }) => ({
    ...order,
    totalQuantity: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
  }));

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

// Tách riêng khỏi /receiving: chỉ ghi ngày nhận, không đụng số lượng/trạng thái/phiếu xuất kho.
// Quyền admin được kiểm trong service (kèm cả kiểm tra trạng thái đơn).
salesOrdersRouter.patch("/:id/received-dates", async (req, res) => {
  const data = salesOrderReceivedDatesSchema.parse(req.body);
  const item = await updateSalesOrderReceivedDates(req.params.id, data, req.user);
  res.json(item);
});
