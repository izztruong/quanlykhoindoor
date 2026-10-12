import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { AffectedCostCheck, StockImport } from "@/types";

/**
 * Phiếu nhập kho. Trước đây file này là `useStockTransactions` sinh chung hai bộ hook cho phiếu
 * nhập và phiếu xuất; phiếu xuất đã bị xoá khỏi server cùng phần kho tổng nên không còn gì để
 * tham số hoá — một endpoint, một bộ hook.
 */
export interface StockImportFilter {
  warehouseId?: string;
  from?: string;
  to?: string;
}

export interface StockImportItemInput {
  productId: string;
  quantity: number;
  costPrice: number;
  note?: string;
}

/**
 * Khác phiếu xuất cũ ở ba chỗ, đều do server chốt (stockImports.schemas.ts):
 * `supplierId` BẮT BUỘC (mỗi phiếu một chuyến giao, nhờ đó `transactionAt` của phiếu làm được mốc kỳ
 * Check Cost), KHÔNG có `customerId`, và KHÔNG gửi `status` — mọi phiếu luôn COMPLETED.
 */
export interface StockImportInput {
  type: string;
  /** ISO. Phải có GIỜ — đây là mốc kỳ Check Cost dùng. */
  transactionAt: string;
  form: string;
  note?: string;
  warehouseId: string;
  supplierId: string;
  items: StockImportItemInput[];
}

export function useStockImport(id: string) {
  return useQuery({
    queryKey: ["stock-imports", id],
    queryFn: () => api.get<StockImport>(`/stock-imports/${id}`),
    enabled: Boolean(id),
  });
}

/** Mọi đường ghi đều trả về danh sách phiếu Check Cost cần tạo lại. */
export function useCreateStockImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockImportInput) => api.post<StockImport & { affectedCostChecks: AffectedCostCheck[] }>("/stock-imports", data),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stock-imports"] }),
        // Check Cost và ô Trang chủ đọc số từ phiếu nhập.
        queryClient.invalidateQueries({ queryKey: ["cost-checks"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]),
  });
}
