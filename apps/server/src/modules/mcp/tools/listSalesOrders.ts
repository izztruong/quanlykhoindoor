import { z } from "zod";
import { prisma } from "../../../config/db";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, num, ORDER_PRICE_DOC, orderLinePrice, shopIdParam, sumAmounts } from "../shared";

const STATUSES = ["DRAFT", "COMPLETED", "CANCELLED"] as const;

export const listSalesOrders = defineTool({
  name: "list_sales_orders",
  title: "Đơn hàng",
  description:
    "Đơn hàng quán đặt, lọc theo NGÀY ĐẶT (orderDate). Mỗi đơn có: items (dòng đặt: SL đặt, SL nhận, lúc nhận, ghi chú) " +
    "và exportLines (phiếu xuất ghi lúc admin xử lý đơn: NCC, SL, đơn giá, thành tiền, priceSource — chưa xử lý thì rỗng). " +
    `${ORDER_PRICE_DOC} ` +
    "Trạng thái: DRAFT = chưa xử lý, COMPLETED = admin đã xử lý (ghi SL + ngày nhận), CANCELLED = đã huỷ. " +
    "Hàng admin tự thêm lúc xử lý có SL đặt = 0. Thời gian theo giờ VN. " +
    "Muốn tính chi phí theo ngày nhận thì dùng order_lines.",
  input: {
    ...dateRangeInput,
    shopId: shopIdParam,
    status: z.enum(STATUSES).optional().describe("Lọc một trạng thái. Bỏ trống = mọi trạng thái."),
  },
  run: async ({ from, to, shopId, status }) => {
    const orders = await prisma.salesOrder.findMany({
      where: { orderDate: dateTimeRange(from, to), createdById: shopId, status },
      orderBy: { orderDate: "asc" },
      include: {
        createdBy: { select: { name: true } },
        warehouse: { select: { name: true } },
        items: { include: { product: { select: { code: true, name: true, unit: { select: { name: true } } } } } },
        stockExport: {
          include: {
            items: { include: { product: { select: { code: true, name: true, costPrice: true } }, supplier: { select: { name: true } } } },
          },
        },
      },
    });

    const rows = orders.map((o) => {
      const exportLines = (o.stockExport?.items ?? []).map((it) => {
        const quantity = num(it.quantity);
        return {
          productCode: it.product.code,
          name: it.product.name,
          supplier: it.supplier?.name ?? null,
          quantity,
          ...orderLinePrice(quantity, num(it.costPrice), num(it.product.costPrice)),
        };
      });
      return {
        code: o.code,
        orderDate: formatVnDateTime(o.orderDate),
        status: o.status,
        shop: o.createdBy?.name ?? null,
        warehouse: o.warehouse.name,
        completedAt: formatVnDateTime(o.completedAt),
        isLate: o.isLate,
        note: o.note,
        totalAmount: sumAmounts(exportLines),
        items: o.items.map((it) => ({
          productCode: it.product.code,
          name: it.product.name,
          unit: it.product.unit.name,
          quantity: num(it.quantity),
          receivedQuantity: num(it.receivedQuantity),
          receivedAt: formatVnDateTime(it.receivedAt),
          note: it.note,
        })),
        exportLines,
      };
    });
    return capRows(rows);
  },
});
