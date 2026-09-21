import { HttpError } from "../../utils/httpError";

/**
 * Nguồn sự thật duy nhất của mã quyền. Mỗi mã có dạng `RESOURCE.ACTION`, lưu thẳng trong
 * `Role.permissions`. Web không chép lại danh sách này mà đọc qua GET /api/roles/catalog.
 *
 * Thêm một trang/nghiệp vụ mới:
 *   1. khai một dòng ở đây,
 *   2. gắn `requirePermission("TÊN")` cho MỌI route của nó (kể cả GET),
 *   3. gắn `permission` cho mục menu trong apps/web/src/components/layout/nav-config.ts.
 */
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "RECEIVE", "APPROVE", "ADVANCE", "COMPLETE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  VIEW: "Xem",
  ADD: "Thêm",
  EDIT: "Cập nhật",
  DELETE: "Xoá",
  RECEIVE: "Nhận hàng",
  APPROVE: "Duyệt đơn",
  ADVANCE: "Tạm ứng",
  COMPLETE: "Hoàn thành",
};

const CRUD: PermissionAction[] = ["VIEW", "ADD", "EDIT", "DELETE"];

export const PERMISSION_RESOURCES = [
  { resource: "AUDIT_REPORTS", label: "Báo cáo kiểm toán", group: "Kiểm toán", actions: ["VIEW"] },

  // EDIT/DELETE sửa/xoá phiếu còn Chờ duyệt; EDIT còn dùng để gửi bảng hạng mục dự kiến mới đi duyệt
  // bổ sung · APPROVE = duyệt/từ chối (chỉ khi là người duyệt của phiếu, hoặc vai trò hệ thống) ·
  // ADVANCE = tạm ứng và tạm ứng thêm · COMPLETE = khai thực chi, bấm Hoàn thành, đính chứng từ.
  {
    resource: "EXPENSE_PROPOSALS",
    label: "Phiếu đề xuất chi & tạm ứng",
    group: "Tài chính",
    actions: ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE", "ADVANCE", "COMPLETE"],
  },
  { resource: "SHIFT_EXPENSES", label: "Chi chốt ca", group: "Tài chính", actions: CRUD },

  // ADD = tạo đơn, sửa & huỷ đơn nháp của mình · RECEIVE = nhận hàng, xác nhận SL báo ·
  // APPROVE = xác nhận đơn (sinh phiếu xuất kho), huỷ đơn ở mọi trạng thái, sửa ngày nhận.
  { resource: "ORDERS", label: "Đơn hàng", group: "Order", actions: ["VIEW", "ADD", "RECEIVE", "APPROVE"] },

  { resource: "STOCK_IMPORTS", label: "Phiếu nhập kho", group: "Kho", actions: ["VIEW", "ADD"] },
  { resource: "STOCK_EXPORTS", label: "Phiếu xuất kho", group: "Kho", actions: ["VIEW", "ADD"] },
  { resource: "INVENTORY_COUNTS", label: "Phiếu kiểm kê kho", group: "Kho", actions: ["VIEW", "ADD", "EDIT"] },
  { resource: "COST_CHECKS", label: "Phiếu Check Cost", group: "Kho", actions: ["VIEW", "ADD", "EDIT"] },
  { resource: "MATERIAL_TRANSFERS", label: "Phiếu điều chuyển", group: "Kho", actions: ["VIEW", "ADD", "EDIT"] },

  { resource: "STOCK_CHECKS", label: "Phiếu kiểm kê quán", group: "Kiểm kê quán", actions: ["VIEW", "ADD", "EDIT"] },
  { resource: "MATERIAL_WASTE", label: "Phiếu huỷ nguyên liệu", group: "Kiểm kê quán", actions: ["VIEW", "ADD", "EDIT"] },

  { resource: "PRODUCTS", label: "Hàng hoá", group: "Danh mục", actions: CRUD },
  { resource: "PRODUCT_GROUPS", label: "Nhóm hàng hoá", group: "Danh mục", actions: CRUD },
  { resource: "UNITS", label: "Đơn vị tính", group: "Danh mục", actions: CRUD },
  { resource: "WAREHOUSES", label: "Kho hàng", group: "Danh mục", actions: CRUD },
  { resource: "SUPPLIERS", label: "Nhà cung cấp", group: "Danh mục", actions: CRUD },
  { resource: "CUSTOMERS", label: "Khách hàng", group: "Danh mục", actions: CRUD },
  { resource: "FINISHED_GOODS", label: "Đồ thành phẩm & công thức", group: "Danh mục", actions: CRUD },

  { resource: "USERS", label: "Tài khoản người dùng", group: "Quản trị", actions: CRUD },
  { resource: "ROLES", label: "Vai trò & phân quyền", group: "Quản trị", actions: CRUD },
  { resource: "REORDER_THRESHOLDS", label: "Định lượng Order nhanh", group: "Quản trị", actions: ["VIEW", "EDIT"] },
  { resource: "SUPPLIER_PRICES", label: "Giá theo Nhà cung cấp", group: "Quản trị", actions: ["VIEW", "EDIT"] },
  { resource: "PURCHASE_SUMMARY", label: "Tổng hợp đặt NCC", group: "Quản trị", actions: ["VIEW"] },
  { resource: "DEADLINES", label: "Hạn order & kiểm kê", group: "Quản trị", actions: ["VIEW", "EDIT"] },
] as const satisfies readonly { resource: string; label: string; group: string; actions: readonly PermissionAction[] }[];

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number]["resource"];

/**
 * Mã phạm vi — KHÔNG dùng để chặn route, chỉ để thu hẹp dữ liệu (đưa vào `where`). Có mã này thì
 * thấy và thao tác được dữ liệu của mọi quán; không có thì chỉ dữ liệu chính mình tạo ra. Dùng
 * chung một mã cho mọi module gắn với quán, để không có chuyện thấy đơn mà không thấy phiếu kiểm.
 */
export const SCOPE_ALL_CODE = "DATA.SCOPE_ALL";
export const SCOPE_ALL_LABEL = "Xem & thao tác dữ liệu của mọi quán";

export function allPermissionCodes(): string[] {
  return [...PERMISSION_RESOURCES.flatMap((r) => r.actions.map((a) => `${r.resource}.${a}`)), SCOPE_ALL_CODE];
}

/**
 * Chuẩn hoá danh sách mã sắp lưu cho một vai trò, đồng thời chặn leo quyền: người thao tác chỉ
 * được THÊM hoặc BỚT những mã chính họ đang có. Mã vai trò đã có sẵn mà người sửa không nắm thì
 * phải giữ nguyên — nhờ vậy người quản lý một phần vẫn sửa được vai trò rộng hơn mình ở những ô
 * mình nắm, nhưng không gỡ được quyền mình không nắm. Luật so với quyền của người cấp nên tự bao
 * cả các mã thêm về sau. Vượt quyền thì BÁO LỖI chứ không lọc im.
 */
export function sanitizePermissions(
  requested: string[],
  granter: { isSystem: boolean; permissions: string[] },
  current: string[] = [],
): string[] {
  const valid = new Set(allPermissionCodes());
  const unknown = requested.filter((c) => !valid.has(c));
  if (unknown.length > 0) throw new HttpError(400, `Mã quyền không hợp lệ: ${unknown.join(", ")}`);

  const clean = [...new Set(requested)];
  if (!granter.isSystem) {
    const grantable = new Set(granter.permissions);
    const before = new Set(current);
    const after = new Set(clean);
    const changed = [...clean.filter((c) => !before.has(c)), ...current.filter((c) => !after.has(c))];
    const beyond = changed.filter((c) => !grantable.has(c));
    if (beyond.length > 0) {
      throw new HttpError(403, `Bạn không thể cấp hoặc gỡ quyền mà chính bạn không có: ${beyond.join(", ")}`);
    }
  }
  return clean.sort();
}
