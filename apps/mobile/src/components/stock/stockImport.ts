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

/** Một quán một kho, nên "phiếu này của quán nào" trả lời bằng chủ kho; kho không có quán thì lấy tên kho. */
export const shopLabel = (warehouse: Warehouse) => warehouse.shopUser?.name ?? warehouse.name;
