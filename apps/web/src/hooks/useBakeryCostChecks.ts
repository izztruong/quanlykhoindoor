import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CostCheck, CostCheckReportRow, CostCheckStatus, PagedResult, PosCoverage } from "@/types";

/** Doanh thu bánh bán ra tách theo người mua. `shopUserId = null` = bán ngoài. */
export interface BakeryRevenueByBuyer {
  shopUserId: string | null;
  shopName: string;
  quantity: number;
  revenue: number;
}

/**
 * Khối tổng hợp của tiệm bánh — KHÁC hẳn `CostCheckFinancialSummary` của quán: không có Trà/ĐAV/cốc,
 * doanh thu là giá xuất, và có thêm phần lệch tuyệt đối.
 */
export interface BakeryFinancialSummary {
  revenue: number;
  revenueByBuyer: BakeryRevenueByBuyer[];
  soldQuantity: number;
  expectedMaterial: number;
  actualMaterial: number;
  wasteMaterial: number;
  variance: number;
  expectedMaterialPct: number;
  actualMaterialPct: number;
  variancePct: number;
  wasteMaterialPct: number;
}

export interface BakeryCostCheck extends Omit<CostCheck, "financialSummary"> {
  bakerySummary?: BakeryFinancialSummary;
  report?: CostCheckReportRow[];
  posCoverage?: PosCoverage | null;
}

export function useBakeryCostCheckList(filter: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["bakery-cost-checks", filter],
    queryFn: () => api.get<PagedResult<BakeryCostCheck>>("/bakery-cost-checks", filter),
  });
}

export function useBakeryCostCheck(id: string) {
  return useQuery({
    queryKey: ["bakery-cost-checks", id],
    queryFn: () => api.get<BakeryCostCheck>(`/bakery-cost-checks/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateBakeryCostCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      userId: string;
      openingStockCheckId: string;
      closingStockCheckId: string;
      note?: string;
      /** Cộng VAT vào giá vốn và giá xuất khi tính phiếu. Server chốt cứng vào phiếu, mặc định false. */
      useVat?: boolean;
    }) =>
      api.post<BakeryCostCheck>("/bakery-cost-checks", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bakery-cost-checks"] }),
  });
}

export function useUpdateBakeryCostCheckStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: CostCheckStatus) => api.patch<BakeryCostCheck>(`/bakery-cost-checks/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bakery-cost-checks"] }),
  });
}
