import { labels } from "@/lib/format";
import type { StockImport, Warehouse } from "@/types";

/** Hình thức thanh toán — danh sách giống server (`transactionFormEnum`). */
export const formOptions = ["CASH", "BANK_TRANSFER", "DEBT", "OTHER"].map((value) => ({ value, label: labels.transactionForm(value) }));

/**
 * Chỉ còn PURCHASE và OTHER. `CUSTOMER_RETURN` bỏ cùng bảng Khách hàng; `TRANSFER_IN` bỏ vì Check
 * Cost đã cộng hàng điều chuyển ở một cột riêng, để ở đây là cộng hai lần.
 */
export const typeOptions = ["PURCHASE", "OTHER"].map((value) => ({ value, label: labels.stockImportType(value) }));

/** Thành tiền phiếu không lưu trong DB — cộng lại từ các dòng, giống bản web. */
export const stockImportTotal = (row: StockImport) => row.items.reduce((sum, item) => sum + Number(item.costAmount), 0);

/**
 * Cộng VAT vào một số tiền để HIỂN THỊ — chép từ `apps/web/src/lib/vat.ts`, đổi một bên phải đổi bên kia.
 * `vatPercent` là PHẦN TRĂM (8 = 8%); NULL/rỗng/0 coi như không VAT. Làm tròn tới đồng.
 */
export function withVat(amount: number | string, vatPercent: number | string | null | undefined): number {
  const pct = vatPercent == null || vatPercent === "" ? 0 : Number(vatPercent);
  const factor = Number.isFinite(pct) && pct > 0 ? 1 + pct / 100 : 1;
  return Math.round(Number(amount) * factor);
}

/** `8.00` → `8%`, NULL → `—`. */
export function formatVatPercent(vatPercent: number | string | null | undefined): string {
  if (vatPercent == null || vatPercent === "") return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(vatPercent))}%`;
}

/** Tổng tiền có VAT — dùng VAT% CHỐT trên từng dòng, không phải VAT danh mục hiện hành. */
export const stockImportVatTotal = (row: StockImport) =>
  row.items.reduce((sum, item) => sum + withVat(item.costAmount, item.vatPercent), 0);

/** Một quán một kho, nên "phiếu này của quán nào" trả lời bằng chủ kho; kho không có quán thì lấy tên kho. */
export const shopLabel = (warehouse: Warehouse) => warehouse.shopUser?.name ?? warehouse.name;
