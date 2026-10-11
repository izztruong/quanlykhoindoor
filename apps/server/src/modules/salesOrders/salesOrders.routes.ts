import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, ownerWhere, requireAnyPermission, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { orderNotifications } from "../notifications/notifications.service";
import {
  salesOrderCreateSchema,
  salesOrderProcessedSchema,
  salesOrderStatusSchema,
} from "./salesOrders.schemas";
import {
  createSalesOrder,
  replaceSalesOrderItems,
  salesOrderDetailInclude,
  salesOrderListInclude,
  setSalesOrderProcessed,
  updateSalesOrderStatus,
} from "./salesOrders.service";

export const salesOrdersRouter = Router();

salesOrdersRouter.get("/", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { status, createdById, processed } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    status: (status || undefined) as any,
    orderDate: from || to ? { gte: from, lte: to } : undefined,
    // Lọc theo dấu "Đã xử lý". Đây là thứ giữ cho danh sách đơn không ứ đọng sau khi đơn hàng bỏ
    // trạng thái "Hoàn thành" — không có nó thì mọi đơn chưa huỷ nằm chung một rổ mãi mãi.
    processedAt: processed === "true" ? { not: null } : processed === "false" ? null : undefined,
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

// Huỷ đơn: ADD huỷ đơn của mình, APPROVE huỷ đơn mọi quán (phạm vi kiểm trong service).
salesOrdersRouter.patch("/:id/status", requireAnyPermission("ORDERS.ADD", "ORDERS.APPROVE"), async (req, res) => {
  const { status } = salesOrderStatusSchema.parse(req.body);
  const item = await updateSalesOrderStatus(req.params.id, status, req.user);
  // Đơn đã huỷ không huỷ lại được (409 trong service), nên không có chuyện báo huỷ hai lần.
  if (req.user) orderNotifications.cancelled(item, req.user);
  res.json(item);
});

// Ô tích "Đã xử lý" — đánh dấu đơn nào admin đã làm. Không nhập SL, không sinh phiếu nào.
salesOrdersRouter.patch("/:id/processed", requirePermission("ORDERS", "APPROVE"), async (req, res) => {
  const { processed } = salesOrderProcessedSchema.parse(req.body);
  const { order, firstTick } = await setSalesOrderProcessed(req.params.id, processed, req.user);
  // Gửi sau khi đã ghi xong, không await. Chỉ lần tick ĐẦU — bỏ tích rồi tick lại thì im, để admin
  // lỡ tay không bắn hai lần thông báo cho quán.
  if (req.user && firstTick) orderNotifications.completed(order, req.user);
  res.json(order);
});
