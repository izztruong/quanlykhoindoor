"use client";

import { StockTransactionForm } from "@/components/stock/StockTransactionForm";
import { stockImportHooks } from "@/hooks/useStockTransactions";

const typeOptions = [
  { value: "PURCHASE", label: "Nhập mua" },
  { value: "CUSTOMER_RETURN", label: "Khách trả hàng" },
  { value: "TRANSFER_IN", label: "Chuyển kho đến" },
  { value: "OTHER", label: "Khác" },
];

export default function NewStockImportPage() {
  return (
    <StockTransactionForm
      title="Tạo phiếu nhập kho"
      description="Ghi nhận hàng hoá nhập vào kho."
      typeOptions={typeOptions}
      useCreate={stockImportHooks.useCreate}
      redirectBase="/stock/imports"
    />
  );
}
