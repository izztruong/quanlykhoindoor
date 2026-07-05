"use client";

import { StockTransactionList } from "@/components/stock/StockTransactionList";
import { stockImportHooks } from "@/hooks/useStockTransactions";
import { labels } from "@/lib/format";

export default function StockImportsPage() {
  return (
    <StockTransactionList
      title="Phiếu nhập kho"
      description="Danh sách phiếu nhập kho, là nguồn dữ liệu cho báo cáo Chi tiết/Tổng hợp nhập."
      useList={stockImportHooks.useList}
      newHref="/stock/imports/new"
      typeLabel={labels.stockImportType}
    />
  );
}
