import { Badge } from "@/components/ui/Badge";
import type { ExcelColumn } from "@/lib/excelExport";
import { formatCurrency, formatDateTime, formatNumber, labels } from "@/lib/format";
import type { InventoryCountRow, ReportDetailRow, ReportSummaryRow } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

export const inventoryCountColumns: ColumnDef<InventoryCountRow>[] = [
  { header: "STT", accessorKey: "stt" },
  { header: "Hàng hoá", accessorFn: (row) => row.product.name, id: "productName" },
  { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
  { header: "Đơn vị tính", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Tồn đầu kỳ", accessorFn: (row) => formatNumber(row.openingQty), id: "openingQty" },
  {
    header: "Trong kỳ",
    columns: [
      { header: "Nhập", accessorFn: (row) => formatNumber(row.importedQty), id: "importedQty" },
      { header: "Xuất", accessorFn: (row) => formatNumber(row.exportedQty), id: "exportedQty" },
    ],
  },
  {
    header: "Số lượng tồn",
    columns: [
      { header: "Hệ thống", accessorFn: (row) => formatNumber(row.systemQty), id: "systemQty" },
      { header: "Thực", accessorFn: (row) => formatNumber(row.actualQty), id: "actualQty" },
    ],
  },
  {
    header: "Chênh lệch kiểm kê",
    columns: [
      { header: "Thừa", accessorFn: (row) => formatNumber(row.surplusQty), id: "surplusQty" },
      { header: "Thiếu", accessorFn: (row) => formatNumber(row.shortageQty), id: "shortageQty" },
    ],
  },
];

export const summaryColumns = (warehouseColumnLabel: string): ColumnDef<ReportSummaryRow>[] => [
  { header: "STT", accessorKey: "stt" },
  { header: "Hàng hoá", accessorFn: (row) => row.product.name, id: "productName" },
  { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
  { header: warehouseColumnLabel, accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
  { header: "Đơn vị tính", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Số lượng", accessorFn: (row) => formatNumber(row.quantity), id: "quantity" },
  { header: "Giá vốn", accessorFn: (row) => formatCurrency(row.costPrice), id: "costPrice" },
  { header: "Tiền vốn", accessorFn: (row) => formatCurrency(row.costAmount), id: "costAmount" },
];

export const detailColumns = (
  warehouseColumnLabel: string,
  typeLabel: (v: string) => string,
): ColumnDef<ReportDetailRow>[] => [
  { header: "STT", accessorKey: "stt" },
  { header: "Mã", accessorFn: (row) => row.header.code, id: "code" },
  { header: "Loại", accessorFn: (row) => typeLabel(row.header.type), id: "type" },
  {
    header: "Thời gian",
    accessorFn: (row) => formatDateTime(row.header.transactionAt),
    id: "transactionAt",
  },
  { header: "Hình thức", accessorFn: (row) => labels.transactionForm(row.header.form), id: "form" },
  {
    header: "Trạng thái",
    id: "status",
    cell: ({ row }) => {
      const status = row.original.header.status;
      const tone = status === "COMPLETED" ? "green" : status === "CANCELLED" ? "red" : "gray";
      return <Badge tone={tone}>{labels.transactionStatus(status)}</Badge>;
    },
  },
  { header: "Ghi chú", accessorFn: (row) => row.header.note ?? "-", id: "headerNote" },
  { header: warehouseColumnLabel, accessorFn: (row) => row.header.warehouse?.name, id: "warehouse" },
  { header: "Nhà cung cấp", accessorFn: (row) => row.header.supplier?.name ?? "-", id: "supplier" },
  { header: "Khách hàng", accessorFn: (row) => row.header.customer?.name ?? "-", id: "customer" },
  { header: "Mã hàng hoá", accessorFn: (row) => row.product.code, id: "productCode" },
  { header: "Tên hàng hoá", accessorFn: (row) => row.product.name, id: "productName" },
  { header: "Ghi chú hàng hoá", accessorFn: (row) => row.note ?? "-", id: "itemNote" },
  { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
  { header: "Đơn vị", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Số lượng", accessorFn: (row) => formatNumber(row.quantity), id: "quantity" },
  { header: "Giá vốn", accessorFn: (row) => formatCurrency(row.costPrice), id: "costPrice" },
  { header: "Tiền vốn", accessorFn: (row) => formatCurrency(row.costAmount), id: "costAmount" },
];

// Plain-value column specs for Excel export — kept separate from the on-screen
// ColumnDef arrays above since those can hold JSX cell renderers (badges,
// links) that don't translate to spreadsheet cells.

export const inventoryCountExcelColumns: ExcelColumn<InventoryCountRow>[] = [
  { header: "STT", value: (row) => row.stt, width: 6 },
  { header: "Hàng hoá", value: (row) => row.product.name },
  { header: "Nhóm hàng hoá", value: (row) => row.productGroup?.name ?? "-" },
  { header: "Đơn vị tính", value: (row) => row.unit?.name ?? "-" },
  { header: "Tồn đầu kỳ", value: (row) => row.openingQty },
  { header: "Nhập trong kỳ", value: (row) => row.importedQty },
  { header: "Xuất trong kỳ", value: (row) => row.exportedQty },
  { header: "Tồn hệ thống", value: (row) => row.systemQty },
  { header: "Tồn thực", value: (row) => row.actualQty },
  { header: "Thừa", value: (row) => row.surplusQty },
  { header: "Thiếu", value: (row) => row.shortageQty },
];

export const summaryExcelColumns = (warehouseColumnLabel: string): ExcelColumn<ReportSummaryRow>[] => [
  { header: "STT", value: (row) => row.stt, width: 6 },
  { header: "Hàng hoá", value: (row) => row.product.name },
  { header: "Nhóm hàng hoá", value: (row) => row.productGroup?.name ?? "-" },
  { header: warehouseColumnLabel, value: (row) => row.warehouse?.name ?? "-" },
  { header: "Đơn vị tính", value: (row) => row.unit?.name ?? "-" },
  { header: "Số lượng", value: (row) => Number(row.quantity) },
  { header: "Giá vốn", value: (row) => Number(row.costPrice) },
  { header: "Tiền vốn", value: (row) => Number(row.costAmount) },
];

export const detailExcelColumns = (
  warehouseColumnLabel: string,
  typeLabel: (v: string) => string,
): ExcelColumn<ReportDetailRow>[] => [
  { header: "STT", value: (row) => row.stt, width: 6 },
  { header: "Mã", value: (row) => row.header.code },
  { header: "Loại", value: (row) => typeLabel(row.header.type) },
  { header: "Thời gian", value: (row) => formatDateTime(row.header.transactionAt) },
  { header: "Hình thức", value: (row) => labels.transactionForm(row.header.form) },
  { header: "Trạng thái", value: (row) => labels.transactionStatus(row.header.status) },
  { header: "Ghi chú", value: (row) => row.header.note ?? "-" },
  { header: warehouseColumnLabel, value: (row) => row.header.warehouse?.name ?? "-" },
  { header: "Nhà cung cấp", value: (row) => row.header.supplier?.name ?? "-" },
  { header: "Khách hàng", value: (row) => row.header.customer?.name ?? "-" },
  { header: "Mã hàng hoá", value: (row) => row.product.code },
  { header: "Tên hàng hoá", value: (row) => row.product.name },
  { header: "Ghi chú hàng hoá", value: (row) => row.note ?? "-" },
  { header: "Nhóm hàng hoá", value: (row) => row.productGroup?.name ?? "-" },
  { header: "Đơn vị", value: (row) => row.unit?.name ?? "-" },
  { header: "Số lượng", value: (row) => Number(row.quantity) },
  { header: "Giá vốn", value: (row) => Number(row.costPrice) },
  { header: "Tiền vốn", value: (row) => Number(row.costAmount) },
];
