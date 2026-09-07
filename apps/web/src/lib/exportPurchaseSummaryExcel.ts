import { sanitizeExcelRow } from "@/lib/excelExport";
import type { PurchaseSummaryRow } from "@/types";
import ExcelJS from "exceljs";

const TABLE_HEADER = ["Tên hàng hoá", "Đơn vị gọi", "Số lượng đặt", "Quy ra đơn vị chính"];

const THIN_BORDER = {
  top: { style: "thin" as const },
  bottom: { style: "thin" as const },
  left: { style: "thin" as const },
  right: { style: "thin" as const },
};

/** Excel không cho phép : \ / ? * [ ] trong tên sheet, và giới hạn 31 ký tự. */
function safeSheetName(name: string, taken: Set<string>) {
  const base = (name.replace(/[:\/?*[\]]/g, "-").trim() || "NCC").slice(0, 31);
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    const tail = ` (${suffix++})`;
    candidate = base.slice(0, 31 - tail.length) + tail;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Mỗi NCC một sheet, để gửi thẳng cho từng NCC mà không phải lọc tay.
 *
 * Cùng tinh thần với exportOrderToExcel: đây là danh sách hàng để đặt, không phải bảng giá —
 * nên cố tình không có cột đơn giá/thành tiền. Số lượng lấy theo ĐƠN VỊ GỌI của NCC (vd Thùng),
 * kèm cột quy ra đơn vị chính để đối chiếu khi nhận hàng.
 */
export async function exportPurchaseSummaryToExcel(rows: PurchaseSummaryRow[], fileName: string) {
  const workbook = new ExcelJS.Workbook();

  const bySupplier = new Map<string, PurchaseSummaryRow[]>();
  for (const row of rows) {
    const key = row.supplier?.name ?? "Chưa có NCC";
    const list = bySupplier.get(key) ?? [];
    list.push(row);
    bySupplier.set(key, list);
  }

  const taken = new Set<string>();
  for (const [supplierName, supplierRows] of bySupplier) {
    const sheet = workbook.addWorksheet(safeSheetName(supplierName, taken));
    sheet.columns = [{ width: 36 }, { width: 14 }, { width: 14 }, { width: 22 }];

    const headerRow = sheet.addRow(TABLE_HEADER);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: "center" };
    });

    for (const row of supplierRows) {
      const purchaseUnitName = row.purchaseUnit?.name ?? row.unit?.name ?? "-";
      const baseUnitName = row.unit?.name ?? "-";
      const sheetRow = sheet.addRow(
        sanitizeExcelRow([row.product.name, purchaseUnitName, row.purchaseQty, `${row.finalBaseQty} ${baseUnitName}`]),
      );
      sheetRow.eachCell((cell) => (cell.border = THIN_BORDER));
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
