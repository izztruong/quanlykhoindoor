import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { parsePagination } from "../../utils/pagination";
import { parseDateOnly } from "../../utils/vnTime";
import {
  bakeryOrderCreateSchema,
  bakeryOrderListQuerySchema,
  bakeryOrderReceiveSchema,
  bakeryOrderReceivedEditSchema,
  bakeryOrderStepSchema,
} from "./bakeryOrders.schemas";
import {
  bakeryOrderListInclude,
  bakeryOrderOptions,
  bakeryOrderScopeWhere,
  cancelBakeryOrder,
  confirmBakeryOrder,
  createBakeryOrder,
  editReceivedBakeryOrder,
  findScopedBakeryOrder,
  pickUpBakeryOrder,
  receiveBakeryOrder,
  rejectBakeryOrder,
} from "./bakeryOrders.service";

/**
 * Đơn bánh: quán đặt → tiệm bánh xác nhận → vận chuyển lấy hàng → quán nhận (tự sinh phiếu nhập kho).
 * Mỗi bước là một route riêng mang quyền TƯỜNG MINH, vì POST cho mọi bước mà suy quyền theo method
 * thì bước nào cũng thành ADD.
 */
export const bakeryOrdersRouter = Router();

bakeryOrdersRouter.get("/", requirePermission("BAKERY_ORDERS", "VIEW"), async (req, res) => {
  const query = bakeryOrderListQuerySchema.parse(req.query);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    AND: [
      bakeryOrderScopeWhere(req.user),
      {
        status: query.status,
        shopUserId: query.shopUserId,
        supplierId: query.supplierId,
        deliveryOn:
          query.from || query.to
            ? { gte: query.from ? parseDateOnly(query.from) : undefined, lte: query.to ? parseDateOnly(query.to) : undefined }
            : undefined,
      },
    ],
  };

  const [items, total] = await Promise.all([
    prisma.bakeryOrder.findMany({
      where,
      include: bakeryOrderListInclude,
      orderBy: [{ deliveryOn: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    prisma.bakeryOrder.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

// Khai TRƯỚC "/:id", không thì Express hiểu "options" là một id.
bakeryOrdersRouter.get("/options", requirePermission("BAKERY_ORDERS", "ADD"), async (req, res) => {
  const shopUserId = typeof req.query.shopUserId === "string" && req.query.shopUserId ? req.query.shopUserId : undefined;
  res.json({ bakeries: await bakeryOrderOptions(req.user, shopUserId) });
});

bakeryOrdersRouter.get("/:id", requirePermission("BAKERY_ORDERS", "VIEW"), async (req, res) => {
  res.json(await findScopedBakeryOrder(req.params.id as string, req.user));
});

bakeryOrdersRouter.post("/", requirePermission("BAKERY_ORDERS", "ADD"), async (req, res) => {
  const data = bakeryOrderCreateSchema.parse(req.body);
  res.status(201).json(await createBakeryOrder(data, req.user));
});

bakeryOrdersRouter.post("/:id/confirm", requirePermission("BAKERY_ORDERS", "CONFIRM"), async (req, res) => {
  const data = bakeryOrderStepSchema.parse(req.body);
  res.json(await confirmBakeryOrder(req.params.id as string, data, req.user));
});

bakeryOrdersRouter.post("/:id/reject", requirePermission("BAKERY_ORDERS", "CONFIRM"), async (req, res) => {
  res.json(await rejectBakeryOrder(req.params.id as string, req.user));
});

bakeryOrdersRouter.post("/:id/cancel", requirePermission("BAKERY_ORDERS", "CANCEL"), async (req, res) => {
  res.json(await cancelBakeryOrder(req.params.id as string, req.user));
});

bakeryOrdersRouter.post("/:id/pickup", requirePermission("BAKERY_ORDERS", "PICKUP"), async (req, res) => {
  const data = bakeryOrderStepSchema.parse(req.body);
  res.json(await pickUpBakeryOrder(req.params.id as string, data, req.user));
});

bakeryOrdersRouter.post("/:id/receive", requirePermission("BAKERY_ORDERS", "RECEIVE"), async (req, res) => {
  const data = bakeryOrderReceiveSchema.parse(req.body);
  const { order, affectedCostChecks } = await receiveBakeryOrder(req.params.id as string, data, req.user);
  res.json({ ...order, affectedCostChecks });
});

bakeryOrdersRouter.put("/:id/received", requirePermission("BAKERY_ORDERS", "EDIT"), async (req, res) => {
  const data = bakeryOrderReceivedEditSchema.parse(req.body);
  const { order, affectedCostChecks } = await editReceivedBakeryOrder(req.params.id as string, data, req.user);
  res.json({ ...order, affectedCostChecks });
});
