"use client";

import { StockImportForm } from "@/components/stock/StockImportForm";
import { useStockImport } from "@/hooks/useStockImports";

/** Phải nạp phiếu trước mới dựng được form với giá trị cũ, nên tách một lớp client mỏng. */
export function StockImportEditClient({ id }: { id: string }) {
  const { data: item, isLoading } = useStockImport(id);
  if (isLoading || !item) return <p className="text-slate-400">Đang tải...</p>;
  return <StockImportForm existing={item} />;
}
