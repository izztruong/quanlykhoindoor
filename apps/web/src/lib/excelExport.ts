import ExcelJS from "exceljs";

export interface ExcelColumn<T> {
  header: string;
  value: (row: T, index: number) => string | number;
  width?: number;
}

export async function exportRowsToExcel<T>(sheetName: string, columns: ExcelColumn<T>[], rows: T[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row, index) => sheet.addRow(columns.map((c) => c.value(row, index))));

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
