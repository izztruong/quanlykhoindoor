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
  items: {
    productId: string;
    quantity: Prisma.Decimal;
    receivedQuantity?: number | Prisma.Decimal | null;
    product: { costPrice: Prisma.Decimal };
  }[];
}

/** Exports at the actual received quantity where known, falling back to the ordered quantity otherwise. */
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
        create: order.items.map((it) => {
          const qty = it.receivedQuantity != null ? Number(it.receivedQuantity) : Number(it.quantity);
          return {
            productId: it.productId,
            quantity: qty,
            costPrice: it.product.costPrice,
            costAmount: qty * Number(it.product.costPrice),
          };
        }),
      },
    },
  });
}

/**
 * Once an order is confirmed, its stock export already exists (created in
 * confirmSalesOrderWithExport at the ordered quantities, possibly split
 * across suppliers). When the actual received quantity for a product turns
 * out to differ, scale every export line for that product proportionally so
 * the export's total matches reality while keeping each supplier's relative
 * share intact.
 */
async function reconcileStockExportForOrder(
  tx: Prisma.TransactionClient,
  stockExportId: string,
  targets: { productId: string; receivedQuantity: number }[],
) {
  const exportItems = await tx.stockExportItem.findMany({ where: { stockExportId } });
  const linesByProduct = new Map<string, typeof exportItems>();
  for (const line of exportItems) {
    const list = linesByProduct.get(line.productId) ?? [];
    list.push(line);
    linesByProduct.set(line.productId, list);
  }

  for (const target of targets) {
    const lines = linesByProduct.get(target.productId);
    if (!lines || lines.length === 0) continue;

    const currentTotal = lines.reduce((sum, l) => sum + Number(l.quantity), 0);
    if (currentTotal <= 0 || Math.abs(currentTotal - target.receivedQuantity) < 1e-6) continue;

    const scale = target.receivedQuantity / currentTotal;
    for (const line of lines) {
      const newQty = Number(line.quantity) * scale;
      await tx.stockExportItem.update({
        where: { id: line.id },
        data: { quantity: newQty, costAmount: newQty * Number(line.costPrice) },
      });
    }
  }
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
 * Staff (or admin) record how much of each line actually arrived, once the
 * order is CONFIRMED (or already SHORT from a prior partial pass) - this can
 * be less than, equal to, or more than what was ordered. If every item ends
 * up with at least its ordered quantity, the order closes out as COMPLETED;
 * otherwise it lands on SHORT and stays editable so the checklist can be
 * finished later. Either way, the linked stock export (created at confirm
 * time) is kept in sync with the actual received quantities.
 */
export async function completeSalesOrderReceiving(orderId: string, data: SalesOrderReceivingInput, actingUser?: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, stockExport: { include: { items: true } } },
    });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwnership(order, actingUser);
    if (order.status !== "CONFIRMED" && order.status !== "SHORT") {
      throw new HttpError(409, "Chỉ có thể nhận hàng khi đơn đã được xác nhận");
    }

    const itemById = new Map(order.items.map((it) => [it.id, it]));
    const updateByItemId = new Map(data.items.map((it) => [it.itemId, it]));

    // Effective received quantity per line: this submission's value where
    // touched, otherwise whatever was already saved from an earlier pass.
    const receivedByItemId = new Map<string, number>();
    for (const orderItem of order.items) {
      const update = updateByItemId.get(orderItem.id);
      const qty = update ? update.receivedQuantity : orderItem.receivedQuantity != null ? Number(orderItem.receivedQuantity) : 0;
      receivedByItemId.set(orderItem.id, qty);
    }

    for (const update of data.items) {
      const orderItem = itemById.get(update.itemId);
      if (!orderItem) throw new HttpError(400, "Dòng hàng hoá không thuộc đơn hàng này");

      await tx.salesOrderItem.update({
        where: { id: update.itemId },
        data: {
          receivedQuantity: update.receivedQuantity,
          received: update.receivedQuantity >= Number(orderItem.quantity),
        },
      });
    }

    const allReceived = order.items.every((it) => (receivedByItemId.get(it.id) ?? 0) >= Number(it.quantity));
    const newStatus = allReceived ? "COMPLETED" : "SHORT";

    if (order.stockExport) {
      await reconcileStockExportForOrder(
        tx,
        order.stockExport.id,
        order.items.map((it) => ({ productId: it.productId, receivedQuantity: receivedByItemId.get(it.id)! })),
      );
    } else if (newStatus === "COMPLETED") {
      await createStockExportForOrder(
        tx,
        {
          id: order.id,
          warehouseId: order.warehouseId,
          items: order.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            receivedQuantity: receivedByItemId.get(it.id)!,
            product: it.product,
          })),
        },
        actingUser?.id,
      );
    }

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: newStatus },
      include: salesOrderDetailInclude,
    });
  });
}

/**
 * Admin fills in a supplier + price per line (what was actually ordered from
 * the NCC) and that creates the linked phiếu xuất kho in one transaction. The
 * order lands on PENDING_CONFIRM rather than CONFIRMED — the reported
 * quantity still needs the ordering nhân viên to acknowledge it (see
 * confirmOrderReportedQuantities) before it becomes the order's official
 * quantity and the order is CONFIRMED. Once this has run, completing the
 * order later never needs to auto-generate a separate export (see the
 * `!order.stockExport` guards above).
 *
 * A dòng đơn hàng may be split across more than one entry (different
 * suppliers for part of the same line) — each entry becomes its own
 * StockExportItem. Entries no longer need to sum to the originally ordered
 * quantity: admin reports whatever was actually obtained from suppliers.
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
      data: { status: "PENDING_CONFIRM" },
      include: salesOrderDetailInclude,
    });
  });
}

/**
 * The nhân viên who placed the order reviews the quantity admin actually
 * obtained from suppliers (reported via confirmSalesOrderWithExport, summed
 * per product across the export's lines) and acknowledges it. That reported
 * quantity replaces each line's originally-ordered quantity outright, then
 * the order moves to CONFIRMED so it can proceed through the existing
 * receiving checklist (completeSalesOrderReceiving) unchanged.
 */
export async function confirmOrderReportedQuantities(orderId: string, actingUser?: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: true, stockExport: { include: { items: true } } },
    });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwnership(order, actingUser);
    if (order.status !== "PENDING_CONFIRM") {
      throw new HttpError(409, "Đơn hàng không ở trạng thái chờ xác nhận");
    }

    const reportedByProductId = new Map<string, number>();
    for (const line of order.stockExport?.items ?? []) {
      reportedByProductId.set(line.productId, (reportedByProductId.get(line.productId) ?? 0) + Number(line.quantity));
    }

    for (const item of order.items) {
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: { quantity: reportedByProductId.get(item.productId) ?? 0 },
      });
    }

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: "CONFIRMED" },
      include: salesOrderDetailInclude,
    });
  });
}
