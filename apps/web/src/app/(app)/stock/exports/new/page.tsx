"use client";

import { StockTransactionForm } from "@/components/stock/StockTransactionForm";
import { stockExportHooks } from "@/hooks/useStockTransactions";

const typeOptions = [
  { value: "SALE", label: "Xuất bán" },
  { value: "SUPPLIER_RETURN", label: "Trả nhà cung cấp" },
  { value: "TRANSFER_OUT", label: "Chuyển kho đi" },
  { value: "DAMAGE", label: "Xuất huỷ" },
  { value: "OTHER", label: "Khác" },
];

export default function NewStockExportPage() {
  return (
    <StockTransactionForm
      title="Tạo phiếu xuất kho"
      description="Ghi nhận hàng hoá xuất khỏi kho."
      typeOptions={typeOptions}
      useCreate={stockExportHooks.useCreate}
      redirectBase="/stock/exports"
    />
  );
}
