import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ProductShopItemInput {
  productId: string;
  assigned: boolean;
}

interface ProductShopResponse {
  shopUserId: string;
  productIds: string[];
  /** Hàng mà CHÍNH quán này đã từng kiểm khác 0 — chỉ có ở GET, dùng để hiện nhãn cảnh báo. */
  countedProductIds?: string[];
}

export interface ProductShopWarning {
  code: string;
  name: string;
}

/** Hàng hoá đã gán cho một quán. MẢNG RỖNG = chưa gán gì, tức quán đó đang thấy mọi hàng. */
export function useProductShop(shopUserId?: string) {
  return useQuery({
    queryKey: ["product-shops", shopUserId ?? "none"],
    queryFn: () => api.get<ProductShopResponse>("/product-shops", { shopUserId }),
    enabled: Boolean(shopUserId),
  });
}

export function useSaveProductShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { shopUserId: string; items: ProductShopItemInput[]; confirmWarnings?: boolean }) =>
      api.put<ProductShopResponse>("/product-shops", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["product-shops", data.shopUserId] });
      // Mọi ô chọn hàng hoá của quán đều lọc theo danh sách này.
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * Hai danh sách cảnh báo trong câu 409. `hasHistory` là cái nặng hơn: ẩn một hàng quán đang có tồn
 * làm Check Cost tính tồn đầu/cuối kỳ bằng 0, nên chênh lệch ra số dương lớn vô cớ.
 */
export function readProductShopWarnings(error: unknown): {
  willBecomeGlobal: ProductShopWarning[];
  hasHistory: ProductShopWarning[];
} {
  const data = (error as { data?: { willBecomeGlobal?: unknown; hasHistory?: unknown } } | null)?.data;
  const pick = (v: unknown) => (Array.isArray(v) ? (v as ProductShopWarning[]) : []);
  return { willBecomeGlobal: pick(data?.willBecomeGlobal), hasHistory: pick(data?.hasHistory) };
}
