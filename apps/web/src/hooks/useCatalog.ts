import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FinishedGoodItem, PagedResult, Product, ProductGroup, Supplier, Unit, Warehouse } from "@/types";

function useList<T>(key: string, path: string, params?: Record<string, string>) {
  return useQuery({
    queryKey: [key, "all", params ?? null],
    queryFn: () => api.get<PagedResult<T>>(path, { pageSize: 500, ...params }).then((r) => r.items),
  });
}

export const useWarehouses = () => useList<Warehouse>("warehouses", "/warehouses");
export const useProductGroups = () => useList<ProductGroup>("product-groups", "/product-groups");
export const useUnits = () => useList<Unit>("units", "/units");
export const useSuppliers = () => useList<Supplier>("suppliers", "/suppliers");
/** Pass `{ activeOnly: true }` on hàng hoá pickers used to create phiếu/đơn hàng, so hàng hoá đã
 * ngừng dùng không lẫn vào danh sách chọn — trang quản lý danh mục vẫn dùng bản không lọc.
 *
 * `shopUserId` lọc theo danh sách hàng hoá của quán (hàng chưa gán quán nào thì mọi quán đều
 * thấy — quy ước ở `utils/shopMenu.ts` bên server). Bỏ trống = toàn bộ danh mục. */
export const useProducts = (options?: { activeOnly?: boolean; shopUserId?: string }) =>
  useList<Product>("products", "/products", {
    ...(options?.activeOnly ? { active: "true" } : {}),
    ...(options?.shopUserId ? { shopUserId: options.shopUserId } : {}),
  });
/**
 * Truyền `{ shopUserId }` ở các ô chọn khi lập phiếu/nhập doanh số: chỉ ra món trong menu của quán
 * đó (món chưa gán quán nào thì mọi quán đều thấy — quy ước ghi ở `utils/shopMenu.ts` bên server).
 *
 * Bỏ trống = toàn bộ danh mục, dành cho trang quản lý danh mục và trang gán menu. Server vẫn ÉP
 * phạm vi cho tài khoản quán kể cả khi không truyền gì, nên đây chỉ là chuyện giao diện.
 */
export const useFinishedGoodItems = (options?: { shopUserId?: string }) =>
  useList<FinishedGoodItem>(
    "finished-good-items",
    "/finished-good-items",
    options?.shopUserId ? { shopUserId: options.shopUserId } : undefined,
  );


