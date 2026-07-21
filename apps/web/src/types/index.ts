export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF";
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
  note?: string | null;
}

export interface StockCheckFinishedItemRow {
  id: string;
  finishedGoodItemId: string;
  finishedGoodItem: FinishedGoodItem;
  quantity: string | number;
  note?: string | null;
}

export interface StockCheck {
  id: string;
  code: string;
  createdAt: string;
  checkedAt: string;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  items?: StockCheckItemRow[];
  finishedItems?: StockCheckFinishedItemRow[];
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
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  soldItems?: CostCheckSoldItemRow[];
  report?: CostCheckReportRow[];
  financialSummary?: CostCheckFinancialSummary;
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
