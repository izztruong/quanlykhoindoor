import { sanitizeExcelRow } from "@/lib/excelExport";
import type { SalesOrder } from "@/types";
import ExcelJS from "exceljs";

const TABLE_HEADER = ["Tên hàng hoá", "Số lượng đặt", "Đơn vị"];

const THIN_BORDER = { top: { style: "thin" as const }, bottom: { style: "thin" as const }, left: { style: "thin" as const }, right: { style: "thin" as const } };

/**
 * Danh sách hàng hoá thuần, để cầm đi mua/nhận hàng — cố tình KHÔNG phải bản sao hoá đơn.
 * Mẫu hoá đơn đầy đủ (mã đơn, kho, giá, VAT, tổng tiền, tiền bằng chữ) nằm ở chức năng in:
 * /print/orders/[id]. Hai đường ra phục vụ hai mục đích khác nhau nên cố ý khác nội dung.
 *
 * Không in mã đơn vào trong sheet vì nó đã là tên file.
 */
export async function exportOrderToExcel(order: SalesOrder) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Đơn hàng");

  sheet.columns = [{ width: 36 }, { width: 14 }, { width: 12 }];

  const headerRow = sheet.addRow(TABLE_HEADER);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center" };
  });

  for (const item of order.items) {
    // Số lượng ĐẶT, không phải số đã nhận — đây là danh sách để đi lấy hàng.
    const row = sheet.addRow(sanitizeExcelRow([item.product.name, Number(item.quantity), item.product.unit?.name ?? "-"]));
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${order.code}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
