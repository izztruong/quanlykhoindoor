import { formatDateVN, labels } from "@/lib/format";
import type { SalesOrder } from "@/types";
import ExcelJS from "exceljs";

const TABLE_HEADER = ["#", "Mã hàng", "Tên hàng", "Ghi chú", "NVL", "ĐVT", "Số lượng", "Đơn giá", "Giảm giá", "Vat", "Tiền Vat", "Thành tiền"];

const THIN_BORDER = { top: { style: "thin" as const }, bottom: { style: "thin" as const }, left: { style: "thin" as const }, right: { style: "thin" as const } };

export async function exportOrderToExcel(order: SalesOrder) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Phiếu bán hàng");

  sheet.columns = [
    { width: 4 },
    { width: 12 },
    { width: 26 },
    { width: 16 },
    { width: 6 },
    { width: 8 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 8 },
    { width: 10 },
    { width: 12 },
  ];

  const titleRow = sheet.addRow(["PHIẾU BÁN HÀNG"]);
  titleRow.font = { bold: true, size: 16 };
  sheet.mergeCells(`A${titleRow.number}:L${titleRow.number}`);
  titleRow.alignment = { horizontal: "center" };
  sheet.addRow([]);

  function addInfoRow(label: string, value: string) {
    const row = sheet.addRow(["", label, value]);
    row.getCell(2).font = { bold: true };
  }

  addInfoRow("Số phiếu:", order.code);
  addInfoRow("Ngày tạo:", formatDateVN(order.createdAt));
  addInfoRow("Trạng thái:", labels.salesOrderStatus(order.status));
  addInfoRow("Tài khoản:", order.createdBy?.name ?? "-");
  addInfoRow("Email:", order.createdBy?.email ?? "-");
  addInfoRow("Kho xuất:", `${order.warehouse.code} - ${order.warehouse.name}`);
  addInfoRow("Đ/C kho xuất:", order.warehouse.address || "-");
  addInfoRow("T/G xuất:", order.stockExport ? formatDateVN(order.stockExport.transactionAt) : "-");
  addInfoRow("Ghi chú:", order.note || "-");
  sheet.addRow([]);

  const headerRow = sheet.addRow(TABLE_HEADER);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: "center" };
  });

  let totalQty = 0;
  for (const [index, item] of order.items.entries()) {
    const qty = Number(item.quantity);
    totalQty += qty;
    const row = sheet.addRow([
      index + 1,
      item.product.code,
      item.product.name,
      "-",
      0,
      item.product.unit?.name ?? "-",
      qty,
      0,
      0,
      "0%",
      0,
      0,
    ]);
    row.eachCell((cell) => (cell.border = THIN_BORDER));
  }

  const totalRow = sheet.addRow(["", "", "", "", "", "Tổng cộng", totalQty, 0, 0, "", 0, 0]);
  totalRow.font = { bold: true };
  sheet.addRow(["", "", "", "", "", "", "", "", "Chiết khấu giảm giá", "", "", 0]);
  sheet.addRow(["", "", "", "", "", "", "", "", "Tiền thuế GTGT", "", "", 0]);
  const grandTotalRow = sheet.addRow(["", "", "", "", "", "", "", "", "Tổng tiền", "", "", 0]);
  grandTotalRow.font = { bold: true };

  sheet.addRow([]);
  sheet.addRow(["Tổng tiền thanh toán bằng chữ: Không đồng"]);

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
