import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OrderConsolidationReport } from "@/types";

/** Gom đơn cho đạt ngưỡng miễn ship — số liệu toàn chuỗi, chỉ admin đọc được. */
export function useOrderConsolidation() {
  return useQuery({
    queryKey: ["order-consolidation"],
    queryFn: () => api.get<OrderConsolidationReport>("/order-consolidation"),
  });
}
