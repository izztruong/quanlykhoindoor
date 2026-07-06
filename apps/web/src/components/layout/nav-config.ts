import type { LucideIcon } from "lucide-react";
import { Boxes, ClipboardCheck, ShieldCheck, ShoppingCart, Warehouse } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
}

export interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  adminOnly?: boolean;
}

export const navSections: NavSection[] = [
  {
    label: "Kiểm toán",
    icon: ClipboardCheck,
    adminOnly: true,
    items: [
      { label: "Kiểm kê", href: "/audit/inventory-count" },
      { label: "Chi tiết xuất", href: "/audit/export-detail" },
      { label: "Tổng hợp xuất", href: "/audit/export-summary" },
      { label: "Chi tiết nhập", href: "/audit/import-detail" },
      { label: "Tổng hợp nhập", href: "/audit/import-summary" },
    ],
  },
  {
    label: "Order",
    icon: ShoppingCart,
    items: [
      { label: "Danh sách đơn hàng", href: "/orders" },
      { label: "Tạo đơn hàng", href: "/orders/new" },
    ],
  },
  {
    label: "Kho",
    icon: Warehouse,
    adminOnly: true,
    items: [
      { label: "Tồn kho hiện tại", href: "/stock/current" },
      { label: "Phiếu nhập kho", href: "/stock/imports" },
      { label: "Phiếu xuất kho", href: "/stock/exports" },
      { label: "Phiếu kiểm kê", href: "/stock/inventory-counts" },
    ],
  },
  {
    label: "Danh mục",
    icon: Boxes,
    adminOnly: true,
    items: [
      { label: "Hàng hoá", href: "/catalog/products" },
      { label: "Nhóm hàng hoá", href: "/catalog/product-groups" },
      { label: "Đơn vị tính", href: "/catalog/units" },
      { label: "Kho hàng", href: "/catalog/warehouses" },
      { label: "Nhà cung cấp", href: "/catalog/suppliers" },
      { label: "Khách hàng", href: "/catalog/customers" },
    ],
  },
  {
    label: "Quản trị",
    icon: ShieldCheck,
    adminOnly: true,
    items: [{ label: "Tài khoản người dùng", href: "/admin/users" }],
  },
];
