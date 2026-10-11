import { prisma } from "../../config/db";
import { assertOwner, type AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { stampSalesOrderLateness } from "../../utils/deadlines";
import { HttpError } from "../../utils/httpError";
import type { z } from "zod";
import type { salesOrderCreateSchema } from "./salesOrders.schemas";

export const salesOrderDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  processedBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true, productGroup: true } } } },
};

/**
 * Bảng danh sách chỉ hiện mã đơn, tài khoản, ngày đặt, tổng số lượng, dấu "đã xử lý" và trạng thái.
 * Dùng chung `salesOrderDetailInclude` từng khiến mỗi đơn kéo theo thông tin đầy đủ của từng sản
 * phẩm — đo được 187 KB cho 20 đơn.
 *
 * Ở đây chỉ lấy đúng phần bảng cần. Riêng số lượng vẫn phải lấy thô từng dòng để cộng, nhưng
 * `select: { quantity: true }` khiến mỗi dòng chỉ còn một con số thay vì cả object sản phẩm, và
 * mảng này bị bỏ khỏi payload sau khi cộng xong (xem route GET "/").
 */
export const salesOrderListInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  items: { select: { quantity: true } },
};

type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;

export async function createSalesOrder(data: SalesOrderCreateInput, createdById?: string) {
  // Ghi createdAt tường minh thay vì để DB tự điền: dấu đúng hạn/muộn phải được chấm theo đúng
  // mốc lưu trong cột, nếu lấy hai nguồn thời gian khác nhau thì đơn sát giờ hạn có thể bị chấm
  // lệch với chính con số hiển thị bên cạnh nó.
  const createdAt = new Date();
  const lateness = await stampSalesOrderLateness(createdAt);

  return prisma.salesOrder.create({
    data: {
      code: generateCode("DH"),
      orderDate: data.orderDate,
      note: data.note,
      createdById,
      createdAt,
      dueAt: lateness.dueAt,
      isLate: lateness.isLate,
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
    assertOwner(order, actingUser, "Không tìm thấy đơn hàng");
    if (order.status === "CANCELLED") throw new HttpError(409, "Đơn hàng đã huỷ, không sửa được");

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });

    return tx.salesOrder.update({
      where: { id: orderId },
      data: {
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
 * Đổi trạng thái tay chỉ còn huỷ (schema chỉ nhận CANCELLED). ORDERS.ADD chỉ huỷ được đơn của mình
 * (phạm vi kiểm ở assertOwner); ORDERS.APPROVE huỷ được đơn của mọi quán.
 */
export async function updateSalesOrderStatus(orderId: string, status: "CANCELLED", actingUser?: AuthUser) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(order, actingUser, "Không tìm thấy đơn hàng");
  if (order.status === "CANCELLED") throw new HttpError(409, "Đơn hàng đã huỷ");

  return prisma.salesOrder.update({ where: { id: orderId }, data: { status }, include: salesOrderDetailInclude });
}

/**
 * Bật/tắt dấu "Đã xử lý" của đơn. Mục đích DUY NHẤT là để admin biết đơn nào đã làm — hàng thực
 * nhận ghi ở phiếu nhập kho của quán, nên dấu này KHÔNG ảnh hưởng tồn kho hay Check Cost. Đừng gắn
 * thêm nghiệp vụ vào đây: làm vậy là dựng lại bước "xử lý đơn" cũ dưới một cái tên khác.
 *
 * Trả thêm `firstTick` để route biết có bắn thông báo cho quán hay không: chỉ lần tick ĐẦU bắn, bỏ
 * tích rồi tick lại thì im — cùng luật `firstCompletion` của luồng cũ, tránh spam quán vì admin lỡ tay.
 */
export async function setSalesOrderProcessed(orderId: string, processed: boolean, actingUser?: AuthUser) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(order, actingUser, "Không tìm thấy đơn hàng");
  if (order.status === "CANCELLED") throw new HttpError(409, "Đơn hàng đã huỷ, không đánh dấu được");

  // Dấu "đã báo quán một lần" là `processedById`, KHÔNG phải `processedAt`: bỏ tích xoá `processedAt`
  // nên nếu so theo nó thì bỏ tích rồi tick lại là bắn thông báo lần hai (đã tái hiện bằng curl).
  // Vì vậy bỏ tích CỐ Ý giữ `processedById` — nó là "người tick gần nhất", và giao diện chỉ hiện
  // người đó khi đơn đang được tích.
  //
  // Lỗ đã biết, chấp nhận: 185 đơn chuyển từ dữ liệu cũ có `processedAt` nhưng `processedById` rỗng,
  // nên bỏ tích rồi tick lại một trong số đó sẽ bắn một thông báo. Chúng đã được báo ở luồng cũ.
  const firstTick = processed && order.processedById == null;

  const updated = await prisma.salesOrder.update({
    where: { id: orderId },
    data: {
      processedAt: processed ? (order.processedAt ?? new Date()) : null,
      processedById: processed ? (order.processedById ?? actingUser?.id ?? null) : order.processedById,
    },
    include: salesOrderDetailInclude,
  });

  return { order: updated, firstTick };
}
