import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, ownerWhere, requireAnyPermission, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { orderNotifications } from "../notifications/notifications.service";
import {
  salesOrderConfirmSchema,
  salesOrderCreateSchema,
  salesOrderReceivedDatesSchema,
  salesOrderReceivingSchema,
  salesOrderStatusSchema,
} from "./salesOrders.schemas";
import {
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

salesOrdersRouter.get("/", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { warehouseId, status, createdById } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouseId: warehouseId || undefined,
    status: (status || undefined) as any,
    orderDate: from || to ? { gte: from, lte: to } : undefined,
    // Phạm vi SELF chỉ thấy đơn của mình; ALL thấy hết, lọc theo tài khoản qua ?createdById=.
    createdById: ownerWhere(req.user, createdById),
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

salesOrdersRouter.get("/:id", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const item = await prisma.salesOrder.findUnique({ where: { id: req.params.id }, include: salesOrderDetailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(item, req.user, "Không tìm thấy đơn hàng");
  res.json(item);
});

salesOrdersRouter.post("/", requirePermission("ORDERS", "ADD"), async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await createSalesOrder(data, req.user?.id);
  // Gửi sau khi đã ghi xong, không await — lỗi thông báo không được làm hỏng việc tạo đơn.
  if (req.user) orderNotifications.created(item, req.user);
  res.status(201).json(item);
});

salesOrdersRouter.put("/:id", requirePermission("ORDERS", "ADD"), async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await replaceSalesOrderItems(req.params.id, data, req.user);
  res.json(item);
});

// ADD huỷ được đơn nháp của mình, APPROVE chuyển được mọi trạng thái — phân biệt trong service.
salesOrdersRouter.patch("/:id/status", requireAnyPermission("ORDERS.ADD", "ORDERS.APPROVE"), async (req, res) => {
  const { status } = salesOrderStatusSchema.parse(req.body);
  const item = await updateSalesOrderStatus(req.params.id, status, req.user);
  // Đơn đã huỷ không đổi trạng thái được nữa (409 trong service), nên không có chuyện báo huỷ hai lần.
  if (req.user && item.status === "CANCELLED") orderNotifications.cancelled(item, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/receiving", requirePermission("ORDERS", "RECEIVE"), async (req, res) => {
  const data = salesOrderReceivingSchema.parse(req.body);
  const item = await completeSalesOrderReceiving(req.params.id, data, req.user);
  if (req.user && item.status === "SHORT") orderNotifications.short(item, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/confirm", requirePermission("ORDERS", "APPROVE"), async (req, res) => {
  const data = salesOrderConfirmSchema.parse(req.body);
  const item = await confirmSalesOrderWithExport(req.params.id, data, req.user);
  if (req.user) orderNotifications.confirmed(item, req.user);
  res.json(item);
});

salesOrdersRouter.patch("/:id/confirm-quantities", requirePermission("ORDERS", "RECEIVE"), async (req, res) => {
  const item = await confirmOrderReportedQuantities(req.params.id, req.user);
  res.json(item);
});

// Tách riêng khỏi /receiving: chỉ ghi ngày nhận, không đụng số lượng/trạng thái/phiếu xuất kho.
// Cần ORDERS.APPROVE; kiểm tra trạng thái đơn nằm trong service.
salesOrdersRouter.patch("/:id/received-dates", requirePermission("ORDERS", "APPROVE"), async (req, res) => {
  const data = salesOrderReceivedDatesSchema.parse(req.body);
  const item = await updateSalesOrderReceivedDates(req.params.id, data, req.user);
  res.json(item);
});
