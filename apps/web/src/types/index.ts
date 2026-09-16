export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  /** Vai trò hệ thống — bỏ qua mọi kiểm tra quyền. */
  isSystem: boolean;
  /** Mã quyền dạng "RESOURCE.ACTION". Kiểm bằng `can()` trong lib/permissions.ts. */
  permissions: string[];
  /** "ALL" = dữ liệu mọi quán, "SELF" = chỉ dữ liệu của chính mình. */
  scope: "ALL" | "SELF";
}

export type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "RECEIVE" | "APPROVE";

export interface PermissionCatalog {
  resources: { resource: string; label: string; group: string; actions: PermissionAction[] }[];
  actionLabels: Record<PermissionAction, string>;
  scopeAll: { code: string; label: string };
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  /** Tài khoản thuộc vai trò này hiện trong các ô chọn/lọc quán. */
  isShop: boolean;
  permissions: string[];
  createdAt: string;
  _count: { users: number };
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string | null;
}

export interface ProductGroup {
  id: string;
  code: string;
  name: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
}

export type ProductType = "NVL" | "COC_TAKE" | "BANH" | "DUNG_CU" | "KHAC";

export interface Product {
  id: string;
  code: string;
  name: string;
  unitId: string;
  unit: Unit;
  productGroupId: string;
  productGroup: ProductGroup;
  costPrice: string | number;
  note?: string | null;
  recipeUnitId?: string | null;
  recipeUnit?: Unit | null;
  recipeUnitsPerBaseUnit?: string | number | null;
  type: ProductType;
  tareWeight?: string | number | null;
  active?: boolean;
}

export interface ReorderThreshold {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  minQuantity: string | number;
  maxQuantity: string | number;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

export interface ProductSupplierPrice {
  id: string;
  productId: string;
  product: Product;
  supplierId: string;
  supplier: Supplier;
  importPrice: string | number;
  exportPrice: string | number;
  /** Đơn vị gọi NCC (vd Thùng) khi khác đơn vị chính của hàng hoá — null nghĩa là gọi theo đơn vị chính. */
  purchaseUnitId?: string | null;
  purchaseUnit?: Unit | null;
  /** 1 đơn vị gọi = bao nhiêu đơn vị chính (vd 1 Thùng = 12 Hộp). */
  baseUnitsPerPurchaseUnit?: string | number | null;
  /** Số lượng đặt tối thiểu, tính theo đơn vị gọi. */
  minQuantity?: string | number | null;
  /** Thứ tự ưu tiên gọi NCC cho hàng hoá này: 1 = gọi trước. */
  priority?: number | null;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}

export type TransactionForm = "CASH" | "BANK_TRANSFER" | "DEBT" | "OTHER";
export type TransactionStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
export type StockImportType = "PURCHASE" | "CUSTOMER_RETURN" | "TRANSFER_IN" | "OTHER";
export type StockExportType = "SALE" | "SUPPLIER_RETURN" | "TRANSFER_OUT" | "DAMAGE" | "OTHER";

export interface StockHeader {
  id: string;
  code: string;
  type: string;
  transactionAt: string;
  form: TransactionForm;
  status: TransactionStatus;
  note?: string | null;
  warehouse: Warehouse;
  supplier?: Supplier | null;
  customer?: Customer | null;
}

export interface StockItem {
  id: string;
  productId: string;
  product: Product;
  quantity: string | number;
  costPrice: string | number;
  costAmount: string | number;
  note?: string | null;
  /** Export lines only — which supplier's price this line's costPrice came from. */
  supplierId?: string | null;
  supplier?: Supplier | null;
}

export interface StockTransaction extends StockHeader {
  items: StockItem[];
}

export type SalesOrderStatus = "DRAFT" | "PENDING_CONFIRM" | "CONFIRMED" | "SHORT" | "COMPLETED" | "CANCELLED";

export interface SalesOrderItem {
  id: string;
  productId: string;
  product: Product;
  quantity: string | number;
  received: boolean;
  receivedQuantity?: string | number | null;
  receivedAt?: string | null;
  note?: string | null;
}

export interface SalesOrder {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: Warehouse;
  orderDate: string;
  status: SalesOrderStatus;
  note?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
  items: SalesOrderItem[];
  stockExport?: StockTransaction | null;
  /** null = tạo trước khi có chức năng chấm hạn, hoặc chưa cấu hình lịch — hiện chấm xám. */
  dueAt?: string | null;
  isLate?: boolean;
}

/**
 * Một dòng trong bảng danh sách đơn hàng — CỐ TÌNH nhẹ hơn `SalesOrder`: không có `items` lẫn
 * `stockExport`, đổi lại có sẵn `totalQuantity` do server cộng trước. Tách kiểu riêng thay vì
 * nới lỏng `SalesOrder` để các trang chi tiết vẫn chắc chắn có đủ dữ liệu chúng cần.
 */
export interface SalesOrderListRow {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: Warehouse;
  orderDate: string;
  status: SalesOrderStatus;
  note?: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
  dueAt?: string | null;
  isLate?: boolean;
  totalQuantity: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface ReportDetailRow {
  stt: number;
  id: string;
  header: StockHeader;
  product: Product;
  productGroup: ProductGroup;
  unit: Unit;
  quantity: number;
  costPrice: number;
  costAmount: number;
  note?: string | null;
}

export interface ReportSummaryRow {
  stt: number;
  product: Product;
  productGroup: ProductGroup;
  unit: Unit;
  warehouse: Warehouse;
  quantity: number;
  costPrice: number;
  costAmount: number;
}

/** Một dòng của trang Tổng hợp đặt NCC — xem getPurchaseSummary ở apps/server. */
export interface PurchaseSummaryRow {
  stt: number;
  supplier: Supplier | null;
  product: { id: string; code: string; name: string };
  productGroup: ProductGroup;
  unit: Unit;
  purchaseUnit: Unit | null;
  baseUnitsPerPurchaseUnit: number | null;
  /** Tổng số lượng các quán gọi, theo đơn vị chính. */
  orderedBaseQty: number;
  minQuantity: number | null;
  /** Số lượng phải đặt NCC, theo đơn vị gọi nếu có khai, ngược lại theo đơn vị chính. */
  purchaseQty: number;
  /** purchaseQty quy ngược về đơn vị chính, để đối chiếu và tính tiền. */
  finalBaseQty: number;
  roundedUpToPack: boolean;
  raisedToMinimum: boolean;
  importPrice: number;
  amount: number;
}

export interface InventoryCountRow {
  stt: number;
  product: { id: string; code: string; name: string };
  productGroup: ProductGroup;
  unit: Unit;
  openingQty: number;
  importedQty: number;
  exportedQty: number;
  systemQty: number;
  actualQty: number;
  surplusQty: number;
  shortageQty: number;
}

export type InventoryCountStatus = "DRAFT" | "COMPLETED" | "CANCELLED";

export interface InventoryCountItemRow {
  id: string;
  productId: string;
  product: Product;
  actualQuantity: string | number;
  note?: string | null;
}

export interface InventoryCount {
  id: string;
  code: string;
  warehouseId: string;
  warehouse: Warehouse;
  countDate: string;
  status: InventoryCountStatus;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  items?: InventoryCountItemRow[];
}

export type FinishedGoodCategory = "TRA" | "DAV" | "THANH_PHAM";

export interface FinishedGoodItem {
  id: string;
  code: string;
  name: string;
  unitId: string;
  unit: Unit;
  category?: FinishedGoodCategory | null;
  sellingPrice?: string | number | null;
}

export interface StockCheckItemRow {
  id: string;
  productId: string;
  product: Product;
  wholeQuantity?: string | number | null;
  looseQuantity?: string | number | null;
  wholePrice?: string | number | null;
  loosePrice?: string | number | null;
  note?: string | null;
}

export interface StockCheckFinishedItemRow {
  id: string;
  finishedGoodItemId: string;
  finishedGoodItem: FinishedGoodItem;
  quantity: string | number;
  price?: string | number | null;
  note?: string | null;
}

export type StockCheckType = "WEEKLY" | "MONTHLY";

export interface StockCheck {
  id: string;
  code: string;
  createdAt: string;
  checkedAt: string;
  /** null với phiếu tạo trước khi có chức năng này. */
  type?: StockCheckType | null;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  items?: StockCheckItemRow[];
  finishedItems?: StockCheckFinishedItemRow[];
  dueAt?: string | null;
  isLate?: boolean;
}

export type DeadlineKind = "SALES_ORDER" | "STOCK_CHECK_WEEKLY" | "STOCK_CHECK_MONTHLY";

export interface Deadline {
  id: string;
  kind: DeadlineKind;
  /** Thứ phải nộp. 1 = Thứ 2 … 7 = Chủ nhật. Chỉ dùng cho phiếu kiểm tuần. */
  weekday: number | null;
  /** Thứ quy định đi kiểm — mốc mở kỳ. Cũng chỉ dùng cho phiếu kiểm tuần. */
  periodWeekday: number | null;
  graceDays: number;
  hour: number;
  minute: number;
}

export interface FinishedGoodRecipeItem {
  id: string;
  productId: string;
  product: Product;
  quantityPerUnit: string | number;
}

export interface MaterialWasteItemRow {
  id: string;
  productId: string;
  product: Product;
  wholeQuantity?: string | number | null;
  looseQuantity?: string | number | null;
  note?: string | null;
}

export interface MaterialWasteFinishedItemRow {
  id: string;
  finishedGoodItemId: string;
  finishedGoodItem: FinishedGoodItem;
  quantity: string | number;
  note?: string | null;
}

export interface MaterialWaste {
  id: string;
  code: string;
  note?: string | null;
  createdAt: string;
  wasteAt: string;
  createdBy?: { id: string; name: string } | null;
  items?: MaterialWasteItemRow[];
  finishedItems?: MaterialWasteFinishedItemRow[];
}

export interface CostCheckSoldItemRow {
  id: string;
  finishedGoodItemId: string;
  finishedGoodItem: FinishedGoodItem;
  quantitySold: string | number;
}

export interface CostCheckReportRow {
  productId: string;
  code: string;
  name: string;
  productType: ProductType;
  productGroupName: string;
  unitLabel: string;
  openingQty: number;
  receivedQty: number;
  transferOutQty: number;
  wastedQty: number;
  closingQty: number;
  actualUsed: number;
  theoretical: number;
  variance: number;
}

export interface CostCheckFinancialSummary {
  revenueTra: number;
  revenueDav: number;
  revenueTotal: number;
  discountTra: number;
  discountDav: number;
  discountTotal: number;
  netRevenueTra: number;
  netRevenueDav: number;
  netRevenueTotal: number;
  expectedNvlTra: number;
  expectedNvlTraPct: number;
  expectedDav: number;
  expectedDavPct: number;
  actualNvlTra: number;
  actualNvlTraPct: number;
  actualDav: number;
  actualDavPct: number;
  cupsStraws: number;
  cupsStrawsPct: number;
  actualCostTraValue: number;
  actualCostTraPct: number;
  actualCostTotalValue: number;
  actualCostTotalPct: number;
  wasteNvlValue: number;
  wasteNvlPct: number;
}

export type CostCheckStatus = "ACTIVE" | "CANCELLED";

export interface CostCheck {
  id: string;
  code: string;
  userId: string;
  user: { id: string; name: string };
  openingStockCheck: { id: string; code: string; checkedAt: string };
  closingStockCheck: { id: string; code: string; checkedAt: string };
  note?: string | null;
  discountTra?: string | number | null;
  discountDav?: string | number | null;
  status: CostCheckStatus;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  soldItems?: CostCheckSoldItemRow[];
  report?: CostCheckReportRow[];
  financialSummary?: CostCheckFinancialSummary;
}

export interface AffectedCostCheck {
  id: string;
  code: string;
}

export interface MaterialTransferItemRow {
  id: string;
  productId: string;
  product: Product;
  wholeQuantity?: string | number | null;
  looseQuantity?: string | number | null;
  supplierId?: string | null;
  supplier?: Supplier | null;
  costPrice?: string | number | null;
  note?: string | null;
}

export interface MaterialTransfer {
  id: string;
  code: string;
  fromUserId: string;
  fromUser: { id: string; name: string };
  toUserId: string;
  toUser: { id: string; name: string };
  transferAt: string;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  items?: MaterialTransferItemRow[];
}

/** NVL = nguyên vật liệu, OTHER = khoản chi khác (ship, sửa chữa…). */
export type ShiftExpenseType = "MATERIAL" | "OTHER";

/** Một dòng trong sổ "Chi chốt ca" của quán — bản ghi phẳng, không phải phiếu nhiều dòng. */
export interface ShiftExpense {
  id: string;
  /** Chỉ có ngày (cột DATE ở server), phần giờ trong chuỗi ISO không mang ý nghĩa. */
  spentAt: string;
  type: ShiftExpenseType;
  content: string;
  unit?: string | null;
  quantity: string | number;
  unitPrice: string | number;
  /** Thành tiền server tính và lưu, không phải client gửi lên. */
  amount: string | number;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
}

/** Ô "Huỷ hàng" ở trang chủ — tiền tính theo giá vốn hiện tại, không phải số chốt. */
export interface DashboardWasteSummary {
  value: number;
  slipCount: number;
  /** Số hàng hoá + đồ thành phẩm khác nhau bị huỷ. */
  itemCount: number;
  days: number;
}

/** Chi phí NVL của một tháng, cộng từ snapshot các phiếu Check Cost chốt kỳ trong tháng đó. */
export interface DashboardCostMonth {
  year: number;
  month: number;
  /** 0 = tháng không có phiếu Check Cost nào (không có số liệu), khác với chi phí bằng 0. */
  checkCount: number;
  cost: number;
  netRevenue: number;
  pct: number;
}

export interface DashboardCostSummary {
  year: number;
  months: DashboardCostMonth[];
  current: DashboardCostMonth;
  previousMonth: DashboardCostMonth;
  sameMonthLastYear: DashboardCostMonth;
}

export type ExpenseProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "ADVANCED" | "SPENT";

/** CREATOR = người lập phiếu tự chi, ACCOUNTANT = kế toán chi (có tạm ứng). */
export type ExpensePayer = "CREATOR" | "ACCOUNTANT";

export interface ExpenseProposalItem {
  id: string;
  sortOrder: number;
  content: string;
  unitPrice: string | number;
  unit?: string | null;
  quantity: string | number;
  /** Thành tiền server tính và lưu. */
  amount: string | number;
  note?: string | null;
}

type UserRef = { id: string; name: string } | null;

/** Phiếu đề xuất chi & tạm ứng. `items` và các người thao tác chỉ có ở API chi tiết. */
export interface ExpenseProposal {
  id: string;
  code: string;
  status: ExpenseProposalStatus;
  /** Chỉ có ngày (cột DATE), đọc bằng formatDateOnly. */
  proposalDate: string;
  payer: ExpensePayer;
  /** Quán chi. Null ở phiếu cũ lưu tên quán dạng chữ không khớp tài khoản nào. */
  shopId: string | null;
  shop?: UserRef;
  /** Người được đề nghị xác nhận (tài khoản không phải quán). Chỉ ghi nhận, không quyết định ai bấm Duyệt. */
  approverId: string | null;
  approver?: UserRef;
  purpose: string;
  totalAmount: string | number;
  /** Ba trường tạm ứng chỉ có khi payer = ACCOUNTANT. */
  advancePercent?: string | number | null;
  advanceAmount?: string | number | null;
  invoiceDueDate?: string | null;
  rejectReason?: string | null;
  createdBy?: UserRef;
  approvedBy?: UserRef;
  approvedAt?: string | null;
  advancedBy?: UserRef;
  advancedAt?: string | null;
  spentBy?: UserRef;
  spentAt?: string | null;
  createdAt: string;
  items?: ExpenseProposalItem[];
}
