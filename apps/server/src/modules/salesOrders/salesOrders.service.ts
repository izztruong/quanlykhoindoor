import { prisma } from "../../config/db";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import type { z } from "zod";
import type { salesOrderCreateSchema } from "./salesOrders.schemas";

export const salesOrderDetailInclude = {
  warehouse: true,
  stockExport: true,
  createdBy: { select: { id: true, name: true, email: true } },
  items: { include: { product: { include: { unit: true, productGroup: true } } } },
};

type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;

/** Staff may only see/act on orders they created themselves; admins see everything. */
export function assertOwnership(order: { createdById: string | null }, user?: AuthUser) {
  if (user?.role !== "ADMIN" && order.createdById !== user?.id) {
    throw new HttpError(403, "Bạn không có quyền truy cập đơn hàng này");
  }
}

export async function createSalesOrder(data: SalesOrderCreateInput, createdById?: string) {
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
 * Staff may cancel their own order before an admin has confirmed it (still
 * DRAFT), and may complete it themselves once an admin has confirmed it
 * (CONFIRMED). Confirming an order — and cancelling one that's already
 * CONFIRMED — stays admin-only.
 */
function assertStatusTransitionAllowed(order: { status: string }, status: string, actingUser?: AuthUser) {
  if (actingUser?.role === "ADMIN") return;

  const staffAllowed =
    (order.status === "DRAFT" && status === "CANCELLED") || (order.status === "CONFIRMED" && status === "COMPLETED");

  if (!staffAllowed) {
    throw new HttpError(403, "Bạn không có quyền chuyển đơn hàng sang trạng thái này");
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

    return tx.salesOrder.update({
      where: { id: orderId },
      data: { status: status as any },
      include: salesOrderDetailInclude,
    });
  });
}
