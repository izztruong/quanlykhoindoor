import { prisma } from "../../../config/db";
import { capRows, dateRangeInput, dateTimeRange, defineTool, EXPENSE_ROW_DOC, formatVnDay, num, ORDER_PRICE_DOC, orderLinePrice, shopIdParam, sumAmounts, type ExpenseRow } from "../shared";

/**
 * Dòng đơn hàng KHÔNG lưu giá. Giá nằm ở phiếu xuất ghi lúc admin xử lý đơn
 * (StockExportItem: giá NCC từng dòng, một hàng hoá có thể tách nhiều NCC, SL đã co theo số nhận
 * thật — xem salesOrders.service). Còn ngày "nhận trong kỳ" lại nằm ở SalesOrderItem.receivedAt —
 * cùng mốc Check Cost dùng. Nên ghép hai bên theo (đơn, hàng hoá). Giá phiếu xuất bằng 0 (admin không
 * nhập) thì lùi về giá vốn hàng hoá — xem orderLinePrice.
 */
export const orderLines = defineTool({
  name: "order_lines",
  title: "Đơn hàng — dòng hàng đã nhận (có giá)",
  description:
    "Từng dòng hàng của đơn hàng quán đặt, đã có giá. SL lấy từ phiếu xuất kho ghi lúc admin xử lý đơn (khớp SL nhận). " +
    "Ngày = ngày quán thực nhận dòng đó (dòng chưa nhận không có ở đây; đơn đã huỷ bị loại). Quán = người đặt đơn. " +
    "Một hàng hoá lấy từ nhiều NCC thì ra nhiều dòng, mỗi dòng một giá. " +
    `${EXPENSE_ROW_DOC} Thêm: productCode, group (nhóm hàng hoá), supplier, priceSource. ${ORDER_PRICE_DOC} ` +
    "unpricedLines = dòng đã nhận nhưng đơn không có phiếu xuất cho hàng hoá đó (không tính vào totalAmount).",
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const receivedLines = await prisma.salesOrderItem.findMany({
      where: {
        receivedAt: dateTimeRange(from, to),
        salesOrder: { status: { not: "CANCELLED" }, createdById: shopId },
      },
      select: {
        salesOrderId: true,
        productId: true,
        receivedAt: true,
        product: { select: { code: true, name: true } },
        salesOrder: { select: { code: true } },
      },
    });

    // Cùng một hàng hoá lặp trong một đơn: lấy mốc nhận muộn nhất.
    const receivedAtByKey = new Map<string, Date>();
    for (const line of receivedLines) {
      const key = `${line.salesOrderId}:${line.productId}`;
      const prev = receivedAtByKey.get(key);
      if (!prev || line.receivedAt! > prev) receivedAtByKey.set(key, line.receivedAt!);
    }

    const exportItems = receivedLines.length
      ? await prisma.stockExportItem.findMany({
          where: {
            stockExport: { salesOrderId: { in: [...new Set(receivedLines.map((l) => l.salesOrderId))] } },
            productId: { in: [...new Set(receivedLines.map((l) => l.productId))] },
          },
          include: {
            product: { select: { code: true, name: true, unit: { select: { name: true } }, productGroup: { select: { name: true } }, costPrice: true } },
            supplier: { select: { name: true } },
            stockExport: { select: { salesOrder: { select: { id: true, code: true, createdBy: { select: { name: true } } } } } },
          },
        })
      : [];

    const pricedKeys = new Set<string>();
    const rows: (ExpenseRow & { productCode: string; group: string; supplier: string | null; priceSource: string; receivedAt: Date })[] = [];
    for (const it of exportItems) {
      const order = it.stockExport.salesOrder!;
      const key = `${order.id}:${it.productId}`;
      const receivedAt = receivedAtByKey.get(key);
      if (!receivedAt) continue; // cặp (đơn, hàng hoá) không nằm trong khoảng ngày
      pricedKeys.add(key);
      const quantity = num(it.quantity);
      const price = orderLinePrice(quantity, num(it.costPrice), num(it.product.costPrice));
      rows.push({
        date: formatVnDay(receivedAt),
        name: it.product.name,
        unit: it.product.unit.name,
        quantity,
        unitPrice: price.unitPrice,
        amount: price.amount,
        source: "Đơn hàng",
        docCode: order.code,
        note: it.note,
        shop: order.createdBy?.name ?? null,
        productCode: it.product.code,
        group: it.product.productGroup.name,
        supplier: it.supplier?.name ?? null,
        priceSource: price.priceSource,
        receivedAt,
      });
    }
    rows.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || (a.docCode ?? "").localeCompare(b.docCode ?? ""));

    const unpricedLines = receivedLines
      .filter((l) => !pricedKeys.has(`${l.salesOrderId}:${l.productId}`))
      .map((l) => ({ docCode: l.salesOrder.code, productCode: l.product.code, name: l.product.name, date: formatVnDay(l.receivedAt) }));

    return {
      totalAmount: sumAmounts(rows),
      unpricedLines,
      ...capRows(rows.map(({ receivedAt: _receivedAt, ...row }) => row)),
    };
  },
});
