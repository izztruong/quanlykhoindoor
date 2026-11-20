import { prisma } from "../../../config/db";
import { vatMultiplier } from "../../../utils/vat";
import { capRows, dateRangeInput, dateTimeRange, defineTool, EXPENSE_ROW_DOC, formatVnDay, num, shopIdParam, sumAmounts, type ExpenseRow } from "../shared";

/**
 * Nguồn là PHIẾU NHẬP KHO của kho quán (`Warehouse.shopUserId`), không còn là đơn hàng: đơn hàng giờ
 * chỉ là đề xuất và không lưu giá, còn hàng thực nhận — kể cả hàng mua ngoài không qua đơn — nằm ở
 * phiếu nhập. Giá lấy thẳng `StockImportItem.costPrice`, NCC lấy từ ĐẦU PHIẾU (mỗi phiếu một NCC,
 * một chuyến giao).
 *
 * VAT lấy từ `StockImportItem.vatPercent` — số CHỐT vào dòng lúc lập phiếu, không phải VAT danh mục
 * hiện hành — nên khớp đúng cột Giá VAT / Thành tiền VAT trên trang chi tiết phiếu. Cách làm tròn chép từ
 * `withVat` của web (`apps/web/src/lib/vat.ts`): đổi một bên phải đổi bên kia.
 *
 * Tên tool giữ nguyên `order_lines` vì token MCP lưu theo tên — đổi tên là token cũ mất quyền gọi.
 */
export const orderLines = defineTool({
  name: "order_lines",
  title: "Hàng nhập kho của quán (có giá)",
  description:
    "Từng dòng hàng ĐÃ NHẬP KHO của một quán, kèm giá. Nguồn là phiếu nhập kho (mã PN…) của kho riêng quán đó — " +
    "KHÔNG phải đơn hàng: đơn hàng chỉ là đề xuất quán gửi lên, không có giá và không chắc đã về. " +
    "Ngày = thời điểm trên phiếu nhập (chính là mốc Check Cost dùng để tính hàng về trong kỳ). " +
    "NCC là của cả phiếu, không theo từng dòng. Phiếu nháp/đã huỷ không có ở đây. " +
    `${EXPENSE_ROW_DOC} Thêm: productCode, group (nhóm hàng hoá), supplier. ` +
    "VAT: vatPercent (phần trăm chốt trên dòng phiếu, 8 = 8%; null = không VAT), unitPriceVat, amountVat = đơn giá/thành tiền đã cộng VAT " +
    "(unitPrice/amount là giá TRƯỚC thuế). totalAmountVat = tổng amountVat, cùng phạm vi với totalAmount. " +
    "unpricedLines = dòng có đơn giá 0 (không tính vào totalAmount) — thường là hàng chuyển từ dữ liệu cũ.",
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const items = await prisma.stockImportItem.findMany({
      where: {
        stockImport: {
          status: "COMPLETED",
          transactionAt: dateTimeRange(from, to),
          warehouse: { shopUserId: shopId },
        },
      },
      include: {
        product: {
          select: {
            code: true,
            name: true,
            unit: { select: { name: true } },
            productGroup: { select: { name: true } },
          },
        },
        stockImport: {
          select: {
            code: true,
            transactionAt: true,
            supplier: { select: { name: true } },
            warehouse: { select: { shopUser: { select: { name: true } } } },
          },
        },
      },
    });

    const rows: (ExpenseRow & {
      productCode: string;
      group: string;
      supplier: string | null;
      unitPrice: number;
      vatPercent: number | null;
      unitPriceVat: number;
      amountVat: number;
    })[] = [];
    for (const it of items) {
      // `quantity` và `costPrice` là Decimal NOT NULL nên không cần `num()` (vốn trả number | null).
      const quantity = Number(it.quantity);
      const unitPrice = Number(it.costPrice);
      const vatPercent = num(it.vatPercent);
      const factor = vatMultiplier(vatPercent, true);
      rows.push({
        date: formatVnDay(it.stockImport.transactionAt),
        name: it.product.name,
        unit: it.product.unit.name,
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
        source: "Phiếu nhập kho",
        docCode: it.stockImport.code,
        note: it.note,
        shop: it.stockImport.warehouse.shopUser?.name ?? null,
        productCode: it.product.code,
        group: it.product.productGroup.name,
        supplier: it.stockImport.supplier?.name ?? null,
        vatPercent,
        unitPriceVat: Math.round(unitPrice * factor),
        amountVat: Math.round(quantity * unitPrice * factor),
      });
    }
    rows.sort(
      (a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") ||
        (a.docCode ?? "").localeCompare(b.docCode ?? "") ||
        a.name.localeCompare(b.name),
    );

    const unpricedLines = rows
      .filter((row) => row.unitPrice === 0)
      .map((row) => ({ docCode: row.docCode, productCode: row.productCode, name: row.name, date: row.date }));

    const priced = rows.filter((row) => row.unitPrice > 0);
    return {
      totalAmount: sumAmounts(priced),
      totalAmountVat: Math.round(priced.reduce((total, row) => total + row.amountVat, 0)),
      unpricedLines,
      ...capRows(rows),
    };
  },
});
