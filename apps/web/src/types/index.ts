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

export type SalesOrderStatus = "DRAFT" | "CONFIRMED" | "SHORT" | "COMPLETED" | "CANCELLED";

export interface SalesOrderItem {
  id: string;
  productId: string;
  product: Product;
  quantity: string | number;
  received: boolean;
  receivedQuantity?: string | number | null;
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

export interface FinishedGoodItem {
  id: string;
  code: string;
  name: string;
  unitId: string;
  unit: Unit;
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
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  items?: StockCheckItemRow[];
  finishedItems?: StockCheckFinishedItemRow[];
}
