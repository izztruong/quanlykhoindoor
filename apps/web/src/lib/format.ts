export function formatNumber(value: number | string) {
  return new Intl.NumberFormat("vi-VN").format(Number(value));
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + "đ";
}

export function formatPercent(value: number | string) {
  return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(value) * 100) + "%";
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Fixed-width dd/MM/yyyy HH:mm, matching the printed-invoice template format. */
export function formatDateVN(value: string) {
  const d = new Date(value);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const transactionFormLabel: Record<string, string> = {
  CASH: "Tiền mặt",
  BANK_TRANSFER: "Chuyển khoản",
  DEBT: "Công nợ",
  OTHER: "Khác",
};

const transactionStatusLabel: Record<string, string> = {
  DRAFT: "Nháp",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

const stockImportTypeLabel: Record<string, string> = {
  PURCHASE: "Nhập mua",
  CUSTOMER_RETURN: "Khách trả hàng",
  TRANSFER_IN: "Chuyển kho đến",
  OTHER: "Khác",
};

const stockExportTypeLabel: Record<string, string> = {
  SALE: "Xuất bán",
  SUPPLIER_RETURN: "Trả nhà cung cấp",
  TRANSFER_OUT: "Chuyển kho đi",
  DAMAGE: "Xuất huỷ",
  OTHER: "Khác",
};

const salesOrderStatusLabel: Record<string, string> = {
  DRAFT: "Chưa xác nhận",
  PENDING_CONFIRM: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  SHORT: "Thiếu",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

const inventoryCountStatusLabel: Record<string, string> = {
  DRAFT: "Chưa kiểm",
  COMPLETED: "Đã kiểm",
  CANCELLED: "Đã huỷ",
};

const productTypeLabel: Record<string, string> = {
  NVL: "Nguyên vật liệu",
  COC_TAKE: "Cốc & ống hút",
  BANH: "Bánh",
  DUNG_CU: "Dụng cụ",
  KHAC: "Khác",
};

const finishedGoodCategoryLabel: Record<string, string> = {
  TRA: "Trà",
  DAV: "Đồ ăn vặt",
  THANH_PHAM: "Đồ thành phẩm",
};

export const labels = {
  transactionForm: (v: string) => transactionFormLabel[v] ?? v,
  transactionStatus: (v: string) => transactionStatusLabel[v] ?? v,
  stockImportType: (v: string) => stockImportTypeLabel[v] ?? v,
  stockExportType: (v: string) => stockExportTypeLabel[v] ?? v,
  salesOrderStatus: (v: string) => salesOrderStatusLabel[v] ?? v,
  inventoryCountStatus: (v: string) => inventoryCountStatusLabel[v] ?? v,
  productType: (v: string) => productTypeLabel[v] ?? v,
  finishedGoodCategory: (v: string) => finishedGoodCategoryLabel[v] ?? v,
};
