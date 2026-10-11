import { z } from "zod";
import { prisma } from "../../../config/db";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, num, shopIdParam } from "../shared";

const STATUSES = ["DRAFT", "CANCELLED"] as const;

export const listSalesOrders = defineTool({
  name: "list_sales_orders",
  title: "Đơn hàng (đề xuất của quán)",
  description:
    "Đơn hàng quán ĐẶT, lọc theo ngày đặt (orderDate). Đây chỉ là ĐỀ XUẤT: đơn không có giá và không " +
    "cho biết hàng đã về hay chưa — hàng thực nhận nằm ở phiếu nhập kho, hỏi bằng order_lines. " +
    "Trạng thái: DRAFT = đã đặt, CANCELLED = đã huỷ (không còn 'hoàn thành'). " +
    "processedAt = lúc admin tích 'Đã xử lý' (null = chưa xử lý), processedBy = người tích. " +
    "Thời gian theo giờ VN.",
  input: {
    ...dateRangeInput,
    shopId: shopIdParam,
    status: z.enum(STATUSES).optional().describe("Lọc một trạng thái. Bỏ trống = mọi trạng thái."),
    processed: z.boolean().optional().describe("true = chỉ đơn đã tích 'Đã xử lý', false = chỉ đơn chưa xử lý."),
  },
  run: async ({ from, to, shopId, status, processed }) => {
    const orders = await prisma.salesOrder.findMany({
      where: {
        orderDate: dateTimeRange(from, to),
        createdById: shopId,
        status,
        processedAt: processed === true ? { not: null } : processed === false ? null : undefined,
      },
      orderBy: { orderDate: "asc" },
      include: {
        createdBy: { select: { name: true } },
        processedBy: { select: { name: true } },
        items: { include: { product: { select: { code: true, name: true, unit: { select: { name: true } } } } } },
      },
    });

    const rows = orders.map((o) => ({
      code: o.code,
      orderDate: formatVnDateTime(o.orderDate),
      status: o.status,
      shop: o.createdBy?.name ?? null,
      processedAt: formatVnDateTime(o.processedAt),
      processedBy: o.processedBy?.name ?? null,
      isLate: o.isLate,
      note: o.note,
      items: o.items.map((it) => ({
        productCode: it.product.code,
        name: it.product.name,
        unit: it.product.unit.name,
        quantity: num(it.quantity),
      })),
    }));
    return capRows(rows);
  },
});
