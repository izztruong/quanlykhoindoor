import { stockImportHooks, stockExportHooks } from "@/hooks/useStockTransactions";
import { labels } from "@/lib/format";
import type { StockTransaction } from "@/types";

export type StockVariant = "import" | "export";
export const statusOptions = ["COMPLETED", "DRAFT", "CANCELLED"].map((value) => ({ value, label: labels.transactionStatus(value) }));
export const formOptions = ["CASH", "BANK_TRANSFER", "DEBT", "OTHER"].map((value) => ({ value, label: labels.transactionForm(value) }));
export const stockConfig = {
  import: { title: "Phiếu nhập kho", endpoint: "/stock-imports", base: "/stock/imports", resource: "STOCK_IMPORTS", hooks: stockImportHooks,
    typeLabel: labels.stockImportType, typeOptions: ["PURCHASE", "CUSTOMER_RETURN", "TRANSFER_IN", "OTHER"].map((value) => ({ value, label: labels.stockImportType(value) })) },
  export: { title: "Phiếu xuất kho", endpoint: "/stock-exports", base: "/stock/exports", resource: "STOCK_EXPORTS", hooks: stockExportHooks,
    typeLabel: labels.stockExportType, typeOptions: ["SALE", "SUPPLIER_RETURN", "TRANSFER_OUT", "DAMAGE", "OTHER"].map((value) => ({ value, label: labels.stockExportType(value) })) },
} as const;
export const stockTotal = (row: StockTransaction) => row.items.reduce((sum, item) => sum + Number(item.costAmount), 0);
