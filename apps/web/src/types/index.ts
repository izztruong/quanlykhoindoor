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

export type PermissionAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "RECEIVE" | "APPROVE" | "ADVANCE" | "COMPLETE";

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
  // Số ngày còn dùng được sau khi quán nhận hàng — dùng để kẹp số ngày cần phủ khi gợi ý đặt hàng.
  shelfLifeDays?: number | null;
  // Số ngày từ lúc đặt tới lúc quán nhận được hàng. Khác nhau theo hàng hoá (cà phê 4–5, bột 1–2).
  // Với hàng CENTRAL còn là ngưỡng kích hoạt: gọi khi tồn toàn chuỗi còn đủ dùng dưới leadDays ngày.
  leadDays?: number | null;
  // Nhịp gọi. Null = tự suy từ công nợ của NCC ưu tiên (có nợ → gọi 15 & 30, không → theo coverDays).
  orderCadence?: OrderCadence | null;
  // Số ngày cần phủ mặc định của hàng hoá này, dùng chung mọi quán (hoa quả để 1).
  coverDays?: number | null;
}

export type OrderCadence = "CREDIT_TWICE_MONTHLY" | "BY_COVER_DAYS" | "CENTRAL";

export const ORDER_CADENCE_LABELS: Record<OrderCadence, string> = {
  CREDIT_TWICE_MONTHLY: "Có công nợ — gọi ngày 15 và 30",
  BY_COVER_DAYS: "Trả ngay — gọi theo số ngày phủ",
  CENTRAL: "Mua tập trung — admin đặt, quán không gọi",
};

export type ReorderMode = "THRESHOLD" | "FIXED" | "COVERAGE" | "OFF";

export const REORDER_MODE_LABELS: Record<ReorderMode, string> = {
  THRESHOLD: "Theo tối thiểu / tối đa",
  FIXED: "Gọi cố định",
  COVERAGE: "Đủ dùng N ngày",
  OFF: "Không đề xuất",
};

export interface ReorderThreshold {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  mode: ReorderMode;
  // Nullable theo chế độ: min/max cho THRESHOLD, fixedQuantity cho FIXED, coverDays cho COVERAGE.
  // Đổi chế độ không xoá con số của chế độ cũ nên các cột không dùng vẫn có thể có giá trị.
  minQuantity: string | number | null;
  maxQuantity: string | number | null;
  fixedQuantity: string | number | null;
  coverDays: number | null;
}

export type DailyUsageSource = "COST_CHECK" | "RECEIVED" | "NONE";

export const USAGE_SOURCE_LABELS: Record<DailyUsageSource, string> = {
  COST_CHECK: "Từ Check Cost",
  RECEIVED: "Từ lịch sử nhận",
  NONE: "Chưa có dữ liệu",
};

/** Tiền hàng KHÔNG công nợ của một quán tới một NCC, so với ngưỡng miễn ship. */
export interface ConsolidationShopAmount {
  userId: string;
  userName: string;
  amount: number;
  orderCodes: string[];
  reachesThreshold: boolean;
  shortfall: number;
}

/** Một NCC trên màn Gom đơn & miễn ship — xem getOrderConsolidationReport ở apps/server. */
export interface SupplierConsolidation {
  supplierId: string;
  supplierName: string;
  freeShipThreshold: number | null;
  shops: ConsolidationShopAmount[];
  totalAmount: number;
  shopsReaching: number;
  shouldConsolidate: boolean;
  consolidateIntoUserId: string | null;
  consolidateIntoUserName: string | null;
  shipmentsSaved: number;
  reasons: string[];
}

export interface OrderConsolidationReport {
  /** 1 = Thứ 2 … 7 = Chủ nhật. Ngày chuyển hàng miễn phí gần nhất. */
  nextTransferWeekday: number;
  nextTransferDaysAway: number;
  suppliers: SupplierConsolidation[];
}

/** Tồn một quán khai cho hàng mua tập trung, kèm số đó cũ bao nhiêu ngày. */
export interface ShopStock {
  userId: string;
  userName: string;
  quantity: number;
  declaredAt: string | null;
  source: "REORDER_RUN" | "STOCK_CHECK" | "NONE";
  ageDays: number | null;
}

/** Một dòng hàng mua tập trung (cốc giấy…): tồn toàn chuỗi so với ngưỡng gọi. */
export interface CentralPurchasingRow {
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  productGroupName: string;
  /** Số ngày chờ hàng, cũng là ngưỡng gọi. Null = chưa khai, không kết luận được. */
  leadDays: number | null;
  warehouseQty: number;
  shopQty: number;
  chainQty: number;
  shopStocks: ShopStock[];
  dailyUsage: number | null;
  coverDays: number | null;
  needsOrder: boolean;
  prioritySupplierName: string | null;
  purchaseUnitName: string | null;
  baseUnitsPerPurchaseUnit: number | null;
  minQuantity: number | null;
  purchaseQty: number;
  finalBaseQty: number;
  oldestShopStockAgeDays: number | null;
  shopsWithoutStock: number;
  reasons: string[];
}

/** Một dòng gợi ý đặt hàng do server tính. `reasons` là lời giải thích để người duyệt tin được con số. */
export interface ReorderSuggestion {
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  productGroupName: string;
  active: boolean;
  mode: ReorderMode;
  minQuantity: number | null;
  maxQuantity: number | null;
  fixedQuantity: number | null;
  coverDays: number | null;
  shelfLifeDays: number | null;
  leadDays: number | null;
  /** Hàng đã đặt chưa nhận. Chế độ COVERAGE đã trừ khỏi `suggestedQty`; hai chế độ kia chỉ hiện để biết. */
  inTransitQty: number;
  onHandQty: number | null;
  dailyUsage: number | null;
  usageSource: DailyUsageSource;
  suggestedQty: number;
  reasons: string[];
}

export type ShiftCode = "CA1" | "CA2" | "CA3";

export type PrepMode = "TARGET_LEVEL" | "FORECAST" | "OFF";

export const PREP_MODE_LABELS: Record<PrepMode, string> = {
  TARGET_LEVEL: "Theo mức mục tiêu",
  FORECAST: "Theo dự báo",
  OFF: "Không đề xuất",
};

/** Nguồn dự báo — người dùng phải thấy con số dựa trên bao nhiêu quan sát và ở mức nào. */
export type ForecastSource = "WEEKDAY_SHIFT" | "SHIFT_ONLY" | "NONE";

export const FORECAST_SOURCE_LABELS: Record<ForecastSource, string> = {
  WEEKDAY_SHIFT: "Cùng thứ, cùng ca",
  SHIFT_ONLY: "Cùng ca, gộp mọi thứ",
  NONE: "Chưa có dữ liệu",
};

/** Tồn đầu ca lấy từ đâu. Số ước tính trông y hệt số thật, nên luôn hiện nguồn kèm con số. */
export type OnHandSource = "MANUAL" | "PREV_SHIFT_COUNT" | "ESTIMATED" | "RESET_OVERNIGHT" | "NONE";

export const ON_HAND_SOURCE_LABELS: Record<OnHandSource, string> = {
  MANUAL: "Bạn gõ tay",
  PREV_SHIFT_COUNT: "Đếm cuối ca trước",
  ESTIMATED: "ƯỚC TÍNH (ca trước không đếm)",
  RESET_OVERNIGHT: "Về 0 vì quá hạn dùng",
  NONE: "Chưa có số nào",
};

export interface ShiftPrepSuggestion {
  finishedGoodItemId: string;
  code: string;
  name: string;
  unitLabel: string;
  mode: PrepMode;
  batchSize: number | null;
  shelfLifeHours: number | null;
  targetLevel: number | null;
  onHandQty: number;
  onHandSource: OnHandSource;
  uncountedShifts: number;
  demandQty: number;
  forecastSource: ForecastSource | null;
  coversShifts: ShiftCode[];
  expiresAt: string | null;
  suggestedQty: number;
  suggestedBatches: number;
  reasons: string[];
}

export interface ShiftPrepPreview {
  businessDate: string;
  shift: ShiftCode;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  items: ShiftPrepSuggestion[];
  previousShift: { businessDate: string; shift: ShiftCode } | null;
  previousShiftCounted: boolean;
}

/** Hao hụt một ca đã xong. null = thiếu số đếm ở một đầu, KHÔNG suy bừa. */
export interface ShiftVarianceRow {
  finishedGoodItemId: string;
  code: string;
  name: string;
  unitLabel: string;
  openingQty: number | null;
  preparedQty: number;
  soldQty: number;
  closingQty: number | null;
  varianceQty: number | null;
  note: string;
}

export interface ShiftStockCountRecord {
  id: string;
  businessDate: string;
  shift: ShiftCode;
  countedAt: string;
  note?: string | null;
  createdBy?: { id: string; name: string } | null;
  items: { finishedGoodItemId: string; quantity: string | number }[];
}

export interface ShiftPrepTarget {
  id: string;
  userId: string;
  finishedGoodItemId: string;
  finishedGoodItem?: FinishedGoodItem;
  shift: ShiftCode;
  mode: PrepMode;
  targetLevel?: string | number | null;
}

export interface SalesDayFactor {
  id: string;
  date: string;
  factor: string | number;
  note?: string | null;
}

/** Tồn nguyên liệu ước tính — dùng để ĐIỀN SẴN cột tồn ở Order nhanh, không phải số đã khai. */
export interface EstimatedStockRow {
  productId: string;
  quantity: number;
  anchorAt: string | null;
  anchorQty: number | null;
  anchorSource: "REORDER_RUN" | "STOCK_CHECK" | "NONE";
  anchorAgeDays: number | null;
  receivedQty: number;
  soldQty: number;
  wasteQty: number;
  transferQty: number;
  wasteFilledQty: number;
  daysWithoutWaste: number;
  reasons: string[];
}

export interface ShiftDefinition {
  id: string;
  code: ShiftCode;
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

export interface PosSaleDay {
  userId: string;
  user: { id: string; name: string } | null;
  soldOn: string;
  totalQuantity: number;
  cellCount: number;
}

export interface PosItemMapping {
  id: string;
  posName: string;
  posNameRaw: string;
  // null = cố ý bỏ qua tên này (phí ship, voucher…), khác hẳn "chưa ánh xạ" là chưa có dòng nào.
  finishedGoodItemId: string | null;
  finishedGoodItem: { id: string; code: string; name: string } | null;
}

export interface PosMappingSuggestion {
  posNameRaw: string;
  suggestions: { finishedGoodItemId: string; code: string; name: string; score: number }[];
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  /** Đơn từ ngưỡng này trở lên thì NCC miễn ship. Null = không có chính sách đó. Ship tính theo TỪNG QUÁN. */
  freeShipThreshold?: string | number | null;
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
  /** Số lượng đặt tối thiểu, tính theo đơn vị gọi. Với hàng mua tập trung đây chính là MOQ. */
  minQuantity?: string | number | null;
  /** Thứ tự ưu tiên gọi NCC cho hàng hoá này: 1 = gọi trước. */
  priority?: number | null;
  /** NCC này có cho công nợ với mặt hàng này không — quyết định nhịp gọi ở phần gợi ý đặt hàng. */
  hasCredit?: boolean;
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
  /** Số ảnh chứng từ đã đính (chỉ đính được khi đơn COMPLETED). URL ảnh tải riêng khi mở. */
  imageCount: number;
}

export interface SalesOrderItemImage {
  id: string;
  url: string;
  contentType: string;
  size: number;
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
  /** NCC đã chọn có cho công nợ mặt hàng này không. */
  hasCredit: boolean;
  /** True = đã bỏ qua NCC rẻ hơn để lấy công nợ (chênh dưới 3%). */
  chosenForCredit: boolean;
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
  /** Món phải pha trước mỗi ca — chỉ món này vào màn Chuẩn bị ca và danh sách đếm cuối ca. */
  prepared?: boolean;
  /** Một mẻ ra bao nhiêu đơn vị. Số mẻ đề xuất luôn làm tròn LÊN theo số này. */
  batchSize?: string | number | null;
  /** Pha xong dùng được mấy GIỜ — quyết định một mẻ phủ mấy ca và có giữ được qua đêm không. */
  shelfLifeHours?: number | null;
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
  /** Mốc hệ thống đóng dấu lúc tạo bản ghi = "ngày lập phiếu". Khác spentAt (ngày quán khai đã
   *  chi tiền) và là DateTime thật, nên hiển thị phải qua formatDateTime — formatDateOnly đọc
   *  theo getUTC* sẽ lùi một ngày với khoản ghi sau 17h giờ VN. */
  createdAt: string;
  /** Mốc đánh dấu "đã chi". null = chưa chi. Cũng là DateTime thật, cùng lưu ý múi giờ như
   *  createdAt. Khác null thì quán hết sửa/xoá được khoản này. */
  paidAt?: string | null;
  paidBy?: { id: string; name: string } | null;
  /** Số ảnh chứng từ đã đính. Danh sách chỉ đếm; URL xem ảnh lấy riêng qua GET /:id/images. */
  imageCount?: number;
}

/** Ảnh chứng từ kèm URL đã ký, sống 1 giờ kể từ lúc gọi API. */
export interface ShiftExpenseImage {
  id: string;
  url: string;
  contentType: string;
  size: number;
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

/** SPENT hiển thị là "Hoàn thành". REAPPROVAL = bảng hạng mục dự kiến mới đang chờ duyệt bổ sung. */
export type ExpenseProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "ADVANCED" | "REAPPROVAL" | "SPENT";

/** CREATOR = người lập phiếu chi (phiếu mới có tạm ứng), ACCOUNTANT = kế toán chi. */
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

/** Một lần tạm ứng — người lập chi có thể được ứng nhiều lần. */
export interface ExpenseProposalAdvance {
  id: string;
  amount: string | number;
  note?: string | null;
  createdBy?: UserRef;
  createdAt: string;
}

/** Dòng trong pendingItems (bảng dự kiến chờ duyệt bổ sung) — cùng dạng hạng mục nhưng chưa có id. */
export type ExpenseProposalPendingItem = Omit<ExpenseProposalItem, "id">;

export interface ExpenseProposalImage {
  id: string;
  url: string;
  contentType: string;
  size: number;
}

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
  /** Người duyệt (tài khoản không phải quán). Chỉ người này hoặc vai trò hệ thống mới duyệt/từ chối được. */
  approverId: string | null;
  approver?: UserRef;
  purpose: string;
  /** Tổng dự kiến đã duyệt. */
  totalAmount: string | number;
  /** Số tiền ĐỀ NGHỊ tạm ứng lần đầu (chỉ người lập chi). Tiền ứng thật nằm ở `advances`. */
  advanceAmount?: string | number | null;
  /** Ngày trả hoá đơn dự kiến (cột DATE). */
  invoiceDueDate?: string | null;
  /** Ngày nộp hoá đơn thực tế, khai lúc Hoàn thành (cột DATE). */
  invoiceDate?: string | null;
  /** Tổng thực chi, có khi đã Hoàn thành. */
  spentAmount?: string | number | null;
  /** Bảng dự kiến mới đang chờ duyệt bổ sung (status = REAPPROVAL). */
  pendingItems?: ExpenseProposalPendingItem[] | null;
  pendingTotal?: string | number | null;
  revisionRejectReason?: string | null;
  revisionDecidedBy?: UserRef;
  revisionDecidedAt?: string | null;
  rejectReason?: string | null;
  createdBy?: UserRef;
  approvedBy?: UserRef;
  approvedAt?: string | null;
  spentBy?: UserRef;
  spentAt?: string | null;
  createdAt: string;
  items?: ExpenseProposalItem[];
  advances?: ExpenseProposalAdvance[];
  /** Hạng mục thực chi, khai lúc Hoàn thành. */
  spentItems?: ExpenseProposalItem[];
  _count?: { images: number };
}
