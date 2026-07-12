import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Customer, FinishedGoodItem, PagedResult, Product, ProductGroup, Supplier, Unit, Warehouse } from "@/types";

function useList<T>(key: string, path: string) {
  return useQuery({
    queryKey: [key, "all"],
    queryFn: () => api.get<PagedResult<T>>(path, { pageSize: 500 }).then((r) => r.items),
  });
}

export const useWarehouses = () => useList<Warehouse>("warehouses", "/warehouses");
export const useProductGroups = () => useList<ProductGroup>("product-groups", "/product-groups");
export const useUnits = () => useList<Unit>("units", "/units");
export const useSuppliers = () => useList<Supplier>("suppliers", "/suppliers");
export const useCustomers = () => useList<Customer>("customers", "/customers");
export const useProducts = () => useList<Product>("products", "/products");
export const useFinishedGoodItems = () => useList<FinishedGoodItem>("finished-good-items", "/finished-good-items");

export interface ProductStockLevel {
  productId: string;
  quantity: number;
}

export function useProductStock(warehouseId: string) {
  return useQuery({
    queryKey: ["product-stock", warehouseId],
    queryFn: () => api.get<{ items: ProductStockLevel[] }>("/product-stock", { warehouseId }).then((r) => r.items),
    enabled: Boolean(warehouseId),
  });
}
