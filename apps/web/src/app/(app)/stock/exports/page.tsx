"use client";

import { StockTransactionList } from "@/components/stock/StockTransactionList";
import { stockExportHooks } from "@/hooks/useStockTransactions";
import { labels } from "@/lib/format";

export default function StockExportsPage() {
  return (
    <StockTransactionList
      title="Phiếu xuất kho"
      description="Danh sách phiếu xuất kho, là nguồn dữ liệu cho báo cáo Chi tiết/Tổng hợp xuất."
      useList={stockExportHooks.useList}
      newHref="/stock/exports/new"
      typeLabel={labels.stockExportType}
    />
  );
}
