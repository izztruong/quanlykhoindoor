import type { LucideIcon } from "lucide-react";
import { Boxes, ClipboardCheck, ClipboardList, ShieldCheck, ShoppingCart, Warehouse } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  /**
   * Mã quyền "RESOURCE.ACTION" cần để thấy mục này. Cũng dùng để chặn trang: app/(app)/layout.tsx
   * lấy mục có href là tiền tố dài nhất của đường dẫn hiện tại rồi kiểm mã này.
   */
  permission: string;
}

export interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: "Kiểm toán",
    icon: ClipboardCheck,
    items: [
      { label: "Kiểm kê", href: "/audit/inventory-count", permission: "AUDIT_REPORTS.VIEW" },
      { label: "Chi tiết xuất", href: "/audit/export-detail", permission: "AUDIT_REPORTS.VIEW" },
      { label: "Tổng hợp xuất", href: "/audit/export-summary", permission: "AUDIT_REPORTS.VIEW" },
      { label: "Chi tiết nhập", href: "/audit/import-detail", permission: "AUDIT_REPORTS.VIEW" },
      { label: "Tổng hợp nhập", href: "/audit/import-summary", permission: "AUDIT_REPORTS.VIEW" },
    ],
  },
  {
    label: "Order",
    icon: ShoppingCart,
    items: [
      { label: "Danh sách đơn hàng", href: "/orders", permission: "ORDERS.VIEW" },
      { label: "Tạo đơn hàng", href: "/orders/new", permission: "ORDERS.ADD" },
      { label: "Order nhanh", href: "/orders/quick", permission: "ORDERS.ADD" },
    ],
  },
  {
    label: "Kho",
    icon: Warehouse,
    items: [
      { label: "Phiếu nhập kho", href: "/stock/imports", permission: "STOCK_IMPORTS.VIEW" },
      { label: "Phiếu xuất kho", href: "/stock/exports", permission: "STOCK_EXPORTS.VIEW" },
      { label: "Phiếu kiểm kê", href: "/stock/inventory-counts", permission: "INVENTORY_COUNTS.VIEW" },
      { label: "Phiếu Check Cost", href: "/cost-checks", permission: "COST_CHECKS.VIEW" },
      { label: "Phiếu điều chuyển", href: "/material-transfers", permission: "MATERIAL_TRANSFERS.VIEW" },
    ],
  },
  {
    label: "Kiểm kê quán",
    icon: ClipboardList,
    items: [
      { label: "Phiếu kiểm kê", href: "/stock-checks", permission: "STOCK_CHECKS.VIEW" },
      { label: "Phiếu huỷ nguyên liệu", href: "/material-waste", permission: "MATERIAL_WASTE.VIEW" },
      { label: "Chi chốt ca", href: "/shift-expenses", permission: "SHIFT_EXPENSES.VIEW" },
    ],
  },
  {
    label: "Danh mục",
    icon: Boxes,
    items: [
      { label: "Hàng hoá", href: "/catalog/products", permission: "PRODUCTS.VIEW" },
      { label: "Nhóm hàng hoá", href: "/catalog/product-groups", permission: "PRODUCT_GROUPS.VIEW" },
      { label: "Đơn vị tính", href: "/catalog/units", permission: "UNITS.VIEW" },
      { label: "Kho hàng", href: "/catalog/warehouses", permission: "WAREHOUSES.VIEW" },
      { label: "Nhà cung cấp", href: "/catalog/suppliers", permission: "SUPPLIERS.VIEW" },
      { label: "Khách hàng", href: "/catalog/customers", permission: "CUSTOMERS.VIEW" },
      { label: "Đồ thành phẩm", href: "/catalog/finished-goods", permission: "FINISHED_GOODS.VIEW" },
    ],
  },
  {
    label: "Quản trị",
    icon: ShieldCheck,
    items: [
      { label: "Tài khoản người dùng", href: "/admin/users", permission: "USERS.VIEW" },
      { label: "Vai trò & phân quyền", href: "/admin/roles", permission: "ROLES.VIEW" },
      { label: "Định lượng Order nhanh", href: "/admin/reorder-thresholds", permission: "REORDER_THRESHOLDS.VIEW" },
      { label: "Giá theo Nhà cung cấp", href: "/admin/product-supplier-prices", permission: "SUPPLIER_PRICES.VIEW" },
      { label: "Tổng hợp đặt NCC", href: "/admin/purchase-summary", permission: "PURCHASE_SUMMARY.VIEW" },
      { label: "Hạn order & kiểm kê", href: "/admin/deadlines", permission: "DEADLINES.VIEW" },
    ],
  },
];

/**
 * Các trang con mà quyền khác trang cha trong menu (vd /stock/imports/new cần ADD chứ không chỉ
 * VIEW). Khớp theo tiền tố dài nhất như mục menu; `[id]` khớp một đoạn đường dẫn bất kỳ.
 */
const extraPageRules: { pattern: RegExp; permission: string }[] = [
  { pattern: /^\/stock\/imports\/new(\/|$)/, permission: "STOCK_IMPORTS.ADD" },
  { pattern: /^\/stock\/exports\/new(\/|$)/, permission: "STOCK_EXPORTS.ADD" },
  { pattern: /^\/stock\/inventory-counts\/new(\/|$)/, permission: "INVENTORY_COUNTS.ADD" },
  { pattern: /^\/cost-checks\/new(\/|$)/, permission: "COST_CHECKS.ADD" },
  { pattern: /^\/material-transfers\/new(\/|$)/, permission: "MATERIAL_TRANSFERS.ADD" },
  { pattern: /^\/material-transfers\/[^/]+\/edit(\/|$)/, permission: "MATERIAL_TRANSFERS.EDIT" },
  { pattern: /^\/stock-checks\/new(\/|$)/, permission: "STOCK_CHECKS.ADD" },
  { pattern: /^\/stock-checks\/[^/]+\/edit(\/|$)/, permission: "STOCK_CHECKS.EDIT" },
  { pattern: /^\/material-waste\/new(\/|$)/, permission: "MATERIAL_WASTE.ADD" },
  { pattern: /^\/material-waste\/[^/]+\/edit(\/|$)/, permission: "MATERIAL_WASTE.EDIT" },
  { pattern: /^\/orders\/[^/]+\/confirm(\/|$)/, permission: "ORDERS.APPROVE" },
];

/** Mã quyền cần để mở một đường dẫn, hoặc null nếu trang không bị giới hạn (vd /profile). */
export function requiredPermissionFor(pathname: string): string | null {
  const extra = extraPageRules.find((rule) => rule.pattern.test(pathname));
  if (extra) return extra.permission;

  let best: NavItem | null = null;
  for (const item of navSections.flatMap((section) => section.items)) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.permission ?? null;
}
