import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
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
 * ngừng dùng không lẫn vào danh sách chọn — trang quản lý danh mục vẫn dùng bản không lọc. */
export const useProducts = (options?: { activeOnly?: boolean }) =>
  useList<Product>("products", "/products", options?.activeOnly ? { active: "true" } : undefined);
export const useFinishedGoodItems = () => useList<FinishedGoodItem>("finished-good-items", "/finished-good-items");
