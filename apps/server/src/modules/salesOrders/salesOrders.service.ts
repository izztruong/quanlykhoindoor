import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { getInventoryCountReport } from "../reports/reports.service";
import type { z } from "zod";
import type { salesOrderConfirmSchema, salesOrderCreateSchema, salesOrderReceivingSchema } from "./salesOrders.schemas";

export const salesOrderDetailInclude = {
  warehouse: true,
  stockExport: {
    include: {
      items: { include: { product: { include: { unit: true } }, supplier: true } },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  items: { include: { product: { include: { unit: true, productGroup: true } } } },
};

type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;
type SalesOrderReceivingInput = z.infer<typeof salesOrderReceivingSchema>;
type SalesOrderConfirmInput = z.infer<typeof salesOrderConfirmSchema>;

/** Staff may only see/act on orders they created themselves; admins see everything. */
export function assertOwnership(order: { createdById: string | null }, user?: AuthUser) {
  if (user?.role !== "ADMIN" && order.createdById !== user?.id) {
    throw new HttpError(403, "Bạn không có quyền truy cập đơn hàng này");
  }
}

/**
 * An order can't ask for more of a product than is currently on hand in its
 * warehouse — checked against system stock as of right now (cumulative
 * imports/exports to date, same figure as the "Tồn kho hiện tại" page).
 */
async function assertSufficientStock(warehouseId: string, items: { productId: string; quantity: number }[]) {
  const now = new Date();
  const { items: stockItems } = await getInventoryCountReport({ warehouseId, periodStart: now, periodEnd: now });
  const stockByProductId = new Map(stockItems.map((s) => [s.product.id, s]));

  for (const item of items) {
    const stock = stockByProductId.get(item.productId);
    const available = stock?.systemQty ?? 0;
    if (item.quantity > available) {
      const name = stock?.product.name ?? item.productId;
      throw new HttpError(400, `Số lượng đặt cho "${name}" (${item.quantity}) vượt quá tồn kho hiện có (${available})`);
    }
  }
}

export async function createSalesOrder(data: SalesOrderCreateInput, createdById?: string) {
  if (!data.skipStockCheck) await assertSufficientStock(data.warehouseId, data.items);

  return prisma.salesOrder.create({
    data: {
      code: generateCode("DH"),
      warehouseId: data.warehouseId,
      orderDate: data.orderDate,
      note: data.note,
      createdById,
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      },
    },
    include: salesOrderDetailInclude,
  });
}

export async function replaceSalesOrderItems(orderId: string, data: SalesOrderCreateInput, actingUser?: AuthUser) {
  if (!data.skipStockCheck) await assertSufficientStock(data.warehouseId, data.items);

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwnership(order, actingUser);
    if (order.status !== "DRAFT") throw new HttpError(409, "Chỉ có thể sửa đơn hàng ở trạng thái nháp");

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });

    return tx.salesOrder.update({
      where: { id: orderId },
      data: {
        warehouseId: data.warehouseId,
        orderDate: data.orderDate,
        note: data.note,
        items: {
          create: data.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          })),
        },
      },
      include: salesOrderDetailInclude,
    });
  });
}

/**
 * Staff may only cancel their own order before an admin has confirmed it
 * (still DRAFT). Cancelling a confirmed/short one stays admin-only. Setting
 * CONFIRMED is never allowed here at all, for anyone — see
 * confirmSalesOrderWithExport, which is the only path onto that status.
 * Staff complete an order through the dedicated receiving checklist
 * (completeSalesOrderReceiving) instead.
 */
function assertStatusTransitionAllowed(order: { status: string }, status: string, actingUser?: AuthUser) {
  if (status === "CONFIRMED") {
    throw new HttpError(400, "Xác nhận đơn hàng phải qua bước tạo phiếu xuất kho");
  }
  if (actingUser?.role === "ADMIN") return;

  const staffAllowed = order.status === "DRAFT" && status === "CANCELLED";

  if (!staffAllowed) {
    throw new HttpError(403, "Bạn không có quyền chuyển đơn hàng sang trạng thái này");
  }
}

interface OrderWithItemsForExport {
  id: string;
  warehouseId: string;
  items: { productId: string; quantity: Prisma.Decimal; product: { costPrice: Prisma.Decimal } }[];
}

/** Exports at the originally ordered quantities — completing means everything ordered was received. */
async function createStockExportForOrder(tx: Prisma.TransactionClient, order: OrderWithItemsForExport, actingUserId?: string) {
  await tx.stockExport.create({
    data: {
      code: generateCode("PX"),
      type: "SALE",
      transactionAt: new Date(),
      form: "CASH",
      status: "COMPLETED",
      warehouseId: order.warehouseId,
      salesOrderId: order.id,
      createdById: actingUserId,
      items: {
        create: order.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          costPrice: it.product.costPrice,
          costAmount: Number(it.quantity) * Number(it.product.costPrice),
        })),
      },
    },
  });
}

export async function updateSalesOrderStatus(orderId: string, status: string, actingUser?: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, stockExport: true },
    });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwnership(order, actingUser);
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new HttpError(409, "Đơn hàng đã đóng, không thể đổi trạng thái");
    }
    assertStatusTransitionAllowed(order, status, actingUser);

    if (status === "COMPLETED" && !order.stockExport) {
      await createStockExportForOrder(tx, order, actingUser?.id);
    }

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: status as any },
      include: salesOrderDetailInclude,
    });
  });
}

/**
 * Staff (or admin) tick off which items have been received, once the order
 * is CONFIRMED (or already SHORT from a prior partial pass). If every item
 * ends up received, the order closes out as COMPLETED and exports stock at
 * the originally ordered quantities; otherwise it lands on SHORT and stays
 * editable so the checklist can be finished later.
 */
export async function completeSalesOrderReceiving(orderId: string, data: SalesOrderReceivingInput, actingUser?: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, stockExport: true },
    });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwnership(order, actingUser);
    if (order.status !== "CONFIRMED" && order.status !== "SHORT") {
      throw new HttpError(409, "Chỉ có thể nhận hàng khi đơn đã được xác nhận");
    }

    const itemById = new Map(order.items.map((it) => [it.id, it]));
    for (const update of data.items) {
      const orderItem = itemById.get(update.itemId);
      if (!orderItem) throw new HttpError(400, "Dòng hàng hoá không thuộc đơn hàng này");
      if (update.receivedQuantity !== undefined && update.receivedQuantity > Number(orderItem.quantity)) {
        throw new HttpError(400, `Số lượng đã nhận cho "${orderItem.product.name}" vượt quá số lượng đặt`);
      }

      await tx.salesOrderItem.update({
        where: { id: update.itemId },
        data: {
          received: update.received,
          receivedQuantity: update.received ? null : (update.receivedQuantity ?? null),
        },
      });
    }

    const updateByItemId = new Map(data.items.map((it) => [it.itemId, it]));
    const allReceived = order.items.every((it) => updateByItemId.get(it.id)?.received ?? it.received);
    const newStatus = allReceived ? "COMPLETED" : "SHORT";

    if (newStatus === "COMPLETED" && !order.stockExport) {
      await createStockExportForOrder(tx, order, actingUser?.id);
    }

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: salesOrderDetailInclude,
    });
  });
}

/**
 * The only way an order reaches CONFIRMED: admin fills in a supplier + price
 * per line and that creates the linked phiếu xuất kho and flips the status in
 * one transaction. Once this has run, completing the order later never needs
 * to auto-generate a separate export (see the `!order.stockExport` guards
 * above).
 *
 * A dòng đơn hàng may be split across more than one entry (different
 * suppliers for part of the same line) — each entry becomes its own
 * StockExportItem, and every order line's entries must sum to exactly that
 * line's ordered quantity.
 */
export async function confirmSalesOrderWithExport(orderId: string, data: SalesOrderConfirmInput, actingUser?: AuthUser) {
  if (actingUser?.role !== "ADMIN") {
    throw new HttpError(403, "Chỉ quản trị viên mới được xác nhận đơn hàng");
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    if (order.status !== "DRAFT") throw new HttpError(409, "Chỉ có thể xác nhận đơn hàng ở trạng thái chưa xác nhận");

    const itemById = new Map(order.items.map((it) => [it.id, it]));
    if (data.items.some((entry) => !itemById.has(entry.itemId))) {
      throw new HttpError(400, "Dòng hàng hoá không thuộc đơn hàng này");
    }

    const entriesByItemId = new Map<string, typeof data.items>();
    for (const entry of data.items) {
      const list = entriesByItemId.get(entry.itemId) ?? [];
      list.push(entry);
      entriesByItemId.set(entry.itemId, list);
    }

    for (const orderItem of order.items) {
      const entries = entriesByItemId.get(orderItem.id);
      if (!entries || entries.length === 0) {
        throw new HttpError(400, `Thiếu thông tin phân bổ nhà cung cấp cho "${orderItem.product.name}"`);
      }
      const allocated = entries.reduce((sum, e) => sum + e.quantity, 0);
      if (Math.abs(allocated - Number(orderItem.quantity)) > 1e-6) {
        throw new HttpError(
          400,
          `Tổng số lượng phân bổ cho "${orderItem.product.name}" (${allocated}) phải bằng số lượng đặt (${orderItem.quantity})`,
        );
      }
    }

    const linePairs = data.items
      .filter((it) => it.supplierId)
      .map((it) => ({ productId: itemById.get(it.itemId)!.productId, supplierId: it.supplierId! }));
    if (linePairs.length > 0) {
      const prices = await tx.productSupplierPrice.findMany({ where: { OR: linePairs } });
      const pricedPairs = new Set(prices.map((p) => `${p.productId}:${p.supplierId}`));
      const missing = linePairs.filter((p) => !pricedPairs.has(`${p.productId}:${p.supplierId}`));
      if (missing.length > 0) {
        throw new HttpError(400, "Có hàng hoá chưa được thiết lập giá cho nhà cung cấp đã chọn");
      }
    }

    await tx.stockExport.create({
      data: {
        code: generateCode("PX"),
        type: "SALE",
        transactionAt: new Date(),
        form: "CASH",
        status: "COMPLETED",
        warehouseId: order.warehouseId,
        salesOrderId: order.id,
        createdById: actingUser?.id,
        items: {
          create: data.items.map((entry) => {
            const orderItem = itemById.get(entry.itemId)!;
            return {
              productId: orderItem.productId,
              quantity: entry.quantity,
              costPrice: entry.costPrice,
              costAmount: entry.quantity * entry.costPrice,
              supplierId: entry.supplierId,
            };
          }),
        },
      },
    });

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: "CONFIRMED" },
      include: salesOrderDetailInclude,
    });
  });
}
