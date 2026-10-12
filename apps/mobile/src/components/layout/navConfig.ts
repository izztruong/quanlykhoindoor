import type { Ionicons } from "@expo/vector-icons";
import type { Href } from "expo-router";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export interface NavItem {
  label: string;
  /**
   * Thiếu `href` = màn hình chưa dựng xong: menu vẫn hiện mục đó kèm nhãn "Sắp có" nhưng không bấm
   * được. Để trống thay vì ghi đường dẫn chưa tồn tại, nhờ vậy typedRoutes bắt được lỗi gõ sai.
   */
  href?: Href;
  /** Mã "RESOURCE.ACTION"; thiếu quyền thì mục bị ẩn. */
  permission: string;
  icon: IoniconName;
}

export interface NavSection {
  label: string;
  icon: IoniconName;
  items: NavItem[];
}

/**
 * Giữ đúng nhóm và mã quyền của bản web (apps/web/src/components/layout/nav-config.ts) để hai bên
 * không lệch nhau. Khác một điểm: mọi mục nhập/xuất Excel bị bỏ vì app không làm Excel.
 *
 * Nhóm "Kiểm toán" từng là tab Báo cáo riêng; cả nhóm đã bị xoá cùng phần kho tổng nên app còn 3 tab.
 */
export const navSections: NavSection[] = [
  {
    label: "Order",
    icon: "cart-outline",
    items: [
      { label: "Danh sách đơn hàng", href: "/orders", permission: "ORDERS.VIEW", icon: "receipt-outline" },
      { label: "Tạo đơn hàng", href: "/orders/new", permission: "ORDERS.ADD", icon: "add-circle-outline" },
      { label: "Order nhanh", href: "/orders/quick", permission: "ORDERS.ADD", icon: "flash-outline" },
    ],
  },
  {
    label: "Tài chính",
    icon: "wallet-outline",
    items: [
      { label: "Phiếu đề xuất chi", href: "/expense-proposals", permission: "EXPENSE_PROPOSALS.VIEW", icon: "document-text-outline" },
      { label: "Chi chốt ca", href: "/shift-expenses", permission: "SHIFT_EXPENSES.VIEW", icon: "cash-outline" },
      { label: "Chi ngoài", href: "/other-expenses", permission: "OTHER_EXPENSES.VIEW", icon: "wallet-outline" },
    ],
  },
  {
    label: "Kho",
    icon: "cube-outline",
    items: [
      { label: "Phiếu nhập kho", href: "/stock/imports", permission: "STOCK_IMPORTS.VIEW", icon: "arrow-down-circle-outline" },
      { label: "Phiếu Check Cost", href: "/cost-checks", permission: "COST_CHECKS.VIEW", icon: "calculator-outline" },
      { label: "Phiếu điều chuyển", href: "/material-transfers", permission: "MATERIAL_TRANSFERS.VIEW", icon: "swap-horizontal-outline" },
    ],
  },
  {
    label: "Kiểm kê quán",
    icon: "clipboard-outline",
    items: [
      { label: "Phiếu kiểm kê", href: "/stock-checks", permission: "STOCK_CHECKS.VIEW", icon: "clipboard-outline" },
      { label: "Phiếu huỷ nguyên liệu", href: "/material-waste", permission: "MATERIAL_WASTE.VIEW", icon: "trash-outline" },
    ],
  },
  {
    label: "Danh mục",
    icon: "albums-outline",
    items: [
      { label: "Hàng hoá", href: "/catalog/products", permission: "PRODUCTS.VIEW", icon: "pricetag-outline" },
      { label: "Nhóm hàng hoá", href: "/catalog/product-groups", permission: "PRODUCT_GROUPS.VIEW", icon: "grid-outline" },
      { label: "Đơn vị tính", href: "/catalog/units", permission: "UNITS.VIEW", icon: "resize-outline" },
      { label: "Kho hàng", href: "/catalog/warehouses", permission: "WAREHOUSES.VIEW", icon: "business-outline" },
      { label: "Nhà cung cấp", href: "/catalog/suppliers", permission: "SUPPLIERS.VIEW", icon: "people-outline" },
      { label: "Đồ thành phẩm", href: "/catalog/finished-goods", permission: "FINISHED_GOODS.VIEW", icon: "cafe-outline" },
    ],
  },
  {
    label: "Quản trị",
    icon: "shield-checkmark-outline",
    items: [
      { label: "Tài khoản người dùng", href: "/admin/users", permission: "USERS.VIEW", icon: "people-circle-outline" },
      { label: "Vai trò & phân quyền", href: "/admin/roles", permission: "ROLES.VIEW", icon: "key-outline" },
    ],
  },
];

/** Lưới "Thao tác nhanh" ở trang chủ — lối tắt tới việc quán làm hằng ngày. */
export const quickActions: { label: string; href: Href; permission: string; icon: IoniconName }[] = [
  { label: "Tạo đơn hàng", href: "/orders/new", permission: "ORDERS.ADD", icon: "cart-outline" },
  { label: "Order nhanh", href: "/orders/quick", permission: "ORDERS.ADD", icon: "flash-outline" },
  { label: "Kiểm kê", href: "/stock-checks/new", permission: "STOCK_CHECKS.ADD", icon: "clipboard-outline" },
  { label: "Huỷ nguyên liệu", href: "/material-waste/new", permission: "MATERIAL_WASTE.ADD", icon: "trash-outline" },
  { label: "Chi chốt ca", href: "/shift-expenses", permission: "SHIFT_EXPENSES.VIEW", icon: "cash-outline" },
];
