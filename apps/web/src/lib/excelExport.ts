import ExcelJS from "exceljs";

export interface ExcelColumn<T> {
  header: string;
  value: (row: T, index: number) => string | number;
  width?: number;
}

/** Excel/Sheets treats a cell starting with =, +, -, or @ as a formula — prefix it with a
 * literal quote so free-text values (hàng hoá name, ghi chú...) can never execute as one. */
export function sanitizeExcelCell<T extends string | number | null | undefined>(value: T): T | string {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

export function sanitizeExcelRow(values: (string | number | null | undefined)[]): (string | number | null | undefined)[] {
  return values.map(sanitizeExcelCell);
}

export async function exportRowsToExcel<T>(sheetName: string, columns: ExcelColumn<T>[], rows: T[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row, index) => sheet.addRow(sanitizeExcelRow(columns.map((c) => c.value(row, index)))));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface SheetSpec {
  name: string;
  header: string[];
  /** Độ rộng từng cột, thiếu thì dùng 20. */
  widths?: number[];
  rows: (string | number | null | undefined)[][];
}

/**
 * Ghi workbook NHIỀU sheet. `exportRowsToExcel` ở trên chỉ ghi được một sheet, mà file của phiếu nhập
 * kho và phiếu điều chuyển cần hai sheet nối nhau bằng "Mã phiếu tạm".
 *
 * Mọi ô đi qua `sanitizeExcelRow` — tên hàng hoá hay ghi chú bắt đầu bằng `-` hoặc `=` sẽ thành công
 * thức Excel nếu không chặn.
 */
export async function writeWorkbook(sheets: SheetSpec[], filename: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name);
    sheet.columns = spec.header.map((header, index) => ({ header, width: spec.widths?.[index] ?? 20 }));
    sheet.getRow(1).font = { bold: true };
    for (const row of spec.rows) sheet.addRow(sanitizeExcelRow(row));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
